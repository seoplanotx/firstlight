from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.connectors.base import BaseConnector, ConnectorContext, ConnectorRecord
from app.connectors.http import get_with_retries


CAUTION_TEXT = (
    "This is an FDA regulatory update surfaced for awareness only. "
    "It is not a treatment recommendation; it may be worth discussing with the oncology team."
)


class OpenFdaDrugUpdatesConnector(BaseConnector):
    key = "openfda_drug_updates"
    category = "drug_updates"
    display_name = "openFDA drug updates"

    _drugsfda_url = "https://api.fda.gov/drug/drugsfda.json"
    _label_url = "https://api.fda.gov/drug/label.json"

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
        raw_value = settings.get("page_size", settings.get("limit", 5))
        try:
            page_size = int(raw_value)
        except (TypeError, ValueError):
            page_size = 5
        return max(1, min(page_size, 10))

    def _lookback_days(self, context: ConnectorContext) -> int:
        settings = context.source_config.settings_json or {}
        raw_value = settings.get("lookback_days", 365)
        try:
            lookback = int(raw_value)
        except (TypeError, ValueError):
            lookback = 365
        return max(30, min(lookback, 1825))

    def _drug_names(self, context: ConnectorContext) -> list[str]:
        names: list[str] = []
        for therapy in getattr(context.profile, "therapy_history", [])[:4]:
            name = getattr(therapy, "therapy_name", None)
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
        return self._dedupe(names)

    def _cancer_terms(self, context: ConnectorContext) -> list[str]:
        profile = context.profile
        terms = [getattr(profile, "cancer_type", None), getattr(profile, "subtype", None)]
        return self._dedupe([term.strip() for term in terms if isinstance(term, str) and term.strip()])

    def _date_window(self, context: ConnectorContext) -> tuple[str, str]:
        end = context.requested_at if context.requested_at else datetime.now(timezone.utc)
        start = end - timedelta(days=self._lookback_days(context))
        return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")

    def fetch(self, context: ConnectorContext) -> list[ConnectorRecord]:
        page_size = self._page_size(context)
        start_date, end_date = self._date_window(context)
        drug_names = self._drug_names(context)
        cancer_terms = self._cancer_terms(context)

        records: list[ConnectorRecord] = []
        with self._build_client(30.0) as client:
            if drug_names:
                drugsfda_search = self._build_drugsfda_search(drug_names, start_date, end_date)
                response = get_with_retries(
                    client,
                    self._drugsfda_url,
                    params={"search": drugsfda_search, "limit": page_size},
                )
                if response.status_code != 404:
                    response.raise_for_status()
                    for result in response.json().get("results", []) or []:
                        parsed = self._parse_drugsfda_result(result)
                        if parsed is not None:
                            records.append(parsed)

            if cancer_terms:
                label_search = self._build_label_search(cancer_terms, drug_names, start_date, end_date)
                response = get_with_retries(
                    client,
                    self._label_url,
                    params={
                        "search": label_search,
                        "sort": "effective_time:desc",
                        "limit": page_size,
                    },
                )
                if response.status_code != 404:
                    response.raise_for_status()
                    for result in response.json().get("results", []) or []:
                        parsed = self._parse_label_result(result)
                        if parsed is not None:
                            records.append(parsed)

        return self._dedupe_records(records)

    def _build_drugsfda_search(self, drug_names: list[str], start_date: str, end_date: str) -> str:
        name_clauses = " OR ".join(
            f'openfda.brand_name:"{name}" OR openfda.generic_name:"{name}"' for name in drug_names
        )
        return f"({name_clauses}) AND submissions.submission_status_date:[{start_date} TO {end_date}]"

    def _build_label_search(
        self, cancer_terms: list[str], drug_names: list[str], start_date: str, end_date: str
    ) -> str:
        clauses = [f'indications_and_usage:"{term}"' for term in cancer_terms]
        clauses.extend(f'openfda.generic_name:"{name}"' for name in drug_names[:2])
        return f"({' OR '.join(clauses)}) AND effective_time:[{start_date} TO {end_date}]"

    def _parse_drugsfda_result(self, result: dict[str, Any]) -> ConnectorRecord | None:
        application_number = self._clean_text(result.get("application_number"))
        if not application_number:
            return None

        openfda = result.get("openfda") or {}
        brand_names = self._clean_list(openfda.get("brand_name") or [])
        generic_names = self._clean_list(openfda.get("generic_name") or [])
        sponsor = self._clean_text(result.get("sponsor_name")) or None
        drug_label = brand_names[0] if brand_names else (generic_names[0] if generic_names else application_number)
        drug_label = drug_label.title() if drug_label.isupper() else drug_label

        submissions = result.get("submissions") or []
        latest = self._latest_submission(submissions)
        submission_date = self._parse_compact_date(latest.get("submission_status_date") if latest else None)
        submission_summary = self._describe_submission(latest) if latest else None

        appl_no_digits = "".join(char for char in application_number if char.isdigit())
        source_url = (
            "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"
            f"?event=overview.process&ApplNo={appl_no_digits}"
        )

        title = f"FDA application update for {drug_label} ({application_number})"
        gaps: list[str] = []
        if latest is None:
            gaps.append("openFDA did not include submission history for this application.")
        if not brand_names and not generic_names:
            gaps.append("openFDA did not include drug name details for this application.")

        evidence_snippet = submission_summary or (
            f"Drugs@FDA application {application_number} had recent regulatory activity. Review the full record for details."
        )
        summary_parts = [
            f"Recent Drugs@FDA activity for {drug_label}",
        ]
        if sponsor:
            summary_parts.append(f"Sponsor: {sponsor}")
        if submission_summary:
            summary_parts.append(submission_summary)
        summary_parts.append(CAUTION_TEXT)
        summary = ". ".join(part.rstrip(".") for part in summary_parts if part).strip() + "."

        tags = self._dedupe(
            [
                "FDA drug update",
                drug_label,
                *generic_names[:2],
                (latest or {}).get("submission_class_code_description"),
            ]
        )

        return ConnectorRecord(
            category="drug_updates",
            title=title,
            source_name="openFDA Drugs@FDA",
            source_url=source_url,
            external_identifier=f"FDA-DRUGSFDA:{application_number}",
            summary=summary,
            tags=tags,
            published_at=submission_date,
            raw_payload={
                "application_number": application_number,
                "brand_names": brand_names,
                "generic_names": generic_names,
                "interventions": self._dedupe([*brand_names, *generic_names]),
                "sponsor": sponsor,
                "latest_submission": latest or {},
                "record_url": source_url,
                "caution": CAUTION_TEXT,
            },
            gaps=gaps,
            evidence_label="Regulatory submission summary",
            evidence_snippet=self._truncate(evidence_snippet, 500),
            normalized_summary=summary,
        )

    def _parse_label_result(self, result: dict[str, Any]) -> ConnectorRecord | None:
        set_id = self._clean_text(result.get("set_id") or result.get("id"))
        if not set_id:
            return None

        openfda = result.get("openfda") or {}
        brand_names = self._clean_list(openfda.get("brand_name") or [])
        generic_names = self._clean_list(openfda.get("generic_name") or [])
        drug_label = brand_names[0] if brand_names else (generic_names[0] if generic_names else f"label {set_id}")
        drug_label = drug_label.title() if drug_label.isupper() else drug_label

        effective_time = self._clean_text(result.get("effective_time"))
        published_at = self._parse_compact_date(effective_time)
        indications = self._clean_list(result.get("indications_and_usage") or [])
        indications_text = " ".join(indications)

        source_url = f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={set_id}"
        title = f"FDA label update for {drug_label}"

        gaps: list[str] = []
        if not indications_text:
            gaps.append("openFDA did not include indications text for this label, so only label metadata is shown.")
        if published_at is None:
            gaps.append("openFDA did not include an effective date for this label version.")

        evidence_snippet = self._truncate(indications_text, 500) if indications_text else (
            f"A recent prescribing-label version was published for {drug_label}. Review the full label for details."
        )
        summary_parts = [f"Updated FDA prescribing label for {drug_label}"]
        if published_at is not None:
            summary_parts.append(f"Label effective {published_at.date().isoformat()}")
        if indications_text:
            summary_parts.append(f"Indications excerpt: {self._truncate(indications_text, 300)}")
        summary_parts.append(CAUTION_TEXT)
        summary = ". ".join(part.rstrip(".") for part in summary_parts if part).strip() + "."

        tags = self._dedupe(
            [
                "FDA label update",
                drug_label,
                *generic_names[:2],
            ]
        )

        return ConnectorRecord(
            category="drug_updates",
            title=title,
            source_name="openFDA drug labels",
            source_url=source_url,
            external_identifier=f"FDA-LABEL:{set_id}",
            summary=summary,
            tags=tags,
            published_at=published_at,
            raw_payload={
                "set_id": set_id,
                "brand_names": brand_names,
                "generic_names": generic_names,
                "interventions": self._dedupe([*brand_names, *generic_names]),
                "effective_time": effective_time or None,
                "indications_excerpt": self._truncate(indications_text, 900) if indications_text else None,
                "record_url": source_url,
                "caution": CAUTION_TEXT,
            },
            gaps=gaps,
            evidence_label="Label indications excerpt" if indications_text else "Label metadata",
            evidence_snippet=evidence_snippet,
            normalized_summary=summary,
        )

    def _latest_submission(self, submissions: list[dict[str, Any]]) -> dict[str, Any] | None:
        dated: list[tuple[str, dict[str, Any]]] = []
        for submission in submissions:
            if not isinstance(submission, dict):
                continue
            date_value = self._clean_text(submission.get("submission_status_date"))
            dated.append((date_value, submission))
        if not dated:
            return None
        dated.sort(key=lambda item: item[0], reverse=True)
        return dated[0][1]

    def _describe_submission(self, submission: dict[str, Any]) -> str | None:
        submission_type = self._clean_text(submission.get("submission_type"))
        submission_number = self._clean_text(submission.get("submission_number"))
        status = self._clean_text(submission.get("submission_status"))
        class_description = self._clean_text(submission.get("submission_class_code_description"))
        date = self._parse_compact_date(submission.get("submission_status_date"))

        parts: list[str] = []
        label = " ".join(part for part in [submission_type, submission_number] if part)
        if label:
            parts.append(f"Most recent submission: {label}")
        if class_description:
            parts.append(class_description)
        if status:
            parts.append(f"status {status.title()}")
        if date is not None:
            parts.append(f"dated {date.date().isoformat()}")
        if not parts:
            return None
        return ", ".join(parts)

    def _dedupe_records(self, records: list[ConnectorRecord]) -> list[ConnectorRecord]:
        seen: set[str] = set()
        deduped: list[ConnectorRecord] = []
        for record in records:
            if record.external_identifier in seen:
                continue
            seen.add(record.external_identifier)
            deduped.append(record)
        return deduped

    def _parse_compact_date(self, value: Any) -> datetime | None:
        text = self._clean_text(value)
        if not text:
            return None
        try:
            return datetime.strptime(text, "%Y%m%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    def _clean_text(self, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split())

    def _clean_list(self, values: list[Any]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            item = self._clean_text(value)
            if item:
                cleaned.append(item)
        return self._dedupe(cleaned)

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
                    self._drugsfda_url,
                    params={"limit": 1},
                    max_attempts=2,
                )
                response.raise_for_status()
                data = response.json()
            last_updated = (data.get("meta") or {}).get("last_updated")
            if last_updated:
                return True, f"openFDA reachable; data last updated {last_updated}"
            return True, "openFDA reachable"
        except Exception as exc:
            return False, f"openFDA check failed: {exc}"
