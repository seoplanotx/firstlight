from __future__ import annotations

from typing import Any

from app.models.finding import Finding
from app.services.deidentification_service import DeidentificationError


# Plain-language explanation payload builder.
#
# The text explained here is PUBLIC source material (PubMed abstracts,
# ClinicalTrials.gov summaries), not patient data. It legitimately contains dates
# and facility names, so it is deliberately NOT run through the case-packet
# de-identifier (which scrubs exactly those). The guarantee is narrower and strict:
# the packet is assembled ONLY from a whitelist of public Finding fields and never
# carries any profile / patient context. The caller additionally asserts that the
# active profile's identity terms are absent (belt-and-suspenders).

_ALLOWED_KEYS = {"title", "type", "source_name", "summary", "evidence", "tags"}


def build_public_finding_packet(finding: Finding) -> dict[str, Any]:
    evidence_snippet: str | None = None
    if finding.evidence_items:
        evidence_snippet = finding.evidence_items[0].snippet

    tags = [str(tag).strip() for tag in (finding.structured_tags or []) if str(tag).strip()]

    raw = {
        "title": (finding.title or "").strip() or None,
        "type": (finding.type or "").strip() or None,
        "source_name": (finding.source_name or "").strip() or None,
        "summary": (finding.normalized_summary or finding.raw_summary or "").strip() or None,
        "evidence": (evidence_snippet or "").strip() or None,
        "tags": tags,
    }
    packet = {key: value for key, value in raw.items() if value not in (None, "", [])}
    assert_public_finding_packet(packet)
    return packet


def assert_public_finding_packet(packet: Any) -> None:
    """Fail closed unless the packet is only whitelisted public source fields."""

    if not isinstance(packet, dict):
        raise DeidentificationError("Public finding packet must be an object.")

    problems: list[str] = []
    for key, value in packet.items():
        if key not in _ALLOWED_KEYS:
            problems.append(f"unexpected key '{key}'")
            continue
        if key == "tags":
            if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
                problems.append("'tags' must be a list of strings")
        elif not isinstance(value, str):
            problems.append(f"field '{key}' must be a string")

    if problems:
        raise DeidentificationError("Public finding packet is invalid: " + "; ".join(problems))
