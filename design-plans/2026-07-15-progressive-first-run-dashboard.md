# Make the first-run Today page one calm action instead of eight empty modules

Written against: b5612ee

## Evidence chain

- Surface: `apps/desktop/src/pages/DashboardPage.tsx`, route `/` (Today), first-run state (`hasEverRun === false`)
- Problem (rendered evidence, 2026-07-15 visual pass): after onboarding, the Today page shows the "Let's run your first check" hero card PLUS a zeroed stat strip ("0 New / 0 Updated / 0 Strong matches / 0 Possible trials") and a full two-column layout of empty modules: Check status ("No checks yet"), Questions for the doctor ("No questions yet"), Where we looked, Recently found ("Nothing found yet"), plus empty briefing sections. Two identical primary CTAs render simultaneously (page-header button and hero-card button, both "Run your first check").
- Design evidence: the product's own first-run pattern - the `first-run-card` already exists and is the designated first-run focus; onboarding's final step hands the user to exactly one action. The duplicated CTA contradicts single-primary-action presentation used everywhere else on the surface (one `primary-button` per view).
- Owner: `apps/desktop/src/pages/DashboardPage.tsx` (all modules are conditionally rendered inline).
- Scope and affected surfaces: Today page first-run and checking states only. Post-first-check dashboard unchanged.
- Uncertainty: whether "Where we looked" (source list) has first-run value. Decision below keeps it hidden pre-first-check because the first-run card already names all sources in its mini-stats grid.

## Design decision

Before the first check has ever run, render only: page header (title, lede, no header action) + the first-run hero card with the single "Run your first check" CTA. The stat strip and both dashboard columns appear only once `hasEverRun` is true. This makes the first-run moment read as one calm invitation - matching the app's "calm briefing" voice - and modules earn their place by having data.

## Reuse

- `first-run-card` (`apps/desktop/src/index.css`) - existing hero treatment.
- Existing `hasEverRun` boolean (`DashboardPage.tsx:126`) - already gates `TodayActions` and the "What changed" hero card; extend the same gate.
- Exemplar: `{hasEverRun && <TodayActions .../>}` at `DashboardPage.tsx:150-156`.

## Changes

1. `apps/desktop/src/pages/DashboardPage.tsx` (page-header actions)
   - Change: render the header `primary-button` only when `hasEverRun` is true, so the first-run card's button is the page's single CTA before the first check.
   - Preserve: header button behavior/labels for all post-first-run states ("Check now" / "Checking...").
   - Verify: first-run view contains exactly one "Run your first check" button.

2. `apps/desktop/src/pages/DashboardPage.tsx` (stat strip)
   - Change: wrap `.stat-strip` in `{hasEverRun && ...}`.
   - Preserve: exact markup post-first-run.
   - Verify: no zeroed stat strip on first run; stats appear after the first check completes.

3. `apps/desktop/src/pages/DashboardPage.tsx` (dashboard layout)
   - Change: wrap `.dashboard-layout` (main briefing column + side column) in `{hasEverRun && ...}`.
   - Preserve: all module internals, ids (`dashboard-blockers` anchor), and empty states for the post-run case.
   - Verify: first-run view is header + first-run card only; after the first check, all modules render with real data.

4. Checking state (first run in progress)
   - Change: none beyond the above; the existing "Checking for new research..." callout remains the progress surface. Once `triggerRun` creates a run, `hasEverRun` flips true and modules appear as the check populates them.
   - Verify: clicking the CTA immediately shows the checking callout; no dead-empty flash.

## Scope

- Inherit: Today page first-run and first-check states.
- Verify: e2e `onboarding.spec.ts` (asserts dashboard heading after onboarding - unaffected), `ui-polish.spec.ts` dashboard screenshot.
- Exclude: post-first-run dashboard composition; briefing section internals; other pages' empty states.

## Validation

- Product: new user lands on Today and sees one clear action; after running it, the full dashboard earns its layout.
- Interface: states - fresh profile (no runs), run in progress, completed run, failed run (error callout still renders above the first-run card).
- System: reuses the existing `hasEverRun` gate; no new primitives.
- Repository: `npm --workspace apps/desktop run test` -> green; visual harness first-run screenshot shows single CTA and no empty modules.

## Stop conditions

- Stop if `hasEverRun` proves unreliable (e.g., latest_run persists across profile switches incorrectly); gate would need a per-profile signal instead.

## Design documentation

- After acceptance: record "first-run surfaces show one primary action; modules render only once they can hold data" in the design contract header. Destination: `apps/desktop/src/index.css` header comment.
