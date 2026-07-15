# Bring the Discoveries landing title into the surface's Title Case convention

Written against: b5612ee

## Evidence chain

- Surface: `apps/desktop/src/pages/DiscoveriesPage.tsx:71` (h1) and `:21` (tab label), route `/discoveries` and `/saved-findings`
- Problem: The page title "Saved for discussion" is sentence case. Every sibling page h1 on the same surface uses Title Case: "Patient Details", "Trials to Consider", "Research Updates", "Summary for the Doctor", "What's New", "Reports", "Settings", "About / Support".
- Design evidence: Internal contradiction in user-facing presentation across sibling pages of the same task family (all rendered through the same `page-header` composition).
- Owner: `apps/desktop/src/pages/DiscoveriesPage.tsx`.
- Scope and affected surfaces: DiscoveriesPage h1, its tab label (line 21), and tests that assert the literal string.
- Uncertainty: none for the casing direction (8 Title Case vs 1 sentence case).

## Design decision

Retitle to "Saved for Discussion" in both the h1 and the tab label so the Discoveries landing matches the casing convention every sibling page follows.

## Reuse

- Exemplar: `apps/desktop/src/pages/TrialMatchesPage.tsx:56` ("Trials to Consider") - Title Case with lowercase particles.

## Changes

1. `apps/desktop/src/pages/DiscoveriesPage.tsx:71`
   - Change: `<h1>Saved for discussion</h1>` -> `<h1>Saved for Discussion</h1>`
   - Preserve: eyebrow "Your shortlist", lede copy, header actions.
   - Verify: rendered h1 reads "Saved for Discussion".

2. `apps/desktop/src/pages/DiscoveriesPage.tsx:21`
   - Change: tab `label: 'Saved for discussion'` -> `label: 'Saved for Discussion'`
   - Preserve: `key: 'saved'`, `to: '/saved-findings'`.
   - Verify: tab strip renders the corrected label; active state at `/saved-findings` unchanged.

3. Test sweep
   - Change: update literal assertions in `apps/desktop/src/pages/navigation.test.tsx:114-117` (findByText and link-name assertions).
   - Verify: `npm --workspace apps/desktop run test` passes.

## Scope

- Inherit: Discoveries landing and its tab strip.
- Verify: any e2e flow that clicks the "Saved for discussion" link by name.
- Exclude: retitling the page concept (name stays "Saved for Discussion"; no IA change); the "Discoveries" nav label.

## Validation

- Product: user sees consistent title casing across all pages.
- Interface: `/discoveries` and `/saved-findings` states.
- System: `grep -rn "Saved for discussion" apps e2e --include="*.ts*" | grep -v node_modules` -> no matches after change.
- Repository: unit + e2e suites green.

## Stop conditions

- Stop if a product decision surfaces that page titles should move to sentence case globally; that is a different, surface-wide plan.

## Design documentation

- After acceptance: record "page h1 and tab labels use Title Case" alongside the design contract in `apps/desktop/src/index.css` header comment (or DESIGN.md if created).
