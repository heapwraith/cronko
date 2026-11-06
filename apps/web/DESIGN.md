---
name: Cronko
description: "A logbook for scheduled jobs: every run is an entry, every alert leads to the entry that explains it."
colors:
  paper: "oklch(0.975 0.012 85)"
  paper-raised: "oklch(0.992 0.006 85)"
  paper-sunk: "oklch(0.945 0.014 85)"
  rule: "oklch(0.88 0.016 80)"
  rule-strong: "oklch(0.74 0.02 75)"
  ink: "oklch(0.22 0.02 60)"
  ink-soft: "oklch(0.42 0.02 60)"
  ink-faint: "oklch(0.55 0.02 60)"
  accent-ink-blue: "oklch(0.38 0.1 255)"
  accent-ink-blue-hover: "oklch(0.31 0.1 255)"
  on-time: "oklch(0.5 0.12 150)"
  late: "oklch(0.58 0.13 70)"
  down: "oklch(0.5 0.18 27)"
  failed: "oklch(0.45 0.14 350)"
  paused: "oklch(0.5 0.02 255)"
  lamp-ground: "oklch(0.2 0.012 60)"
  lamp-raised: "oklch(0.25 0.013 60)"
  lamp-text: "oklch(0.93 0.015 85)"
  lamp-accent: "oklch(0.78 0.1 255)"
typography:
  display:
    fontFamily: "Newsreader Variable, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Newsreader Variable, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: 1.5
    fontFeature: "'tnum' 1, 'zero' 1"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent-ink-blue}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-ink-blue-hover}"
  button-secondary:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  log-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "16px 0"
  dialog:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Cronko

> Status: **migration nearly complete** (tokens, masthead, ledger tables, state stamps, dashboard, login, monitor list and detail are on this system; incidents, notifications, settings and how-to now use rule-separated sections instead of boxes; the run timeline is not built). Replaces the earlier
> "Quadro de Partidas" (graphite and amber departures board), which is retired. Re-run the
> documenter in scan mode once the build lands.

## Overview

**Creative North Star: "The Logbook"**

Cronko keeps a logbook for jobs that run when nobody is watching. Each run is an entry:
when it ran, how long it took, how it ended. The interface is the page of that book, not a
control room. It is calm when nothing is wrong and precise when something is: an alert
opens the single entry that explains it, with the previous good entry beside it for
comparison.

The surface is warm paper and dark ink, set in a serif for headings and a hyperlegible
sans for everything you read, with monospaced figures only for data (times, durations,
exit codes). Structure comes from hairline rules and white space, not from boxes: a screen
is a ruled page, not a grid of cards. There is one accent, a deep ink blue, used for the
primary action and for focus. State is carried by drawn glyphs and words first, colour
second.

It rejects the category defaults: dark DevOps dashboards, neon status lights, gradient
hero numbers, rounded cards on a grey ground, and the airport-board costume it replaces.

**Key Characteristics:**
- Light by default (paper); a warm "lamplight" dark theme, never pure black.
- Rules and space instead of containers; no nested cards.
- Serif headings, sans body, mono only for data.
- One accent, rare. State = glyph + word + colour, in that order of importance.
- The run entry, not the monitor list, is the centre of the product.

## Colors

Warm paper neutrals with one cool ink-blue accent and a small, hue-separated state set.

### Primary
- **Ink Blue** (`oklch(0.38 0.1 255)`): primary actions, links in running text, focus ring. In dark: **Lamplight Blue** (`oklch(0.78 0.1 255)`). The only chromatic colour that is not a state.

### Neutral
- **Paper** (`oklch(0.975 0.012 85)`): page ground.
- **Raised Paper** (`oklch(0.992 0.006 85)`): inputs, dialogs, the selected run.
- **Sunk Paper** (`oklch(0.945 0.014 85)`): code blocks, output panes, table header.
- **Rule** (`oklch(0.88 0.016 80)`) / **Strong Rule** (`oklch(0.74 0.02 75)`): hairlines; strong for table header and focus-adjacent separators.
- **Ink** (`oklch(0.22 0.02 60)`), **Soft Ink** (`oklch(0.42 0.02 60)`), **Faint Ink** (`oklch(0.55 0.02 60)`): text tiers. Faint is for metadata only and must hold 4.5:1.
- **Lamp Ground** (`oklch(0.2 0.012 60)`), **Lamp Raised** (`oklch(0.25 0.013 60)`), **Lamp Text** (`oklch(0.93 0.015 85)`): the dark theme.

### State (always paired with a glyph and a word)
- **On time** `oklch(0.5 0.12 150)`, **Late** `oklch(0.58 0.13 70)`, **Down** `oklch(0.5 0.18 27)`, **Failed** `oklch(0.45 0.14 350)`, **Paused** `oklch(0.5 0.02 255)`. Pending has no colour: a dashed outline glyph in Soft Ink.

### Named Rules
**The One Voice Rule.** Ink Blue appears on at most one primary action per screen, on links inside prose, and on the focus ring. Its rarity is how the eye finds the next step.
**The Glyph-First Rule.** A state is read from its drawn glyph and word. Colour confirms it; removing colour must lose nothing.
**The Tint Rule.** A failing row gets a full-width tint of its state colour at 6% mixed in sRGB (not oklch, which drifts toward the paper hue). Never a coloured stripe on a side.

## Typography

**Display Font:** Newsreader Variable (Georgia, serif)
**Body Font:** Atkinson Hyperlegible Next Variable (system-ui, sans-serif)
**Data Font:** Geist Mono Variable (ui-monospace, monospace)

**Character:** A book serif that lends the page authority, set against a typeface built for legibility, so long diagnosis sessions at 2 a.m. stay readable.

### Hierarchy
- **Display** (500, 2.5rem, 1.1, -0.015em): the monitor name on its own page and empty-state headlines. One per screen at most.
- **Headline** (500, 1.75rem, 1.2): page titles on list screens.
- **Title** (600, 1.0625rem, 1.35): section headings, run summary line.
- **Body** (400, 0.9375rem, 1.6): all prose; 65 to 72ch maximum.
- **Label** (600, 0.75rem, +0.04em): table headers and field labels, sentence case, never full caps.
- **Data** (450, 0.8125rem, tabular, slashed zero): times, durations, exit codes, tokens, URLs, command output.

### Named Rules
**The Data-Only Mono Rule.** Mono marks something you could copy into a terminal or compare numerically. Labels, status words and prose are never mono.
**The One Serif Rule.** Serif is for headings only. Never in tables, chips, buttons or form fields.

## Layout

A ruled page. Reading column and app container share a left edge.
- Container 1120px, 32px margins on desktop, 16px on phones. Spacing scale 4/8/16/24/40/64 only.
- Lists are **ledgers**: rows separated by 1px Rule, 56px high (44px compact), no row backgrounds at rest, no outer box. Header row has Sunk Paper and a Strong Rule underline.
- Space above a heading is at least 1.5x the space below it; sections are 40px apart, inside a section 16px.
- Phones: the ledger becomes a stacked entry (name, state, then a second line of data); next time and exit code are never dropped.

### The run timeline (signature structure)
Each monitor page is a vertical timeline of run entries, newest first, with the failing or selected entry expanded in place. An entry shows when, duration against the median, exit code and output. The previous good entry is pinned for comparison. Alerts deep-link straight to the entry (`/monitors/:id/runs/:runId`).

## Elevation & Depth

Flat paper. Depth is conveyed by tone (Raised vs Sunk) and rules, not shadows. Only things that float above the page get a shadow: dialogs, toasts and the command palette.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 1px 0 oklch(1 0 0 / 0.6) inset, 0 12px 32px -12px oklch(0.2 0.02 60 / 0.35)`): dialogs, palette.
- **Toast** (`box-shadow: 0 8px 24px -10px oklch(0.2 0.02 60 / 0.35)`): toasts.

### Named Rules
**The Flat-By-Default Rule.** Nothing on the page itself has a shadow. If it seems to need one, it needs a rule or a tone change.

## Shapes

Squared and exact, like ruled stationery. Controls and chips use 2px; panels with real content (output panes) 4px; dialogs 8px. Borders are 1px hairlines. State "stamps" are outlined, not filled: glyph, word, 1px border in the state colour, 2px radius.

## Components

### Buttons
- **Shape:** 2px radius, 40px high, 16px side padding.
- **Primary:** Ink Blue on paper text. One per screen. Hover darkens one step; active shifts 1px down.
- **Secondary:** Raised Paper, 1px Strong Rule, Ink text. **Ghost:** text only, underline on hover.
- **Focus:** 2px outline in Ink Blue (Lamplight Blue in dark), 2px offset, on every interactive element. Never removed.

### State stamp
Outlined 2px-radius chip: drawn glyph + sentence-case word + 1px border in the state colour. Distinct shapes per state (check, triangle, octagon, cross, pause, dashed circle). Replaces the old solid caps chip.

### Ledger row
Name in Title weight (the loudest thing in the row), data in Data, state stamp at the end, hover reveals a quiet action cluster. A failing row takes the Tint Rule.

### Inputs / Fields
- 40px, Raised Paper, 1px Strong Rule, 2px radius; label above in Label style; hint below in Soft Ink; error in Down with a glyph, linked by `aria-describedby`.
- Focus: the standard outline. Disabled: 50% ink, no change of border.

### Navigation
Text tabs under the masthead, the active tab marked by a 2px Ink underline (not the accent). Masthead: wordmark in the serif, live date in Data. On phones the tab strip scrolls with an edge fade and snap.

### Dialogs, palette, toasts
Native `<dialog>`; Raised Paper, 8px radius, Overlay shadow, 150ms ease-out entrance. Command palette is the main navigation: it jumps to screens and runs actions ("pause X", "copy ping URL of Y"). Toasts use the state stamp, are announced via role status/alert, and carry a visible close button.

### Output pane
Sunk Paper, 4px radius, Data type, wrapped, 10 KB cap with a visible "truncated" note. Failure exit lines are marked by glyph, not only colour.

## Do's and Don'ts

### Do:
- **Do** make the run entry the destination of every alert, with the previous good run next to it.
- **Do** separate with rules and space; keep headings in the serif and everything else in sans or mono-for-data.
- **Do** pair every state colour with its glyph and word, and check the screen in greyscale.
- **Do** keep Ink Blue to one primary action per screen, prose links and focus.
- **Do** give the light theme equal care; dark is "lamplight", warm and never pure black.
- **Do** respect `prefers-reduced-motion`; one authored motion moment (an entry expanding), 150 to 200ms, exponential ease-out.

### Don't:
- **Don't** reintroduce the departures-board look: graphite ground, amber rule, solid all-caps chips.
- **Don't** wrap content in cards, nest panels, or box every section.
- **Don't** use a hero metric, gradient text, glass, glow, or a decorative chart standing in for content.
- **Don't** put a coloured stripe on the side of a row or callout; use the full-row tint.
- **Don't** set labels, status words or prose in mono, or put serif in tables and controls.
- **Don't** add a sparkline or chart that is not backed by a run the user can open.
