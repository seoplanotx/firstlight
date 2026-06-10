from __future__ import annotations

from datetime import datetime, timezone
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from app.connectors.base import ConnectorContext
from app.connectors.clinicaltrials_connector import ClinicalTrialsGovConnector
from app.connectors.europepmc_connector import EuropePmcPreprintsConnector
from app.connectors.openfda_connector import OpenFdaDrugUpdatesConnector
from app.connectors.pubmed_connector import PubMedConnector


def build_profile() -> SimpleNamespace:
    return SimpleNamespace(
        cancer_type="Non-small cell lung cancer",
        subtype="Adenocarcinoma",
        stage_or_context="Metastatic",
        location_label="Dallas-Fort Worth, Texas",
        biomarkers=[
            SimpleNamespace(name="EGFR", variant="Exon 19 deletion"),
            SimpleNamespace(name="TP53", variant=None),
        ],
        therapy_history=[
            SimpleNamespace(therapy_name="Osimertinib", therapy_type="targeted therapy"),
        ],
        would_consider=["clinical trials"],
        would_not_consider=["long-distance travel without a strong rationale"],
    )


def build_context(settings: dict) -> ConnectorContext:
    return ConnectorContext(
        profile=build_profile(),
        source_config=SimpleNamespace(settings_json=settings),
        requested_at=datetime.now(timezone.utc),
    )


class ClinicalTrialsConnectorTests(unittest.TestCase):
    def test_fetch_parses_realistic_study_fields(self) -> None:
        connector = ClinicalTrialsGovConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/api/v2/studies")
            self.assertEqual(request.url.params["query.cond"], "Non-small cell lung cancer Adenocarcinoma")
            self.assertEqual(request.url.params["pageSize"], "8")
            self.assertIn("EGFR Exon 19 deletion", request.url.params["query.term"])
            body = {
                "studies": [
                    {
                        "protocolSection": {
                            "identificationModule": {
                                "nctId": "NCT12345678",
                                "briefTitle": "EGFR-directed therapy after osimertinib progression",
                            },
                            "statusModule": {
                                "overallStatus": "RECRUITING",
                                "lastUpdatePostDateStruct": {"date": "2026-03-20"},
                            },
                            "descriptionModule": {
                                "briefSummary": "Study for metastatic EGFR-mutated NSCLC after osimertinib resistance.",
                            },
                            "conditionsModule": {
                                "conditions": ["Non-small Cell Lung Cancer"],
                                "keywords": ["EGFR", "Osimertinib resistance"],
                            },
                            "designModule": {"phases": ["PHASE1", "PHASE2"]},
                            "armsInterventionsModule": {
                                "interventions": [
                                    {"name": "Osimertinib", "type": "DRUG"},
                                    {"name": "Amivantamab", "type": "BIOLOGICAL"},
                                ]
                            },
                            "contactsLocationsModule": {
                                "locations": [
                                    {
                                        "facility": "UT Southwestern",
                                        "city": "Dallas",
                                        "state": "Texas",
                                        "country": "United States",
                                        "status": "RECRUITING",
                                    }
                                ]
                            },
                            "sponsorCollaboratorsModule": {
                                "leadSponsor": {"name": "UT Southwestern"}
                            },
                            "eligibilityModule": {
                                "eligibilityCriteria": (
                                    "Inclusion Criteria:\n"
                                    "- Metastatic EGFR-mutated NSCLC\n"
                                    "Exclusion Criteria:\n"
                                    "- Uncontrolled brain metastases"
                                )
                            },
                        }
                    }
                ]
            }
            return httpx.Response(200, json=body)

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        context = build_context({"page_size": 8})
        records = connector.fetch(context)

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.external_identifier, "NCT12345678")
        self.assertEqual(record.source_name, "ClinicalTrials.gov")
        self.assertIn("Phase 1", record.summary)
        self.assertIn("Dallas", record.location_summary or "")
        self.assertEqual(record.raw_payload["nct_id"], "NCT12345678")
        self.assertIn("Inclusion Criteria", record.raw_payload["inclusion_excerpt"])
        self.assertEqual(record.evidence_label, "Eligibility criteria excerpt")

    def test_fetch_retries_transient_server_error(self) -> None:
        connector = ClinicalTrialsGovConnector()
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            if calls["count"] == 1:
                return httpx.Response(503, text="service unavailable")
            body = {
                "studies": [
                    {
                        "protocolSection": {
                            "identificationModule": {
                                "nctId": "NCT99999999",
                                "briefTitle": "Recovered after a transient outage",
                            },
                            "statusModule": {"overallStatus": "RECRUITING"},
                        }
                    }
                ]
            }
            return httpx.Response(200, json=body)

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]

        with patch("app.connectors.http.time.sleep"):
            records = connector.fetch(build_context({"page_size": 5}))

        self.assertEqual(calls["count"], 2)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].external_identifier, "NCT99999999")


class PubMedConnectorTests(unittest.TestCase):
    def test_fetch_prefers_abstract_snippet(self) -> None:
        connector = PubMedConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/esearch.fcgi"):
                return httpx.Response(200, json={"esearchresult": {"idlist": ["40000001"]}})
            if request.url.path.endswith("/esummary.fcgi"):
                return httpx.Response(
                    200,
                    json={
                        "result": {
                            "uids": ["40000001"],
                            "40000001": {
                                "uid": "40000001",
                                "title": "Resistance pathways after osimertinib in EGFR-mutated NSCLC",
                                "fulljournalname": "Journal of Thoracic Oncology",
                                "pubdate": "2026 Mar 12",
                                "authors": [{"name": "Lee J"}, {"name": "Patel R"}],
                            },
                        }
                    },
                )
            if request.url.path.endswith("/efetch.fcgi"):
                xml = """
                <PubmedArticleSet>
                  <PubmedArticle>
                    <MedlineCitation>
                      <PMID>40000001</PMID>
                      <MeshHeadingList>
                        <MeshHeading><DescriptorName>Carcinoma, Non-Small-Cell Lung</DescriptorName></MeshHeading>
                      </MeshHeadingList>
                      <Article>
                        <Abstract>
                          <AbstractText Label="Results">Patients with EGFR exon 19 deletion had prolonged benefit from osimertinib before MET-mediated resistance emerged.</AbstractText>
                          <AbstractText Label="Conclusions">Updated molecular profiling remained important after progression.</AbstractText>
                        </Abstract>
                      </Article>
                    </MedlineCitation>
                    <PubmedData>
                      <ArticleIdList>
                        <ArticleId IdType="doi">10.1000/example</ArticleId>
                      </ArticleIdList>
                    </PubmedData>
                  </PubmedArticle>
                </PubmedArticleSet>
                """
                return httpx.Response(200, text=xml)
            raise AssertionError(f"Unexpected path: {request.url.path}")

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        context = build_context({"retmax": 3})
        records = connector.fetch(context)

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.external_identifier, "PMID:40000001")
        self.assertEqual(record.evidence_label, "Abstract excerpt")
        self.assertIn("EGFR exon 19 deletion", record.evidence_snippet or "")
        self.assertIn("Journal of Thoracic Oncology", record.tags)
        self.assertEqual(record.raw_payload["identifiers"]["doi"], "10.1000/example")
        self.assertFalse(record.gaps)

    def test_fetch_falls_back_when_abstract_missing(self) -> None:
        connector = PubMedConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/esearch.fcgi"):
                return httpx.Response(200, json={"esearchresult": {"idlist": ["40000002"]}})
            if request.url.path.endswith("/esummary.fcgi"):
                return httpx.Response(
                    200,
                    json={
                        "result": {
                            "uids": ["40000002"],
                            "40000002": {
                                "uid": "40000002",
                                "title": "Review of resistance testing after targeted therapy",
                                "fulljournalname": "Clinical Lung Cancer",
                                "pubdate": "2025 Oct",
                                "authors": [{"name": "Smith A"}],
                            },
                        }
                    },
                )
            if request.url.path.endswith("/efetch.fcgi"):
                return httpx.Response(200, text="<PubmedArticleSet></PubmedArticleSet>")
            raise AssertionError(f"Unexpected path: {request.url.path}")

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        context = build_context({"retmax": 1})
        records = connector.fetch(context)

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.evidence_label, "Citation summary")
        self.assertIn("Clinical Lung Cancer", record.evidence_snippet or "")
        self.assertTrue(record.gaps)
        self.assertIn("PubMed did not provide an abstract", record.gaps[0])


class EuropePmcPreprintsConnectorTests(unittest.TestCase):
    def test_fetch_parses_preprint_with_abstract(self) -> None:
        connector = EuropePmcPreprintsConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertTrue(request.url.path.endswith("/europepmc/webservices/rest/search"))
            query = request.url.params["query"]
            self.assertIn("SRC:PPR", query)
            self.assertIn("Non-small cell lung cancer", query)
            self.assertIn("EGFR Exon 19 deletion", query)
            self.assertEqual(request.url.params["pageSize"], "5")
            body = {
                "hitCount": 1,
                "resultList": {
                    "result": [
                        {
                            "id": "PPR888001",
                            "source": "PPR",
                            "title": "Fourth-generation EGFR inhibitor activity in osimertinib-resistant NSCLC.",
                            "authorString": "Nguyen T, Alvarez M.",
                            "doi": "10.1101/2026.03.01.999999",
                            "firstPublicationDate": "2026-03-04",
                            "bookOrReportDetails": {"publisher": "bioRxiv"},
                            "abstractText": (
                                "<h4>Background</h4> Resistance to osimertinib remains a major challenge. "
                                "<h4>Results</h4> In EGFR exon 19 deletion models, the candidate compound "
                                "restored sensitivity after osimertinib resistance. Further validation is ongoing."
                            ),
                        }
                    ]
                },
            }
            return httpx.Response(200, json=body)

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        records = connector.fetch(build_context({"page_size": 5}))

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.category, "literature")
        self.assertEqual(record.external_identifier, "EPMC:PPR:PPR888001")
        self.assertEqual(record.source_url, "https://europepmc.org/article/PPR/PPR888001")
        self.assertEqual(record.evidence_label, "Preprint abstract excerpt")
        self.assertIn("EGFR exon 19 deletion", record.evidence_snippet or "")
        self.assertNotIn("<h4>", record.evidence_snippet or "")
        self.assertIn("Preprint", record.tags)
        self.assertIn("not completed peer review", record.summary)
        self.assertTrue(record.raw_payload["is_preprint"])
        self.assertEqual(record.raw_payload["doi"], "10.1101/2026.03.01.999999")
        self.assertTrue(any("not completed peer review" in gap for gap in record.gaps))
        self.assertEqual(record.published_at.date().isoformat(), "2026-03-04")

    def test_fetch_falls_back_when_abstract_missing(self) -> None:
        connector = EuropePmcPreprintsConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            body = {
                "hitCount": 1,
                "resultList": {
                    "result": [
                        {
                            "id": "PPR888002",
                            "source": "PPR",
                            "title": "Early report on combination strategies in lung adenocarcinoma",
                            "authorString": "Okafor C.",
                            "firstPublicationDate": "2026-02-10",
                        }
                    ]
                },
            }
            return httpx.Response(200, json=body)

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        records = connector.fetch(build_context({}))

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record.evidence_label, "Preprint citation")
        self.assertTrue(any("did not provide an abstract" in gap for gap in record.gaps))
        self.assertIn("not completed peer review", record.summary)

    def test_fetch_retries_transient_server_error(self) -> None:
        connector = EuropePmcPreprintsConnector()
        calls = {"count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["count"] += 1
            if calls["count"] == 1:
                return httpx.Response(503, text="service unavailable")
            return httpx.Response(
                200,
                json={
                    "hitCount": 1,
                    "resultList": {
                        "result": [
                            {
                                "id": "PPR888003",
                                "source": "PPR",
                                "title": "Recovered after a transient outage",
                                "firstPublicationDate": "2026-01-15",
                            }
                        ]
                    },
                },
            )

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]

        with patch("app.connectors.http.time.sleep"):
            records = connector.fetch(build_context({"page_size": 3}))

        self.assertEqual(calls["count"], 2)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].external_identifier, "EPMC:PPR:PPR888003")


class OpenFdaDrugUpdatesConnectorTests(unittest.TestCase):
    def test_fetch_parses_drugsfda_and_label_results(self) -> None:
        connector = OpenFdaDrugUpdatesConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/drug/drugsfda.json"):
                search = request.url.params["search"]
                self.assertIn('openfda.brand_name:"Osimertinib"', search)
                self.assertIn("submissions.submission_status_date:", search)
                body = {
                    "results": [
                        {
                            "application_number": "NDA208065",
                            "sponsor_name": "AstraZeneca",
                            "openfda": {
                                "brand_name": ["TAGRISSO"],
                                "generic_name": ["OSIMERTINIB"],
                            },
                            "submissions": [
                                {
                                    "submission_type": "SUPPL",
                                    "submission_number": "40",
                                    "submission_status": "AP",
                                    "submission_status_date": "20260215",
                                    "submission_class_code_description": "Efficacy",
                                },
                                {
                                    "submission_type": "SUPPL",
                                    "submission_number": "12",
                                    "submission_status": "AP",
                                    "submission_status_date": "20240101",
                                },
                            ],
                        }
                    ]
                }
                return httpx.Response(200, json=body)
            if request.url.path.endswith("/drug/label.json"):
                search = request.url.params["search"]
                self.assertIn('indications_and_usage:"Non-small cell lung cancer"', search)
                body = {
                    "results": [
                        {
                            "set_id": "abcd-1234",
                            "effective_time": "20260301",
                            "openfda": {
                                "brand_name": ["TAGRISSO"],
                                "generic_name": ["OSIMERTINIB"],
                            },
                            "indications_and_usage": [
                                "TAGRISSO is indicated for metastatic non-small cell lung cancer with EGFR exon 19 deletions."
                            ],
                        }
                    ]
                }
                return httpx.Response(200, json=body)
            raise AssertionError(f"Unexpected path: {request.url.path}")

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        records = connector.fetch(build_context({"page_size": 5}))

        self.assertEqual(len(records), 2)
        drugsfda_record = records[0]
        self.assertEqual(drugsfda_record.category, "drug_updates")
        self.assertEqual(drugsfda_record.external_identifier, "FDA-DRUGSFDA:NDA208065")
        self.assertIn("Tagrisso", drugsfda_record.title)
        self.assertIn("AstraZeneca", drugsfda_record.summary)
        self.assertIn("2026-02-15", drugsfda_record.evidence_snippet or "")
        self.assertIn("not a treatment recommendation", drugsfda_record.summary)

        label_record = records[1]
        self.assertEqual(label_record.external_identifier, "FDA-LABEL:abcd-1234")
        self.assertEqual(label_record.evidence_label, "Label indications excerpt")
        self.assertIn("EGFR exon 19 deletions", label_record.evidence_snippet or "")
        self.assertEqual(label_record.published_at.date().isoformat(), "2026-03-01")

    def test_fetch_handles_404_as_no_results(self) -> None:
        connector = OpenFdaDrugUpdatesConnector()

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"error": {"code": "NOT_FOUND", "message": "No matches found!"}})

        connector._build_client = lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout)  # type: ignore[method-assign]
        records = connector.fetch(build_context({"page_size": 5}))

        self.assertEqual(records, [])
