# FamilyOS design fidelity

## Reference and scope

The supplied `Family Calendar for Fire TV.html` is the visual source of truth. Its
seven TV frames inform Home, the weekly Calendar, Chores, Meals, recipe detail,
Lists, and the original ambient Photos view. Per the subsequent UI revision,
Photos now uses an empty state and every page shares the same navigation bar.
Family and Settings extend the same visual
language. The seven phone frames remain companion-app reference material for
Phase 10; this change does not implement mobile sync or a phone application.

Existing Rivera household data is preserved, so dates, names, event counts, and
calendar density differ from the mockup. The light palette follows the reference;
dark mode is a matching adaptation. The UI skill's preference for reusing a
designer's components was followed; the supplied design takes precedence over
its generic styling defaults.

## Typography and layout

- Figtree body text: original font outlines at weights 400, 500, 600, 700, and 800.
- Bricolage Grotesque headings: original outlines at weights 700 and 800, with
  static optical-size instances for 34, 38, 40, 44, 56, 64, 68, and 96 as used.
- Home headline: 56 px / 800; board titles: 68 px / 800; recipe title: 64 px / 800.
- Main navigation: Figtree 26 px; chore/list rows: 26 px; calendar event titles:
  20 px / 800.
- Reference canvas: 1920 × 1080, uniformly scaled and centered on smaller TV
  windows. No independent font shrinking or system-font substitution.
- Shared safe area: 96 px horizontally, 54 px at the top, 40 px at the bottom; briefing panel:
  1728 × 235 px; Today/Family panels: 1070/630 px with a 28 px gutter.

`setup/inspect-design-reference.cjs` extracts screen measurements, embedded fonts,
and icon artwork from the supplied HTML with external requests blocked.
`setup/convert-design-fonts.py` instantiates native-compatible TTF faces. The
generated family aliases identify weight and optical size without synthetic bold.
Original font copyright notices are retained; both SIL OFL licenses accompany
the fonts in the shared package and Vega's `assets/fonts` directory.

## Working preview behavior

- Home event shortcuts, preparation controls, and menu navigation.
- Calendar Day/Week/Month views, date navigation, member filters, event details,
  and error recovery. The reference's default 7 AM–9 PM grid is used.
- Chore completion/undo, routine steps, progress counts, and upcoming chores.
- Local weekly meal names, a sample Taco night recipe, ingredient checklist,
  and adding missing ingredients to Groceries.
- Three shared-list demo boards, check/uncheck, add items, and clear checked.
- Light/dark switching, reset, and local demo-provider refresh.
- All pages share the same seven-tab navigation, including Home, Photos, and Settings.
- Photos shows a simple “No photos yet” empty state, without ambient clock or event cards.
- Weather icons follow the provider condition and temperatures explicitly show °F.
- Appearance is controlled by a Dark mode toggle in Settings, not in the header.

Browser edits persist in local storage. Native preview edits are session-only.
Voice entry, real photo uploads, phone sync, real calendar/weather accounts,
recipe import, permissions, and reward approvals are not claimed as implemented.
These design previews do not mark Phases 7–10 complete.

## Local verification

`setup/test-design-ui.cjs` runs Playwright against the exported local preview.
It checks actual font families/sizes and Home geometry, captures all major TV
screens in both themes, and exercises remote navigation, calendar views and
filters, event checklists, chores/routines, list/meal editing, Back behavior,
reload persistence, and 1280 × 720 scaling. Results and screenshots are under
`artifacts/ui-design/`. It uses an isolated browser context, not the user's data.

Run with an existing Playwright installation via `FAMILYOS_PLAYWRIGHT`, a Chromium
executable via `FAMILYOS_CHROMIUM`, and optionally `FAMILYOS_PREVIEW_URL`. Defaults
point to the local tools used for this workspace.

```powershell
# From apps/expo-multi-tv:
node node_modules/expo/bin/cli export -p web --output-dir ../../web-build/design-faithful
# From the workspace root, in a separate terminal:
python -m http.server 8131 --bind 127.0.0.1 --directory web-build/design-faithful
# From the workspace root:
node setup/test-design-ui.cjs
```

Shared UI, Expo, and Vega TypeScript checks and existing Jest tests are also run.
Vega SDK packaging, font rendering on a physical TV, and device remote behavior
still require the planned Vega-device acceptance pass. No AWS resources were used.
