---

version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: Cronko web app (all screens)

Mode: Operate. Visitor: a developer/sysadmin diagnosing an alert or taking an occasional glance. Build path: code-led.

Chosen world: **Quadro de Partidas** (airport / rail departures board). IMPECCABLE'S PICK. Sketch: `.impeccable/mocks/decision/model-pick.html`.

## Direction contract

THESIS: Every job run is a departure: on time, late, failed or cancelled. The app refuses the category default of rounded cards on a grey ground and treats the table of departures as the product.

OWN-WORLD: Near-black graphite ground (#14161a family, tinted, never pure black), warm board-white text (#f1e9d0 family), a single signalling amber (#f2b705) for the header rule, active tab and focus; state colours carry meaning only (healthy green, failed magenta-rose, down red, missed amber-brown, paused slate, pending blue) and are always paired with a text label and a distinct glyph shape. Tabular monospaced figures for times, durations and exit codes; a workhorse humanist sans for names and labels. Dense rows, hairline dividers, state badges as solid chips. Light theme inverts to warm paper with the same amber and the same state hues adjusted for contrast.

STORY: The visitor understands in one glance what needs attention, opens the failing job, and sees when it ran, how long, its exit code and output, then acts (pause, edit, ack). Quiet and uneventful when everything is fine.

FIRST VIEWPORT: Top bar with CRONKO wordmark left, live date/clock right, a 3px amber rule below; standard tab navigation (Painel, Monitores, Incidentes, Canais, Ajustes); a one-line attention summary (count of failed/down/late) then the departures table: NEXT, JOB, SCHEDULE, DURATION, EXIT, STATE, sorted by severity; the primary action "Novo monitor" sits top right of the table header.

FORM: Departures board, position 1 on my grounded list; assigned was my 5th (Tide Almanac), the user chose the pick. seed:063984b72579c4a3.

SIGNATURE MOVE: severity-sorted departures table with solid state chips and a mono time column, plus a quiet board-style clock in the top bar.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
