# Product

## Register

product

## Users
Cancer patients and their family caregivers — stressed, often non-technical, checking in once a day (frequently in the morning) to see whether anything new landed for the person they love. Secondary user: the same person preparing for an oncology appointment. They are tired, emotionally loaded, and have no patience for developer concepts.

## Product Purpose
Firstlight is a local-first desktop app (Tauri + React + local FastAPI) that monitors public oncology sources (ClinicalTrials.gov, PubMed, openFDA, Europe PMC), matches findings against a structured patient profile, and helps families review what may matter and bring source-backed, structured summaries to their oncology team. It is an information monitoring and summarization tool — never a diagnostic or treatment recommender; every finding requires clinician review. Success: a family opens the app, knows what's new in minutes, and walks into appointments prepared. Built in memory of Judy Coffey.

## Brand Personality
Calm, plain-spoken, trustworthy. The interface should feel like a quiet, well-organized morning briefing — never like a medical dashboard, an admin tool, or a startup SaaS. Emotional goals: reassurance, orientation, preparedness.

## Anti-references
- Clinical EHR / hospital software density (Epic-style walls of data)
- SaaS analytics dashboards (hero metrics, gradient accents, growth-tool energy)
- Anything alarmist: red badges, urgency mechanics, streaks, gamification
- Dev-speak or jargon in UI copy ("sync", "query", "records processed")
- Emojis in the UI (clean line SVG icons only)

## Design Principles
- One next action: every screen should make "what should I do now?" obvious in seconds.
- Calm over dense: whitespace and hierarchy beat information count; nothing shouts.
- Plain language first: family-speak by default, clinical terms opt-in.
- Trust through sourcing: every finding shows where it came from; safety language is part of the design, not a footnote.
- Local and private by visible design: privacy reassurance appears where users need it, not buried in settings.

## Accessibility & Inclusion
No formal WCAG target declared, but the audience skews older and stressed: body text must hold ≥4.5:1 contrast, targets comfortably clickable, motion minimal and respectful of `prefers-reduced-motion`, and reading level plain. Print output (doctor reports) must remain legible in black-and-white.
