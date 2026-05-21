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
        "stage_group",
        "general_location",
        "travel_radius_miles",
        "biomarkers",
    },
    "$packet.profile_context.biomarkers[]": {"name", "variant", "status"},
    "$packet.findings[]": {
        "type",
        "title",
        "source_name",
        "external_identifier",
        "structured_tags",
    },
}
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)")
_LOCAL_PATH_RE = re.compile(r"(?:/Users/|/home/|[A-Z]:\\)", re.IGNORECASE)
_CLINICIAN_OR_FACILITY_RE = re.compile(r"\b(?:dr\.?|doctor|hospital|clinic|medical center)\b", re.IGNORECASE)
_ZIP_RE = re.compile(r"\b\d{5}(?:-\d{4})?\b")
_EXACT_DATE_RE = re.compile(
    r"\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b"
)
_SHORT_EXACT_DATE_RE = re.compile(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2}\b")
_MONTH_DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b",
    re.IGNORECASE,
)
_MONTH_DAY_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b",
    re.IGNORECASE,
)
_CITY_STATE_RE = re.compile(
    r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2},?\s+"
    r"(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|"
    r"MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|"
    r"Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|"
    r"Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|"
    r"Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|"
    r"New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|"
    r"Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|"
    r"West Virginia|Wisconsin|Wyoming)\b"
)
_KNOWN_FACILITY_OR_PLACE_RE = re.compile(
    r"\b(?:Duke|Mayo|MD\s+Anderson|Sloan\s+Kettering|Dana[-\s]?Farber|Johns\s+Hopkins|"
    r"Cleveland\s+Clinic|Mass\s+General|Memorial\s+Sloan|UNC|UCLA|UCSF|Stanford|Vanderbilt|"
    r"Emory|Mount\s+Sinai|Cedars[-\s]?Sinai|City\s+of\s+Hope|Moffitt|Fred\s+Hutch|Roswell\s+Park)\b",
    re.IGNORECASE,
)
_SUSPICIOUS_PERSON_NAME_RE = re.compile(r"\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b")
_INITIAL_SURNAME_RE = re.compile(r"\b[A-Z]\.?(?:\s+)[A-Z][a-z]{2,}\b")
_SUSPICIOUS_UPPERCASE_NAME_RE = re.compile(r"\b[A-Z]{2,}\s+[A-Z]{2,}\b")
_STANDALONE_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_EXPECTED_LIST_PATHS = {
    "$packet.findings",
    "$packet.findings[].structured_tags",
    "$packet.profile_context.biomarkers",
    "$packet.safety_instructions",
}
_STRING_LIST_ITEM_PATHS = {
    "$packet.findings[].structured_tags[]",
    "$packet.safety_instructions[]",
}
_ALLOWED_CONTAINER_PATHS = {
    "$packet",
    "$packet.profile_context",
    "$packet.profile_context.biomarkers",
    "$packet.profile_context.biomarkers[]",
    "$packet.findings",
    "$packet.findings[]",
    "$packet.findings[].structured_tags",
    "$packet.safety_instructions",
}
_GENERIC_IDENTITY_TERMS = {
    "dad",
    "demo",
    "father",
    "mom",
    "mother",
    "patient",
    "profile",
    "sample",
    "test",
}
_NON_NAME_TITLE_WORDS = {
    "Acute",
    "Adenocarcinoma",
    "Advanced",
    "ALK",
    "BRAF",
    "BRCA",
    "Breast",
    "Cancer",
    "Carcinoma",
    "Cell",
    "Chemotherapy",
    "Clinical",
    "Colon",
    "Disease",
    "EGFR",
    "High",
    "Immunotherapy",
    "KRAS",
    "Label",
    "Leukemia",
    "Low",
    "Lung",
    "Lymphoma",
    "Melanoma",
    "Metastatic",
    "MSI",
    "Mutation",
    "Mutant",
    "Myeloid",
    "Negative",
    "Non",
    "NSCLC",
    "Open",
    "Options",
    "Pancreatic",
    "PD",
    "Phase",
    "Positive",
    "Prostate",
    "Randomized",
    "ROS1",
    "SCLC",
    "Small",
    "Solid",
    "Stage",
    "Study",
    "Targeted",
    "Therapy",
    "TMB",
    "Treatment",
    "Treatments",
    "Trial",
    "Trials",
    "Tumor",
    "Tumors",
    "Type",
    "Wild",
}
_NON_NAME_TITLE_WORDS_UPPER = {word.upper() for word in _NON_NAME_TITLE_WORDS}

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


def _looks_like_person_name(match_text: str) -> bool:
    words = match_text.split()
    upper = match_text.upper()
    if upper in _US_STATES or upper in _US_STATE_CODES:
        return False
    if any(word.upper() in _NON_NAME_TITLE_WORDS_UPPER for word in words):
        return False
    return True


def _get_value(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _compact_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _serialize_string_list(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list | tuple | set):
        raise DeidentificationError("AI payload list fields must be flat lists of strings.")
    items: list[str] = []
    for item in value:
        if item is None:
            continue
        if not isinstance(item, str):
            raise DeidentificationError("AI payload list fields must be flat lists of strings.")
        text = _compact_string(item)
        if text:
            items.append(text)
    return items


def _identity_search_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _profile_identity_terms(profile: Any) -> set[str]:
    terms: set[str] = set()
    for key in ("display_name", "patient_name", "profile_name"):
        raw_text = _compact_string(_get_value(profile, key))
        if not raw_text:
            continue
        words = [word.strip(".'’-").lower() for word in re.findall(r"[A-Za-z][A-Za-z.'’-]*", raw_text)]
        words = [word for word in words if len(word) >= 2]
        if not words:
            continue
        name_text = " ".join(word.title() for word in words)
        if key == "profile_name" and not _looks_like_person_name(name_text):
            continue
        filtered = [
            word
            for word in words
            if word not in _GENERIC_IDENTITY_TERMS and word.upper() not in _NON_NAME_TITLE_WORDS_UPPER
        ]
        if len(filtered) >= 2:
            terms.add(" ".join(filtered))
            terms.add(f"{filtered[0][0]} {filtered[-1]}")
            terms.add(f"{filtered[0][0]}. {filtered[-1]}")
        for word in filtered:
            if len(word) >= 3:
                terms.add(word)
    return {_identity_search_text(term) for term in terms if _identity_search_text(term)}


def _reject_local_identity_terms(packet: Any, profile: Any) -> None:
    terms = _profile_identity_terms(profile)
    if not terms:
        return

    problems: list[str] = []

    def visit(value: Any, path: str) -> None:
        if isinstance(value, Mapping):
            for key, child in value.items():
                visit(child, f"{path}.{key}")
            return
        if isinstance(value, list | tuple | set):
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")
            return
        if isinstance(value, str):
            searchable = _identity_search_text(value)
            for term in terms:
                if re.search(rf"\b{re.escape(term)}\b", searchable):
                    problems.append(f"local identity term at {path}")
                    break

    visit(packet, "$packet")
    if problems:
        raise DeidentificationError("AI payload is not de-identified: " + "; ".join(problems))


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


def generalize_stage_or_context(stage_or_context: str | None) -> str | None:
    """Return only a coarse stage signal from user-entered staging text."""

    text = _compact_string(stage_or_context)
    if not text:
        return None

    if re.search(r"\bstage\s*(?:iv|4)\b", text, re.IGNORECASE):
        return "Stage IV"
    if re.search(r"\bstage\s*(?:iii|3)\b", text, re.IGNORECASE):
        return "Stage III"
    if re.search(r"\bstage\s*(?:ii|2)\b", text, re.IGNORECASE):
        return "Stage II"
    if re.search(r"\bstage\s*(?:i|1)\b", text, re.IGNORECASE):
        return "Stage I"
    if re.search(r"\bmetastatic\b", text, re.IGNORECASE):
        return "metastatic"
    if re.search(r"\brecurrent\b", text, re.IGNORECASE):
        return "recurrent"
    if re.search(r"\blocali[sz]ed\b", text, re.IGNORECASE):
        return "localized"
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


def _serialize_finding(finding: Any) -> dict[str, Any]:
    return {
        "type": _compact_string(_get_value(finding, "type")),
        "title": _compact_string(_get_value(finding, "title")),
        "source_name": _compact_string(_get_value(finding, "source_name")),
        "external_identifier": _compact_string(_get_value(finding, "external_identifier")),
        "structured_tags": _serialize_string_list(_get_value(finding, "structured_tags", [])),
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
        "stage_group": generalize_stage_or_context(_get_value(profile, "stage_or_context")),
        "general_location": generalize_location_label(_get_value(profile, "location_label")),
        "travel_radius_miles": _get_value(profile, "travel_radius_miles"),
        "biomarkers": _serialize_biomarkers(profile),
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
    _reject_local_identity_terms(packet, profile)
    assert_deidentified_packet(packet)
    return packet


def assert_deidentified_packet(packet: Any) -> None:
    problems: list[str] = []

    def normalized_path(path: str) -> str:
        return re.sub(r"\[\d+\]", "[]", path)

    def visit(value: Any, path: str) -> None:
        normalized = normalized_path(path)
        if normalized in _EXPECTED_LIST_PATHS and not isinstance(value, list | tuple):
            problems.append(f"expected list at {path}")
        if normalized in _STRING_LIST_ITEM_PATHS and not isinstance(value, str):
            problems.append(f"non-string list item at {path}")
        if isinstance(value, Mapping):
            if normalized not in _ALLOWED_CONTAINER_PATHS:
                problems.append(f"unexpected nested object at {path}")
            allowed_keys = _ALLOWED_KEYS_BY_PATH.get(normalized)
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
            if normalized not in _ALLOWED_CONTAINER_PATHS:
                problems.append(f"unexpected nested list at {path}")
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")
            return
        if isinstance(value, str):
            normalized = normalized_path(path)
            if normalized == "$packet.task" and value not in _ALLOWED_TASKS:
                problems.append(f"unexpected AI task at {path}")
            if _EMAIL_RE.search(value):
                problems.append(f"email-like value at {path}")
            if _PHONE_RE.search(value):
                problems.append(f"phone-like value at {path}")
            if _LOCAL_PATH_RE.search(value):
                problems.append(f"local-path-like value at {path}")
            if _CLINICIAN_OR_FACILITY_RE.search(value) or _KNOWN_FACILITY_OR_PLACE_RE.search(value):
                problems.append(f"clinician-or-facility-like value at {path}")
            if _CITY_STATE_RE.search(value):
                problems.append(f"city-state-like value at {path}")
            if _ZIP_RE.search(value):
                problems.append(f"zip-code-like value at {path}")
            if _EXACT_DATE_RE.search(value) or _SHORT_EXACT_DATE_RE.search(value) or _MONTH_DATE_RE.search(value):
                problems.append(f"exact-date-like value at {path}")
            elif _MONTH_DAY_RE.search(value):
                problems.append(f"month-day-like value at {path}")
            if _STANDALONE_YEAR_RE.search(value):
                problems.append(f"standalone-year-like value at {path}")
            for name_pattern in (_SUSPICIOUS_PERSON_NAME_RE, _INITIAL_SURNAME_RE, _SUSPICIOUS_UPPERCASE_NAME_RE):
                for match in name_pattern.finditer(value):
                    if _looks_like_person_name(match.group(0)):
                        problems.append(f"person-name-like value at {path}")
                        break

    visit(packet, "$packet")
    if problems:
        raise DeidentificationError("AI payload is not de-identified: " + "; ".join(problems))
