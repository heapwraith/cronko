---

version: 2
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: Cronko web app (all screens)

Mode: Operate. Visitor: a developer/sysadmin who arrives from an alert (phone first) or glances occasionally. Build path: code-led.

Chosen world: **The Logbook** (editorial, light by default). Replaces the retired "Quadro de Partidas". Full system in `apps/web/DESIGN.md`.

## Direction contract

THESIS: Every job run is an entry in a logbook. The product is the run timeline, not a monitor list: an alert opens the exact entry that explains it, beside the previous good one.

OWN-WORLD: Warm paper ground, dark ink, serif headings, hyperlegible sans body, mono only for data. Hairline rules and white space instead of boxes. One accent (ink blue) for the primary action and focus. State = drawn glyph + word + colour. Dark theme is warm "lamplight", never pure black.

STORY: The visitor taps an alert link, lands on the failing run, sees when it ran, how long against the median, exit code and output, compares with the last good run, then acts (acknowledge, pause, edit).

FUNCTIONAL SHAPE: List (ledger, entry point) -> Monitor (timeline of runs) -> Run (diagnosis, deep-linkable at /monitors/:id/runs/:runId). Command palette is the primary navigation. Phones keep next time, duration and exit code on a second line.

FIRST VIEWPORT (list): masthead with serif wordmark and live date; text tabs; one-line attention summary; the ledger sorted by severity, one primary action "Novo monitor".

SIGNATURE MOVE: the run timeline with the failing entry expanded in place and the last good entry pinned for comparison.

FINISH: unreviewed and undocumented is unfinished; the build ends with the finish review, the verdict, and a scan-mode refresh of DESIGN.md.
