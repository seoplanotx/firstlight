from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any


class DeidentificationError(ValueError):
    """Raised when data intended for cloud AI still contains local identity context."""


PRIVACY_MODE_LOCAL_ONLY = "local_only"
PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST = "deidentified_ai_assist"
ALLOWED_PRIVACY_MODES = {PRIVACY_MODE_LOCAL_ONLY, PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST}

_BLOCKED_KEYS = {
    "address",
    "birth_date",
    "contact",
    "date_of_birth",
    "display_name",
    "dob",
    "doctor",
    "email",
    "facility",
    "file_path",
    "hospital",
    "id",
    "medical_record_number",
    "mrn",
    "notes",
    "patient",
    "patient_id",
    "patient_name",
    "phone",
    "physician",
    "profile_id",
    "profile_name",
    "street_address",
}

_ALLOWED_ID_KEYS = {"external_identifier", "source_identifier"}
_ALLOWED_TASKS = {
    "questions",
    "clinician_questions",
    "patient_summary",
    "clinician_summary",
    "source_summary",
    "missing_info_prompt",
}
_ALLOWED_KEYS_BY_PATH = {
    "$packet": {"privacy_mode", "task", "profile_context", "findings", "safety_instructions"},
    "$packet.profile_context": {
        "cancer_type",
        "subtype",
        "stage_or_context",
        "current_therapy_status",
        "general_location",
        "travel_radius_miles",
        "would_consider",
        "would_not_consider",
        "biomarkers",
        "therapy_history",
    },
    "$packet.profile_context.biomarkers[]": {"name", "variant", "status"},
    "$packet.profile_context.therapy_history[]": {"therapy_name", "therapy_type", "line_of_therapy", "status"},
    "$packet.findings[]": {
        "type",
        "title",
        "source_name",
        "source_url",
        "external_identifier",
        "published_at",
        "structured_tags",
        "raw_summary",
        "normalized_summary",
        "why_it_surfaced",
        "why_it_may_not_fit",
        "matching_gaps",
    },
}
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)")
_LOCAL_PATH_RE = re.compile(r"(?:/Users/|/home/|[A-Z]:\\)", re.IGNORECASE)
_CLINICIAN_OR_FACILITY_RE = re.compile(r"\b(?:dr\.?|doctor|hospital|clinic|medical center)\b", re.IGNORECASE)
_ZIP_RE = re.compile(r"\b\d{5}(?:-\d{4})?\b")

_US_STATES = {
    "ALABAMA", "ALASKA", "ARIZONA", "ARKANSAS", "CALIFORNIA", "COLORADO", "CONNECTICUT",
    "DELAWARE", "FLORIDA", "GEORGIA", "HAWAII", "IDAHO", "ILLINOIS", "INDIANA", "IOWA",
    "KANSAS", "KENTUCKY", "LOUISIANA", "MAINE", "MARYLAND", "MASSACHUSETTS", "MICHIGAN",
    "MINNESOTA", "MISSISSIPPI", "MISSOURI", "MONTANA", "NEBRASKA", "NEVADA", "NEW HAMPSHIRE",
    "NEW JERSEY", "NEW MEXICO", "NEW YORK", "NORTH CAROLINA", "NORTH DAKOTA", "OHIO", "OKLAHOMA",
    "OREGON", "PENNSYLVANIA", "RHODE ISLAND", "SOUTH CAROLINA", "SOUTH DAKOTA", "TENNESSEE",
    "TEXAS", "UTAH", "VERMONT", "VIRGINIA", "WASHINGTON", "WEST VIRGINIA", "WISCONSIN", "WYOMING",
}
_US_STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
    "VA", "WA", "WV", "WI", "WY",
}


def _get_value(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _compact_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def generalize_location_label(location_label: str | None) -> str | None:
    """Return only state/region-level location, never street/city-level detail."""

    text = _compact_string(location_label)
    if not text:
        return None

    cleaned = _ZIP_RE.sub("", text).strip(" ,")
    upper_cleaned = cleaned.upper()
    if upper_cleaned in _US_STATE_CODES or upper_cleaned in _US_STATES:
        return cleaned

    if "," not in cleaned:
        return None

    region = cleaned.split(",")[-1].strip()
    region = _ZIP_RE.sub("", region).strip(" ,")
    upper_region = region.upper()
    if upper_region in _US_STATE_CODES or upper_region in _US_STATES:
        return region
    return None


def _serialize_biomarkers(profile: Any) -> list[dict[str, str | None]]:
    biomarkers = _get_value(profile, "biomarkers", []) or []
    serialized: list[dict[str, str | None]] = []
    for biomarker in biomarkers:
        item = {
            "name": _compact_string(_get_value(biomarker, "name")),
            "variant": _compact_string(_get_value(biomarker, "variant")),
            "status": _compact_string(_get_value(biomarker, "status")),
        }
        if any(item.values()):
            serialized.append(item)
    return serialized


def _serialize_therapy_history(profile: Any) -> list[dict[str, str | None]]:
    therapy_history = _get_value(profile, "therapy_history", []) or []
    serialized: list[dict[str, str | None]] = []
    for therapy in therapy_history:
        item = {
            "therapy_name": _compact_string(_get_value(therapy, "therapy_name")),
            "therapy_type": _compact_string(_get_value(therapy, "therapy_type")),
            "line_of_therapy": _compact_string(_get_value(therapy, "line_of_therapy")),
            "status": _compact_string(_get_value(therapy, "status")),
        }
        if any(item.values()):
            serialized.append(item)
    return serialized


def _serialize_finding(finding: Any) -> dict[str, Any]:
    return {
        "type": _compact_string(_get_value(finding, "type")),
        "title": _compact_string(_get_value(finding, "title")),
        "source_name": _compact_string(_get_value(finding, "source_name")),
        "source_url": _compact_string(_get_value(finding, "source_url")),
        "external_identifier": _compact_string(_get_value(finding, "external_identifier")),
        "published_at": _compact_string(_get_value(finding, "published_at")),
        "structured_tags": _get_value(finding, "structured_tags", []) or [],
        "raw_summary": _compact_string(_get_value(finding, "raw_summary")),
        "normalized_summary": _compact_string(_get_value(finding, "normalized_summary")),
        "why_it_surfaced": _compact_string(_get_value(finding, "why_it_surfaced")),
        "why_it_may_not_fit": _compact_string(_get_value(finding, "why_it_may_not_fit")),
        "matching_gaps": _get_value(finding, "matching_gaps", []) or [],
    }


def build_deidentified_case_packet(
    *,
    profile: Any,
    findings: list[Any] | None = None,
    task: str,
) -> dict[str, Any]:
    """Build the only payload shape allowed to leave the device for optional AI assist."""

    profile_context = {
        "cancer_type": _compact_string(_get_value(profile, "cancer_type")),
        "subtype": _compact_string(_get_value(profile, "subtype")),
        "stage_or_context": _compact_string(_get_value(profile, "stage_or_context")),
        "current_therapy_status": _compact_string(_get_value(profile, "current_therapy_status")),
        "general_location": generalize_location_label(_get_value(profile, "location_label")),
        "travel_radius_miles": _get_value(profile, "travel_radius_miles"),
        "would_consider": _get_value(profile, "would_consider", []) or [],
        "would_not_consider": _get_value(profile, "would_not_consider", []) or [],
        "biomarkers": _serialize_biomarkers(profile),
        "therapy_history": _serialize_therapy_history(profile),
    }
    packet = {
        "privacy_mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
        "task": task,
        "profile_context": {key: value for key, value in profile_context.items() if value not in (None, "", [])},
        "findings": [_serialize_finding(finding) for finding in (findings or [])],
        "safety_instructions": [
            "Do not give treatment advice.",
            "Do not determine trial eligibility.",
            "Frame output for clinician review and discussion only.",
        ],
    }
    assert_deidentified_packet(packet)
    return packet


def assert_deidentified_packet(packet: Any) -> None:
    problems: list[str] = []

    def normalized_path(path: str) -> str:
        return re.sub(r"\[\d+\]", "[]", path)

    def visit(value: Any, path: str) -> None:
        if isinstance(value, Mapping):
            allowed_keys = _ALLOWED_KEYS_BY_PATH.get(normalized_path(path))
            for key, child in value.items():
                key_text = str(key)
                key_lower = key_text.lower()
                if allowed_keys is not None and key_text not in allowed_keys:
                    problems.append(f"unexpected key at {path}.{key_text}")
                if key_lower not in _ALLOWED_ID_KEYS and key_lower in _BLOCKED_KEYS:
                    problems.append(f"blocked identity key at {path}.{key_text}")
                visit(child, f"{path}.{key_text}")
            return
        if isinstance(value, list | tuple):
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")
            return
        if isinstance(value, str):
            if normalized_path(path) == "$packet.task" and value not in _ALLOWED_TASKS:
                problems.append(f"unexpected AI task at {path}")
            if _EMAIL_RE.search(value):
                problems.append(f"email-like value at {path}")
            if _PHONE_RE.search(value):
                problems.append(f"phone-like value at {path}")
            if _LOCAL_PATH_RE.search(value):
                problems.append(f"local-path-like value at {path}")
            if _CLINICIAN_OR_FACILITY_RE.search(value):
                problems.append(f"clinician-or-facility-like value at {path}")

    visit(packet, "$packet")
    if problems:
        raise DeidentificationError("AI payload is not de-identified: " + "; ".join(problems))
