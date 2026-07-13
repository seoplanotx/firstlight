from __future__ import annotations

import re
from dataclasses import dataclass, field


# Local, rules-first extraction from pathology/molecular report text.
# Candidates are suggestions only — never auto-applied without user review.


CANCER_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Colorectal cancer", re.compile(r"\b(colorectal|colon|rectal)\s+(adeno)?carcinoma\b", re.I)),
    ("Non-small cell lung cancer", re.compile(r"\bnon[-\s]?small\s+cell\s+lung\s+(cancer|carcinoma)|\bNSCLC\b", re.I)),
    ("Small cell lung cancer", re.compile(r"\bsmall\s+cell\s+lung\s+(cancer|carcinoma)|\bSCLC\b", re.I)),
    ("Breast cancer", re.compile(r"\bbreast\s+(cancer|carcinoma|invasive\s+ductal)\b", re.I)),
    ("Pancreatic cancer", re.compile(r"\bpancreatic\s+(cancer|adenocarcinoma|ductal)\b", re.I)),
    ("Prostate cancer", re.compile(r"\bprostate\s+(cancer|adenocarcinoma)\b", re.I)),
    ("Ovarian cancer", re.compile(r"\bovarian\s+(cancer|carcinoma)\b", re.I)),
    ("Melanoma", re.compile(r"\bmelanoma\b", re.I)),
]

STAGE_PATTERN = re.compile(
    r"\b(stage\s*(0|I{1,3}|IV|1|2|3|4)[A-C]?|T[0-4][a-c]?N[0-3][a-c]?M[0-1x]|metastatic|locally advanced)\b",
    re.I,
)

BIOMARKER_PATTERN = re.compile(
    r"\b("
    r"EGFR|KRAS|NRAS|BRAF|HER2|ERBB2|ALK|ROS1|RET|MET|NTRK|NTRK1|NTRK2|NTRK3|"
    r"PIK3CA|PTEN|TP53|BRCA1|BRCA2|MSI|MSS|MMR|dMMR|pMMR|TMB|PD-L1|PDL1|"
    r"IDH1|IDH2|FGFR2|FGFR3|KIT|NRG1|CDKN2A|APC|CTNNB1"
    r")\b"
    r"(?:\s*(?:exon\s*\d+(?:\s*(?:deletion|ins|insertion|mutation))?|"
    r"V\d+\w+|G12[A-Z]|L858R|T790M|positive|negative|mutant|wild[-\s]?type|"
    r"amplified|fusion|rearrangement))?",
    re.I,
)

THERAPY_PATTERN = re.compile(
    r"\b("
    r"osimertinib|erlotinib|gefitinib|afatinib|sotorasib|adagrasib|"
    r"pembrolizumab|nivolumab|atezolizumab|durvalumab|ipilimumab|"
    r"bevacizumab|cetuximab|panitumumab|trastuzumab|pertuzumab|"
    r"capecitabine|oxaliplatin|irinotecan|folfox|folfiri|folfirinox|"
    r"carboplatin|cisplatin|pemetrexed|paclitaxel|docetaxel|gemcitabine|"
    r"olaparib|rucaparib|niraparib|talazoparib|"
    r"encorafenib|dabrafenib|trametinib|vemurafenib"
    r")\b",
    re.I,
)


@dataclass(slots=True)
class ProfileExtractionResult:
    cancer_type: str | None = None
    subtype: str | None = None
    stage_or_context: str | None = None
    biomarkers: list[dict[str, str | None]] = field(default_factory=list)
    therapy_history: list[dict[str, str | None]] = field(default_factory=list)
    notes: str | None = None
    warnings: list[str] = field(default_factory=list)


def extract_profile_candidates(text: str) -> ProfileExtractionResult:
    cleaned = (text or "").strip()
    result = ProfileExtractionResult()
    if not cleaned:
        result.warnings.append("Paste text from a pathology or molecular report to extract candidates.")
        return result

    for label, pattern in CANCER_PATTERNS:
        if pattern.search(cleaned):
            result.cancer_type = label
            break

    stage_match = STAGE_PATTERN.search(cleaned)
    if stage_match:
        result.stage_or_context = stage_match.group(0)

    biomarker_hits: dict[str, dict[str, str | None]] = {}
    for match in BIOMARKER_PATTERN.finditer(cleaned):
        token = match.group(0).strip()
        name = match.group(1).upper().replace("PDL1", "PD-L1")
        variant = token[len(match.group(1)) :].strip(" -:") or None
        if name not in biomarker_hits:
            biomarker_hits[name] = {"name": name, "variant": variant, "status": None, "notes": None}
        elif variant and not biomarker_hits[name]["variant"]:
            biomarker_hits[name]["variant"] = variant
    result.biomarkers = list(biomarker_hits.values())

    therapies: dict[str, dict[str, str | None]] = {}
    for match in THERAPY_PATTERN.finditer(cleaned):
        name = match.group(0).strip()
        key = name.lower()
        if key not in therapies:
            therapies[key] = {
                "therapy_name": name.title() if name.islower() else name,
                "therapy_type": None,
                "line_of_therapy": None,
                "status": None,
                "notes": "Suggested from pasted report text — confirm before saving.",
            }
    result.therapy_history = list(therapies.values())

    if not any([result.cancer_type, result.stage_or_context, result.biomarkers, result.therapy_history]):
        result.warnings.append(
            "No structured cancer type, stage, biomarker, or therapy phrases were recognized. "
            "You can still fill the profile manually."
        )
    else:
        result.warnings.append(
            "These are suggested fields only. Confirm against the original report before saving. "
            "Firstlight does not diagnose or recommend treatment."
        )
        result.notes = "Candidates extracted locally from pasted report text (rules-based, not AI)."

    return result
