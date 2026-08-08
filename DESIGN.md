---
name: conference-engine
description: Self-hosted conference program pipeline — dev-tool canon, played straight.
colors:
  ink-ground: "#0a0a0b"
  ink-foreground: "#ededed"
  graphite: "#171717"
  carbon-line: "#262626"
  smoke: "#a3a3a3"
  steel: "#737373"
  char: "#525252"
  paper-ground: "#fafafa"
  paper-card: "#ffffff"
  paper-line: "#e5e5e5"
  input-line: "#d4d4d4"
  emerald-signal: "#10b981"
  emerald-bright: "#34d399"
  conflict-red: "#dc2626"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem (sm: 3rem, lg: 3.75rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem (sm: 1.875rem)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.025em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "80px"
  hour-row: "64px"
components:
  button-primary:
    backgroundColor: "{colors.emerald-signal}"
    textColor: "{colors.ink-ground}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.emerald-bright}"
  button-solid:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-solid-hover:
    backgroundColor: "{colors.carbon-line}"
  input-field:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-pill-active:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  card-dark:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  card-light:
    backgroundColor: "{colors.paper-card}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

# Design System: conference-engine

## Overview

**Creative North Star: "The Product Is the Hero"**

conference-engine's visual world is the developer-tool category standard played completely straight — the Linear/Vercel/Resend/Stripe/PostHog register with no irony and no smuggled quirk. This is a recorded brand commitment (PRODUCT.md, 2026-08-08): convention is the choice, and future visual work refines within this canon rather than re-litigating the direction. The landing page proves the thesis literally — instead of a tall centered hero with a screenshot in a browser frame (explicitly refused), the page opens with a compact left-aligned headline band and then hands ~70% of the viewport to a live-looking schedule builder catching a real speaker conflict. The product demonstrates itself; the marketing copy stands aside.

The system is two-toned by design. The Persuade surface (landing) lives in a near-black world (#0a0a0b) with off-white text, a single emerald accent, and hairline neutral borders doing all the structural work. The Operate and Read surfaces (admin, review board, speaker portal, CFP, public schedule) are deliberately light workhorse rooms — pale neutral ground, white cards, graphite text — sharing the same Geist typeface and the same neutral scale. This is the Stripe-style marketing/app split, and it is intentional, not drift.

Density is dev-tool density: 13px and 11px micro-type is normal inside functional components, tables and grids are tight, and whitespace is spent on marketing sections (80–96px vertical) rather than inside working UI. Motion is nearly absent; one authored moment exists (the mid-drag card's hover) and it is gated behind `prefers-reduced-motion`.

**Key Characteristics:**
- Dark canon marketing surface, light workhorse app surfaces — one type system, one neutral scale, two grounds.
- One accent (emerald), spent on actions and liveness; red exists for exactly one job per surface.
- Structure from 1px borders (solid, dotted, dashed each carry distinct meaning), not from shadows or background contrast.
- Semibold (600) is the heaviest weight anywhere; hierarchy comes from size and neutral value.
- The schedule grid is the signature artifact: 64px hour rows, dotted hour lines, tabular numerals.

## Colors

A neutral-dominated palette where the entire Tailwind neutral scale is the shared spine and emerald is the only voice with an opinion.

### Primary
- **Emerald Signal** (`{colors.emerald-signal}`, #10b981): the single brand accent. Solid fill on exactly one element per dark viewport (the "Open demo" nav button, dark text on it); the logo mark's stroke and dot; the drag-card's active border at 60% opacity.
- **Emerald Bright** (`{colors.emerald-bright}`, #34d399): emerald's interactive register — arrow links, the highlighted headline phrase ("Nothing stalls."), the live-status dot, hover states of emerald elements, and the global `:focus-visible` outline (2px, offset 2px, defined in `globals.css`).

### Secondary
- **Conflict Red** (`{colors.conflict-red}`, #dc2626): on the dark canon surface, this appears exactly once — the speaker-conflict banner (solid red-600 fill, red-400/60 border, white semibold text). On light app surfaces, red is error semantics only (red-50 panel, red-200 border, red-800/900 text for expired magic links).

### Neutral
- **Ink Ground** (`{colors.ink-ground}`, #0a0a0b): the near-black page ground of the dark world, set as `--background` in `globals.css`. Tailwind's `neutral-950` (#0a0a0a) is its working twin on the landing wrapper and bottom fade.
- **Ink Foreground** (`{colors.ink-foreground}`, #ededed): base text on dark, set as `--foreground`; in practice the landing steps through neutral-100/200 for primary text.
- **Graphite** (`{colors.graphite}`, #171717): dual-duty. On dark surfaces it is the raised card fill (slot cards, code block, rail items). On light surfaces it is primary text and the solid button/active-pill fill.
- **Carbon Line** (`{colors.carbon-line}`, #262626): the 1px border that draws the entire dark world — nav bottom edge, section dividers, card outlines, dotted hour lines. Also the hover fill of the light solid button.
- **Smoke** (`{colors.smoke}`, #a3a3a3): secondary text on dark (descriptions, metadata, idle nav links).
- **Steel** (`{colors.steel}`, #737373): tertiary text in both worlds — eyebrows, time-ruler labels, counts.
- **Char** (`{colors.char}`, #525252): secondary text on light surfaces.
- **Paper Ground** (`{colors.paper-ground}`, #fafafa): the app-surface ground (`bg-neutral-50`), applied by route-group layouts (`/review`, `/portal`, `/e`) and admin pages.
- **Paper Card** (`{colors.paper-card}`, #ffffff): white card and input fill on light surfaces.
- **Paper Line** (`{colors.paper-line}`, #e5e5e5): 1px border and divider on light surfaces.
- **Input Line** (`{colors.input-line}`, #d4d4d4): input and segmented-control border on light surfaces; its dashed form marks empty states and upload targets.

### Named Rules
**The Marketing/App Split Rule.** The dark canon world (near-black + emerald) governs the Persuade surface — the landing page. Operate/Read surfaces (admin, review, portal, CFP, public schedule) are deliberately light workhorse surfaces on Paper Ground with Graphite text, sharing Geist and the neutral scale. Never darken the app surfaces to match the landing, and never lighten the landing to match the app.

**The One Red Rule.** On the dark surface, red renders exactly one element: the conflict banner. Its singularity is the message — the system caught something. On light surfaces red means error state, nothing else. Red is never decorative, never a second accent.

**The Emerald Budget Rule.** Emerald marks actions and liveness only — one solid CTA per viewport, arrow links, the live dot, focus rings, the active drag border. It never fills large areas, never tints backgrounds, and never appears on the light app surfaces' controls (those are graphite).

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui fallback)
**Body Font:** Geist (same family, single-family system)
**Label/Mono Font:** Geist Mono (with ui-monospace fallback)

**Character:** One neutral grotesk doing everything, differentiated by size, weight ceiling, and tightening tracking as size grows. Confident, quiet, engineered — the voice of a tool that expects to be trusted, not admired.

### Hierarchy
- **Display** (600, 2.25rem stepping to 3.75rem at `lg`, tight leading, −0.02em): the landing headline only. Left-aligned, `text-balance`, with one phrase colored Emerald Bright.
- **Headline** (600, 1.5rem stepping to 1.875rem, −0.025em): landing section headings ("The whole program pipeline, one system").
- **Title** (600, 1.875rem, −0.025em): app page titles via the shared `PageHeader` component; item-level titles drop to 1.125rem/500.
- **Body** (400, 0.875rem base, 1rem for landing lede, relaxed leading on long descriptions): Smoke on dark, Char on light. Long text capped near `max-w-xl`/`max-w-2xl` (~65ch).
- **Label** (500, 0.75rem, +0.025em, UPPERCASE): the eyebrow above every app page title ("Organizer · Dashboard", "Speaker portal") in Steel. Inside dense components the ramp continues down: 13px medium for card titles, 11px for metadata, 10px for tag chips.
- **Mono** (400, 0.8125rem): the deploy code block; mono at 0.75rem for clock times on the public schedule.

### Named Rules
**The Semibold Ceiling Rule.** Nothing in the system is heavier than 600. Emphasis comes from size, color value, and spacing — never from bold or black weights.

**The Tabular Time Rule.** Anything numeric that aligns vertically — hour-ruler labels, pipeline indices ("01"–"06"), clock ranges — sets `tabular-nums` or Geist Mono. Zero-padded 24h times ("09:00") on grids.

## Layout

Marketing container is `max-w-7xl` (80rem) with 16px gutters, 24px at `sm`. App surfaces narrow by role: `max-w-6xl` for the admin nav band, `max-w-4xl` for dashboards, `max-w-2xl` for the speaker portal, `max-w-lg` for focused forms — the container is sized to the task's reading width, not to a fixed shell.

Vertical rhythm splits by surface: landing sections breathe at 80–96px (`py-20`/`py-24`); app pages sit at a uniform 40px (`py-10`) under a slim horizontal nav. Spacing inside components runs the Tailwind 4px scale, mostly 8–24px steps.

The schedule grid is the one measured artifact: 64px per hour (`HOUR_PX = 64`), a 44px time-ruler column, then equal room lanes (`grid-cols-[44px_repeat(3,1fr)]`), with slot positions computed in minutes. The unscheduled rail is a fixed 240px aside that disappears below `lg`. Breakpoints observed: `sm` 640px and `lg` 1024px carry nearly all responsive change; grids collapse to single column, secondary nav links hide behind `sm`.

## Elevation & Depth

Flat by conviction. Surfaces at rest are separated by 1px borders and small background steps (Ink Ground → Graphite on dark; Paper Ground → Paper Card on light) — never by shadow. The only shadows in the build belong to elements physically lifted out of the plane mid-interaction: the mid-drag schedule card (`shadow-xl` in black at 60%) and the conflict banner (`shadow-lg` in black at 40%). The sticky landing nav gets depth from translucency instead: 80% Ink Ground with `backdrop-blur` over the scrolling grid.

### Shadow Vocabulary
- **Lifted card** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.6), 0 8px 10px -6px rgb(0 0 0 / 0.6)`): the dragged schedule card, tilted 1.5° and floating above its dashed ghost target.
- **Alert float** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)`): the conflict banner overlapping the grid.

### Named Rules
**The Lifted-Only Shadow Rule.** A shadow means the element is off the surface right now — dragging, alerting. Resting cards, buttons, inputs, and navs never carry one.

## Shapes

Small radii throughout, scaled to element size: 4px on tag chips and legacy inputs, 6px (`rounded-md`) as the workhorse for buttons, slot cards, pills, and inputs, 8px (`rounded-lg`) for light-surface cards and segmented controls, 12px (`rounded-xl`) reserved for the largest framed panels (dashboard mock, code block), and full-round only for status pills and the live dot. No sharp corners, no large radii, no clipping tricks.

Border style is a grammar of its own: **solid** 1px = structure (cards, dividers, nav edges); **dotted** = the passage of time (hour lines on the grid); **dashed** = potential space (the drop-target ghost, empty states, upload zones). The one expressive silhouette is the mid-drag card's 1.5° rotation — the only non-rectilinear geometry in the system.

Motion follows the same restraint: hover states are color swaps; the single authored animation is the drag card's 3px hover (`drag-hover`, 2.6s, `cubic-bezier(0.16, 1, 0.3, 1)`, infinite alternate) plus a `motion-safe` ping on the live dot, both disabled under `prefers-reduced-motion`.

## Components

### Buttons
- **Shape:** workhorse radius (6px), text at 0.875rem/500.
- **Primary (dark surface):** Emerald Signal fill with near-black text (`button-primary`), compact 6px × 14px padding — one per viewport.
- **Solid (light surface):** Graphite fill, white text (`button-solid`); hover shifts to Carbon Line; disabled drops to 40–50% opacity. This is the app's only filled button.
- **Secondary (light surface):** white fill, Input Line border, graphite text at 0.75rem/500.
- **Hover / Focus:** color-only transitions; focus is the global 2px Emerald Bright outline with 2px offset.
- **Arrow link (dark surface):** the marketing CTA of record — Emerald Bright text with an inline 14px stroked arrow, hover lightening one emerald step. Neutral variant in neutral-300 → neutral-100 for the secondary path.

### Chips
- **Dark (tag chips):** 10px text in Smoke, 1px neutral-700/80% border, 4px radius, hairline padding — metadata tags on rail cards.
- **Light (status/meta):** white fill, Input Line border, 0.75rem neutral-700 text, 6px radius.

### Cards / Containers
- **Dark:** Graphite fill, Carbon Line 1px border, 6px radius, compact 10px × 6px internal padding (slot cards) up to 16px (framed panels at 12px radius). No shadow at rest.
- **Light:** Paper Card fill, Paper Line 1px border, 8px radius, rows divided by `divide-neutral-200`, 12–16px padding.
- **Empty state (light):** dashed Input Line border, Paper Ground or white fill, centered two-line message (medium title + Char body), generous 32–40px vertical padding.

### Inputs / Fields
- **Style:** white fill, 1px Input Line border, 6px radius, 8px × 12px padding, 0.875rem text (light surfaces only — the dark surface has no forms).
- **Focus:** the global Emerald Bright outline; no border-color shift.
- **Upload target:** dashed-border label block that darkens its border on hover.
- **Segmented control:** white pillbox (Input Line border, 8px radius, 2px inner padding) holding pills; the active pill takes the Graphite solid treatment.

### Navigation
- **Landing:** sticky 56px translucent bar (80% Ink Ground + blur, Carbon Line bottom edge); logo mark + semibold tracking-tight wordmark left, Smoke links that lighten on hover, single emerald CTA right.
- **Admin:** white band with Paper Line bottom edge, `max-w-6xl`, 0.75rem/500 pill links — active pill Graphite-on-white inverted, idle pills Char text with neutral-100 hover; sections separated by a 1px vertical rule.

### The Schedule Grid (signature)
The product-as-hero artifact and the system's densest expression: 44px time ruler with tabular 24h labels, dotted Carbon Line hour rules every 64px, room lanes split by 70%-opacity solid borders, positioned slot cards (13px medium title, 11px Smoke meta), a dashed ghost drop-target, the tilted floating drag card with emerald border, and the lone red conflict banner. On the landing it renders borderless — no browser chrome, no container — and dissolves into the page through a bottom gradient fade to neutral-950.

## Do's and Don'ts

### Do:
- **Do** keep the marketing/app split: Ink Ground + emerald for Persuade, Paper Ground + Graphite for Operate/Read, Geist and the neutral scale shared across both.
- **Do** draw structure with 1px borders and use the border grammar — solid for structure, dotted for time, dashed for potential/empty.
- **Do** spend emerald only on actions and liveness (one solid CTA per viewport, arrow links, live dot, focus ring), and keep the 2px Emerald Bright `:focus-visible` outline global.
- **Do** use dev-tool density in working UI: 13px/11px micro-type, tabular numerals for anything time- or index-shaped, tight paddings; save the whitespace for marketing sections.
- **Do** gate every animation behind `prefers-reduced-motion` / `motion-safe` — the build has exactly two moving things and both are gated.

### Don't:
- **Don't** build a tall centered hero with a screenshot in a browser frame — the direction contract explicitly refuses it; the product renders live, borderless, and fades into the page.
- **Don't** darken the app surfaces to match the landing, or introduce emerald fills into light-surface controls (the app's filled button is Graphite).
- **Don't** use red anywhere except the single conflict banner (dark) or error states (light) — no second accent, no decorative red.
- **Don't** put shadows on resting elements; a shadow means mid-drag or alert, nothing else.
- **Don't** exceed weight 600 or reach for a second typeface — hierarchy is size, neutral value, and spacing in Geist alone.
