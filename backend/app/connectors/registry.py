from __future__ import annotations

from app.connectors.base import BaseConnector
from app.connectors.clinicaltrials_connector import ClinicalTrialsGovConnector
from app.connectors.demo_connector import DemoCatalogConnector
from app.connectors.europepmc_connector import EuropePmcPreprintsConnector
from app.connectors.openfda_connector import OpenFdaDrugUpdatesConnector
from app.connectors.pubmed_connector import PubMedConnector


def connector_registry() -> dict[str, BaseConnector]:
    return {
        "clinicaltrials_gov": ClinicalTrialsGovConnector(),
        "demo_trials": DemoCatalogConnector("demo_trials", "clinical_trials", "Demo clinical trials"),
        "pubmed_literature": PubMedConnector(),
        "europepmc_preprints": EuropePmcPreprintsConnector(),
        "openfda_drug_updates": OpenFdaDrugUpdatesConnector(),
        "demo_drug_updates": DemoCatalogConnector("demo_drug_updates", "drug_updates", "Demo drug updates"),
        "demo_biomarker": DemoCatalogConnector("demo_biomarker", "biomarker", "Demo biomarker updates"),
    }
