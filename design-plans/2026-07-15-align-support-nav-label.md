# Align the Support nav label with its destination page title

Written against: b5612ee

## Evidence chain

- Surface: `apps/desktop/src/components/Sidebar.tsx:18` (Configure nav group, rendered on every app screen) and `apps/desktop/src/pages/SupportPage.tsx:83` (route `/support`)
- Problem: The sidebar nav item reads "About / Help" while the page it opens is titled "About / Support". Same destination, two different names, visible simultaneously (sidebar persists while the page renders).
- Design evidence: Direct contradiction in user-facing presentation within the same task. All other nav labels on this surface match their destination page titles exactly ("Patient Details" -> "Patient Details", "Settings" -> "Settings").
- Owner: `apps/desktop/src/components/Sidebar.tsx` CONFIGURE_ITEMS array.
- Scope and affected surfaces: Sidebar (every screen); SupportPage title unchanged.
- Uncertainty: none. Route name (`/support`) and component name (`SupportPage`) corroborate "Support" as the destination's identity; the page title wins.

## Design decision

Rename the sidebar label from "About / Help" to "About / Support" so the navigation promise matches the destination. Do not change the page title: two of three identity signals (route, component) already say Support.

## Reuse

- Existing nav config shape in `Sidebar.tsx` (CONFIGURE_ITEMS entry).
- Exemplar: the "Settings" entry at `apps/desktop/src/components/Sidebar.tsx:17`, whose label matches `SettingsPage.tsx` h1 exactly.

## Changes

1. `apps/desktop/src/components/Sidebar.tsx:18`
   - Change: `label: 'About / Help'` -> `label: 'About / Support'`
   - Preserve: `to: '/support'`, item order, group placement under "Configure".
   - Verify: sidebar renders "About / Support"; clicking it opens the page titled "About / Support".

2. Test sweep
   - Change: update any test asserting the literal "About / Help" (check `apps/desktop/src/pages/navigation.test.tsx` and `e2e/ui-polish.spec.ts` which contains an "About / Help" section comment and may assert the link name).
   - Verify: `npm --workspace apps/desktop run test` and `npx playwright test e2e/ui-polish.spec.ts` pass.

## Scope

- Inherit: every app screen (sidebar is global).
- Verify: e2e specs that navigate via link name.
- Exclude: SupportPage content and title; marketing site copy.

## Validation

- Product: user scanning the sidebar finds the same name the page announces.
- Interface: route `/support` active state still highlights the renamed item.
- System: no other surface references the literal "About / Help" after the sweep.
- Repository: `grep -rn "About / Help" apps e2e --include="*.ts*" | grep -v node_modules` -> no matches.

## Stop conditions

- Stop if product intent is discovered that "Help" is the deliberate user-facing term (e.g., docs or support copy standardizing on Help); then invert the correction (retitle the page) under a new decision.

## Design documentation

- After acceptance: record "nav labels must match destination page titles verbatim" in the index.css header contract or a DESIGN.md if one is created. Destination: `apps/desktop/src/index.css` header comment.
