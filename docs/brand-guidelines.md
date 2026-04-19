# Axis Analytics — Brand Guidelines

> Advanced analytics for NAIA basketball.

---

## 1. Brand Voice & Positioning

**Name:** Axis Analytics
**Domain:** axisbasketball.com
**Tagline:** _Every possession. Every rating. Every team._
**Elevator pitch:** RPI, strength of schedule, adjusted efficiency ratings, and live bracket forecasting — calculated from every box score across all 21 NAIA conferences.

### Voice
- **Data-forward, not sales-y.** Lead with the numbers (RPI, SOS, net rating, quadrant records).
- **Bold & sporty.** Confident, direct, slightly irreverent. Never corporate-speak.
- **For coaches first, fans second.** Assume the reader knows the sport — don't over-explain basics.

### Do
- "The NAIA's official RPI formula, calculated daily."
- "Possession-based metrics that cut through noise in the box score."
- "Every box score. Every conference. Every day."

### Don't
- "Leverage our synergistic analytics platform…"
- "Unlock powerful insights…" (generic SaaS filler)
- Use superlatives without numbers to back them up.

---

## 2. Logo

| Asset | Usage | File |
|-------|-------|------|
| Primary mark (light bg) | Default, light mode, print | `client/src/assets/logo.svg` |
| Inverted mark (dark bg) | Dark mode, colored backgrounds | `client/src/assets/logo-dark.svg` |

**Clear space:** Maintain padding equal to the height of the "A" in "Axis" on all sides.
**Min size:** 24px tall on screen, 0.5" in print.
**Don't:** recolor, rotate, stretch, or add effects (drop shadows, outlines, gradients).

---

## 3. Color System

Tokens live in [`client/src/index.css`](../client/src/index.css) as CSS custom properties. Always use the token — never a raw hex — so light/dark mode stays in sync.

### 3.1 Primary palette

| Role | Token | Light | Dark |
|------|-------|-------|------|
| **Accent / brand** | `--color-accent-primary` | `#C75A3A` | `#E07050` |
| Accent hover | `--color-accent-primary-hover` | `#B04E31` | `#D05E40` |
| Text primary | `--color-text-primary` | `#2C2C2C` | `#E8E4DC` |
| Text secondary | `--color-text-secondary` | `#666666` | `#A0A0A0` |
| Text tertiary | `--color-text-tertiary` | `#888888` | `#808080` |
| Bg primary | `--color-bg-primary` | `#F5F3EF` | `#1A1A1A` |
| Bg secondary | `--color-bg-secondary` | `#FFFFFF` | `#242424` |
| Bg header | `--color-bg-header` | `#E8E4DC` | `#1E1E1E` |
| Border primary | `--color-border-primary` | `#D4D0C8` | `#404040` |

**Brand orange (`#C75A3A`)** is the only truly "branded" color. Use it for:
- Primary CTAs and active states
- Key data highlights (leaders, winners, featured tier)
- The "accent" headline word in marketing copy

Everything else is a warm neutral greige system — intentionally quiet so data stands out.

### 3.2 Data visualization palette

Split into **warm (offense)** and **cool (defense)** so charts and tables encode meaning visually.

| Role | Token | Hex |
|------|-------|-----|
| Hot (offense strong) | `--color-data-hot-text` | `#C75A3A` |
| Warm | `--color-data-warm-text` | `#D4845A` |
| Cold (defense strong) | `--color-data-cold-text` | `#3A7BC7` |
| Cool | `--color-data-cool-text` | `#5A9AD4` |
| Chart line | `--color-chart-line` | `#2563EB` (light) / `#60A5FA` (dark) |

### 3.3 Semantic states

| State | Background | Text |
|-------|-----------|------|
| Win | `#E8F5E9` | `#2E7D32` |
| Loss | `#FFEBEE` | `#C62828` |

### 3.4 Regional accents (NAIA regions)

| Region | Bg | Text |
|--------|----|----|
| East | `#E3F2FD` | `#1565C0` |
| Midwest | `#FCE4EC` | `#C2185B` |
| North | `#E8F5E9` | `#2E7D32` |
| South | `#FFF3E0` | `#E65100` |
| West | `#F3E5F5` | `#7B1FA2` |

---

## 4. Typography

| Role | Font | Token | Usage |
|------|------|-------|-------|
| **Heading** | [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) | `--font-heading` | H1–H3, numeric displays, logos, badges |
| **Body** | [Inconsolata](https://fonts.google.com/specimen/Inconsolata) | `--font-body` | Paragraphs, UI labels, tabular data |

### Why a monospace body font
Inconsolata is a monospace font. It makes numbers line up visually across rows of data — which is the whole product. It also gives the brand a technical, terminal-flavored feel that differentiates from typical SaaS serif/sans-serif stacks.

### Type scale (landing page reference)

| Element | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Hero H1 | `clamp(2.25rem, 5vw, 3.5rem)` | 800 | `-0.02em` |
| Section H2 | `2rem – 2.5rem` | 700 | `-0.01em` |
| Pricing price | `3rem` | 800 | `-0.03em` |
| Body | `1rem` | 400 | normal |
| Small / proof | `0.85rem` | 500–600 | `0.02–0.08em` (uppercase labels) |

### Rules
- **Headings:** Space Grotesk, 700–800 weight, tight tracking.
- **Big numbers:** Always Space Grotesk, not the body font. Numbers should feel like a scoreboard.
- **Uppercase micro-labels** (e.g. "TEAMS TRACKED") get `letter-spacing: 0.08em` and are `text-transform: uppercase`.
- **Never mix** more than two weights in a single heading block.

---

## 5. Iconography

- **Emoji allowed** for lightweight marketing accents (🏀 📊 🏆 📈 🔍 🗺️) on landing page feature cards and badges.
- **Inline SVG** for anything inside the product (charts, navigation, status indicators). Use `currentColor` stroke so icons inherit text color and theme-switch cleanly.
- **No icon libraries** (Font Awesome, Material Icons, etc.) — keep the bundle lean.

---

## 6. Imagery & Motifs

- **Basketball court lines** as a signature graphic motif — used as a tilted 3D underlay in the hero (`.lp-hero-court`). Stroke: accent orange, opacity ~0.22, faded with a radial mask.
- **Ambient orange glow** behind hero copy (radial gradient, blurred) gives a "stadium lighting" feel.
- **No stock photos of athletes.** The product is data, not people — visuals should be data, court diagrams, or typography.

---

## 7. Components & Spacing

### Buttons
- **Primary CTA:** Accent orange fill, white text, 10px border-radius, 0.85rem padding.
- **Secondary CTA:** Transparent fill, 1px border in `--color-border-primary`, same padding.
- **Hover:** Primary → `--color-accent-primary-hover`. Secondary → `--color-bg-tertiary`.

### Cards
- Border-radius: `12–16px`.
- Background: `--color-bg-secondary`.
- Border: `1px solid var(--color-border-secondary)`.
- Featured/highlighted card: accent border + glow shadow (`box-shadow: 0 24px 48px -24px rgba(199, 90, 58, 0.35)`).

### Spacing scale
Multiples of `0.25rem` (`4px`). Section padding typically `5rem` vertical / `var(--lp-gutter)` horizontal.

---

## 8. Pricing Presentation

| Tier | Price | Cadence | Highlight |
|------|-------|---------|-----------|
| Free | $0 | forever | — |
| **Fan** | **$30** | /month | **Most Popular** (accent border + badge) |
| Coach | $300 | /year | — |

Always list tiers left → right: Free, Fan, Coach. Fan is the anchor.

---

## 9. Dark Mode

Every component must work in both themes. Rules:
1. Never hard-code a hex — always use a token.
2. Accent brightens in dark mode (`#C75A3A → #E07050`) for contrast.
3. Test both modes before shipping. Theme toggle lives in the header.

---

## 10. Quick Reference Card

```
Brand orange:       #C75A3A  (light) / #E07050 (dark)
Warm background:    #F5F3EF  (light) / #1A1A1A (dark)
Heading font:       Space Grotesk, 700–800
Body font:          Inconsolata, 400
Tagline:            Every possession. Every rating. Every team.
Domain:             axisbasketball.com
```
