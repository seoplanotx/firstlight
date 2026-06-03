"""Seed an isolated Coffey database with demo content for screenshots.

Run with the backend installed and ONCOWATCH_*_DIR env vars pointing at a
throwaway location, e.g.:

    ONCOWATCH_ENV=test \
    ONCOWATCH_DATA_DIR=$PWD/.work/data \
    ONCOWATCH_CONFIG_DIR=$PWD/.work/config \
    ONCOWATCH_CACHE_DIR=$PWD/.work/cache \
    python marketing/screenshots/seed.py

This uses the contributor-only demo connectors (offline, deterministic) so the
Findings, Trial Matches, and Updates screens are populated without any network
or real patient data.
"""
from __future__ import annotations

import os

from sqlalchemy import select

# Demo content must be allowed both here and in the backend process that serves
# these rows, otherwise bootstrap purges demo findings on startup.
os.environ["ONCOWATCH_ALLOW_DEMO_CONTENT"] = "1"

from app.db.session import SessionLocal  # noqa: E402
from app.models import SourceConfig  # noqa: E402
from app.models.settings import OnboardingState  # noqa: E402
from app.services.bootstrap_service import initialize_application  # noqa: E402
from app.services.findings_service import list_findings  # noqa: E402
from app.services.monitoring_service import run_monitoring  # noqa: E402
from app.services.profile_service import create_demo_profile  # noqa: E402
from app.services.report_service import write_report  # noqa: E402

DEMO_SOURCES = [
    ("clinical_trials", "Demo clinical trials", "demo_trials"),
    ("drug_updates", "Demo drug updates", "demo_drug_updates"),
    ("biomarker", "Demo biomarker updates", "demo_biomarker"),
]


def main() -> None:
    initialize_application()
    with SessionLocal() as session:
        sources = {s.connector_key: s for s in session.scalars(select(SourceConfig)).all()}

        # Keep the capture offline and fast: disable the live external sources.
        for key in ("clinicaltrials_gov", "pubmed_literature"):
            if key in sources:
                sources[key].enabled = False

        # Enable the deterministic demo connectors.
        for category, name, key in DEMO_SOURCES:
            if key in sources:
                sources[key].enabled = True
            else:
                session.add(
                    SourceConfig(
                        category=category,
                        name=name,
                        connector_key=key,
                        enabled=True,
                        settings_json={"contributor_mode": True},
                    )
                )
        session.commit()

        profile = create_demo_profile(session)
        run = run_monitoring(session, profile_id=profile.id, triggered_by="demo")

        findings = list_findings(session, profile_id=profile.id)
        for report_type in ("daily_summary", "full_review"):
            write_report(session, profile=profile, findings=findings, report_type=report_type)

        state = session.scalar(select(OnboardingState))
        if state is None:
            state = OnboardingState()
            session.add(state)
        state.is_completed = True
        state.welcome_acknowledged = True
        state.current_step = "completed"
        session.commit()

        print(f"Seeded profile={profile.id} run={run.id} findings={len(findings)}")


if __name__ == "__main__":
    main()
