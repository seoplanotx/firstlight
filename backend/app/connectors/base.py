from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(slots=True)
class ConnectorContext:
    profile: Any
    source_config: Any
    requested_at: datetime


@dataclass(slots=True)
class ConnectorRecord:
    category: str
    title: str
    source_name: str
    source_url: str
    external_identifier: str
    summary: str
    tags: list[str] = field(default_factory=list)
    published_at: datetime | None = None
    location_summary: str | None = None
    raw_payload: dict[str, Any] = field(default_factory=dict)
    gaps: list[str] = field(default_factory=list)
    evidence_label: str | None = None
    evidence_snippet: str | None = None
    normalized_summary: str | None = None


def profile_biomarker_genes(profile: Any, limit: int = 4) -> list[str]:
    """Distinct biomarker gene names from a profile (e.g. ``["EGFR", "TP53"]``).

    Connectors use these for a broader fallback query when the exact
    gene + variant phrasing a family typed finds nothing at the source.
    """
    genes: list[str] = []
    seen: set[str] = set()
    for biomarker in (getattr(profile, "biomarkers", None) or [])[:limit]:
        name = getattr(biomarker, "name", None)
        if not isinstance(name, str) or not name.strip():
            continue
        gene = name.strip()
        if gene.lower() in seen:
            continue
        seen.add(gene.lower())
        genes.append(gene)
    return genes


def dedupe_queries(queries: list[Any]) -> list[Any]:
    """Drop repeated query tiers while keeping the strictest-first order."""
    unique: list[Any] = []
    for query in queries:
        if query and query not in unique:
            unique.append(query)
    return unique


class BaseConnector(ABC):
    key: str
    category: str
    display_name: str

    @abstractmethod
    def fetch(self, context: ConnectorContext) -> list[ConnectorRecord]:
        raise NotImplementedError

    def healthcheck(self) -> tuple[bool, str]:
        return True, "Ready"
