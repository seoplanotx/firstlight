from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx

from app.connectors.base import BaseConnector, ConnectorContext, ConnectorRecord
from app.connectors.http import get_with_retries


PREPRINT_CAUTION_TEXT = (
    "This is a preprint that has not completed peer review. "
    "Findings are preliminary and may change; they require review by the oncology team."
)


class EuropePmcPreprintsConnector(BaseConnector):
    key = "europepmc_preprints"
    category = "literature"
    display_name = "Europe PMC preprints"

    _search_url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

    def _build_client(self, timeout: float) -> httpx.Client:
        return httpx.Client(
            timeout=timeout,
            headers={
                "accept": "application/json",
                "user-agent": "OncoWatch/0.1",
            },
        )

    def _page_size(self, context: ConnectorContext) -> int:
        settings = context.source_config.settings_json or {}
        raw_value = settings.get("page_size", settings.get("retmax", 5))
        try:
            page_size = int(raw_value)
        except (TypeError, ValueError):
            page_size = 5
        return max(1, min(page_size, 20))

    def _profile_terms(self, context: ConnectorContext) -> list[str]:
        profile = context.profile
        terms: list[str] = []
        for value in [getattr(profile, "cancer_type", None), getattr(profile, "subtype", None)]:
            if isinstance(value, str) and value.strip():
                terms.append(value.strip())
        for biomarker in getattr(profile, "biomarkers", [])[:3]:
            name = getattr(biomarker, "name", None)
            if not name:
                continue
            variant = getattr(biomarker, "variant", None)
            terms.append(f"{name} {variant}".strip() if variant else name.strip())
        return self._dedupe(terms)

    def _build_query(self, context: ConnectorContext) -> str:
        terms = self._profile_terms(context)
        if not terms:
            terms = ["cancer"]
        term_clauses = " AND ".join(f'(TITLE:"{term}" OR ABSTRACT:"{term}")' for term in terms)
        return f"{term_clauses} AND SRC:PPR"

    def fetch(self, context: ConnectorContext) -> list[ConnectorRecord]:
        query = self._build_query(context)
        page_size = self._page_size(context)
        search_terms = self._profile_terms(context)

        with self._build_client(20.0) as client:
            response = get_with_retries(
                client,
                self._search_url,
                params={
                    "query": query,
                    "format": "json",
                    "resultType": "core",
                    "sort": "P_PDATE_D desc",
                    "pageSize": page_size,
                },
            )
            response.raise_for_status()
            results = (response.json().get("resultList") or {}).get("result", []) or []

        records: list[ConnectorRecord] = []
        for result in results:
            parsed = self._parse_result(result, search_terms)
            if parsed is not None:
                records.append(parsed)
        return records

    def _parse_result(self, result: dict[str, Any], search_terms: list[str]) -> ConnectorRecord | None:
        item_id = self._clean_text(result.get("id"))
        source = self._clean_text(result.get("source")) or "PPR"
        if not item_id:
            return None

        title = self._clean_text(result.get("title")).rstrip(".") or f"Europe PMC preprint {item_id}"
        publisher = self._clean_text(result.get("bookOrReportDetails", {}).get("publisher")) if isinstance(
            result.get("bookOrReportDetails"), dict
        ) else ""
        journal = publisher or self._clean_text(result.get("journalTitle")) or "Preprint server"
        author_string = self._clean_text(result.get("authorString"))
        doi = self._clean_text(result.get("doi"))
        published_at = self._parse_date(
            result.get("firstPublicationDate") or result.get("pubYear")
        )

        abstract_text = self._strip_html(self._clean_text(result.get("abstractText")))
        abstract_snippet = self._select_snippet(abstract_text, search_terms) if abstract_text else None

        source_url = f"https://europepmc.org/article/{source}/{item_id}"

        gaps: list[str] = ["This is a preprint and has not completed peer review."]
        if not abstract_text:
            gaps.append("Europe PMC did not provide an abstract for this preprint, so only citation metadata is shown.")
        if published_at is None:
            gaps.append("Europe PMC did not include a publication date for this preprint.")

        citation_snippet = ". ".join(part for part in [journal, author_string] if part).strip().strip(".")
        summary_core = abstract_snippet or citation_snippet or "Recent oncology preprint from Europe PMC."
        summary = f"{summary_core.rstrip('.')}. {PREPRINT_CAUTION_TEXT}"

        tags = self._dedupe(
            [
                "Preprint",
                "Not peer reviewed",
                journal,
                *search_terms[:3],
            ]
        )

        return ConnectorRecord(
            category="literature",
            title=title,
            source_name="Europe PMC preprints",
            source_url=source_url,
            external_identifier=f"EPMC:{source}:{item_id}",
            summary=summary,
            tags=tags,
            published_at=published_at,
            raw_payload={
                "europepmc_id": item_id,
                "source": source,
                "doi": doi or None,
                "journal": journal,
                "authors": author_string or None,
                "is_preprint": True,
                "abstract_text": abstract_text or None,
                "record_url": source_url,
                "caution": PREPRINT_CAUTION_TEXT,
            },
            gaps=gaps,
            evidence_label="Preprint abstract excerpt" if abstract_snippet else "Preprint citation",
            evidence_snippet=abstract_snippet or citation_snippet or title,
            normalized_summary=summary,
        )

    def _select_snippet(self, abstract_text: str, search_terms: list[str]) -> str:
        sentences = [sentence.strip() for sentence in abstract_text.split(". ") if sentence.strip()]
        if not sentences:
            return self._truncate(abstract_text, 500)

        normalized_terms = [term.lower() for term in search_terms if term]
        best_index = 0
        best_score = -1
        for index, sentence in enumerate(sentences):
            lowered = sentence.lower()
            score = sum(lowered.count(term) for term in normalized_terms)
            if score > best_score:
                best_index = index
                best_score = score

        snippet = ". ".join(sentences[best_index : best_index + 3]).strip()
        if not snippet.endswith("."):
            snippet += "."
        return self._truncate(snippet, 500)

    def _parse_date(self, value: Any) -> datetime | None:
        text = self._clean_text(value)
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
            try:
                return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    def _clean_text(self, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split())

    def _strip_html(self, value: str) -> str:
        return " ".join(re.sub(r"<[^>]+>", " ", value).split())

    def _truncate(self, value: str, limit: int) -> str:
        text = " ".join(value.split()).strip()
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    def _dedupe(self, values: list[str | None]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for value in values:
            if not value:
                continue
            key = value.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(key)
        return deduped

    def healthcheck(self) -> tuple[bool, str]:
        try:
            with self._build_client(10.0) as client:
                response = get_with_retries(
                    client,
                    self._search_url,
                    params={
                        "query": "SRC:PPR AND cancer",
                        "format": "json",
                        "pageSize": 1,
                    },
                    max_attempts=2,
                )
                response.raise_for_status()
                data = response.json()
            hit_count = data.get("hitCount")
            if isinstance(hit_count, int):
                return True, f"Europe PMC reachable; {hit_count} preprints indexed for test query"
            return True, "Europe PMC reachable"
        except Exception as exc:
            return False, f"Europe PMC check failed: {exc}"
