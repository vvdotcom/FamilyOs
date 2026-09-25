# FamilyOS TV UI decisions

## Phase 2 screen notes

- **Appearance:** Settings offers Light and Dark choices. Light is the default and uses a warm-white canvas, white cards, dark readable type, and restrained teal controls, while the existing warm-midnight palette remains available as Dark. Household member colors remain consistent in both themes. This is a Skylight-inspired interpretation of its [display customization](https://skylight.zendesk.com/hc/en-us/articles/48784194278683-Adjust-the-Display) and [profile-color](https://skylight.zendesk.com/hc/en-us/articles/360032743912-How-do-I-change-the-color-of-my-profiles) approach, not a claim that Skylight specifies one global palette.

- **Home:** One cream briefing card leads the screen, followed by a readable upcoming-event list, family status, and pending chores. The seeded Jordan/Emma pickup conflict is surfaced once with Alex's deterministic availability; the call to action opens Calendar. There is no chatbot or live-AI claim.
- **Calendar:** Today is the default and Week is available through a large focusable toggle and day ribbon. Events use member-color accents and large text instead of a dense hourly grid. Month view is intentionally deferred.
- **Chores:** Pending/completed cards and the morning routine are display-only. Completing chores is reserved for the chore workflow phase so this shell does not imply a state change it cannot yet persist.
- **Conflict modal:** Deferred to the conflict-resolution phase. In this shell the briefing points to the calendar, where a single pickup card receives the warm warning treatment; no household assignment is changed automatically.
- **Ambient mode:** Deferred. The later frame view will reuse the same dark palette and remain distinct from the interactive dashboard.

## Shared TV shell and focus

- The same `FamilyOsShell` is mounted by the Expo TV and Vega roots. A vertical FamilyOS rail selects Home, Calendar, Chores, Family, or Settings.
- D-pad Right hands focus from the rail to the active page; D-pad Left returns it. Back from a child page returns Home, while Back on Home switches between the page and section rail. Browser keyboard Escape/Backspace mirrors the remote behavior.
- Only the active focus region is highlighted. Controls use a theme-appropriate high-contrast outline and a small scale lift; device/browser reduced-motion preferences disable the scale and make focus scrolling immediate.
- Home and Calendar use focus-aware scrolling so a D-pad-selected action stays in view on both 1080p and 720p layouts.
- The layout uses 64 px minimum safe margins at the 1920×1080 design resolution, 8 px spacing units, dark midnight surfaces, cream briefing surfaces, and consistent member colors plus initials/names.
- Theme colors are provided by the shared shell so the rail, screens, cards, buttons, and focus treatment switch together. The browser preview saves the selection locally; native builds currently apply it for the running session.

## Local verification scope

Phase 2 is verified with strict local TypeScript checks, 10 deterministic Jest tests, and Playwright against a local Expo web export at 1920×1080 and 1280×720. Playwright covers both themes, radio semantics and keyboard selection, browser reload persistence, and focus scrolling on Settings. No Vega Virtual Device, Fire TV hardware, cloud service, live weather, or calendar integration was used for this phase.
