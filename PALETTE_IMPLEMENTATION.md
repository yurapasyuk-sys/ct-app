# Singularity v6 Color Palette Implementation

The "Singularity v6" color palette has been integrated into the project.

## Configuration Updates

### `src/index.css`
- Updated Dark Mode variables (`--background`, `--card`, etc.) to match the new palette.
- Added custom CSS variables for:
  - **Sentiment:** `--color-bull`, `--color-bear`, `--color-neutral`
  - **Data Series:** `--chart-1` to `--chart-6`
  - **Market Pulse:** `--pulse-cold`, `--pulse-neutral`, `--pulse-hot`
  - **VWAP Z-Score:** `--z-cheap`, `--z-fair`, `--z-expensive`
  - **Tiers:** `--tier-pro`, `--tier-ultra`

### `tailwind.config.ts`
- Extended `theme.colors` with:
  - `bull`, `bear`, `neutral`
  - `chart.1` ... `chart.6`
  - `pulse.cold`, `pulse.neutral`, `pulse.hot`
  - `z.cheap`, `z.fair`, `z.expensive`
  - `tier.pro`, `tier.ultra`
- Added `boxShadow` utilities:
  - `shadow-glow-bull`
  - `shadow-glow-bear`
  - `shadow-glow-pulse-extreme`
  - `shadow-glow-z-cheap`
  - `shadow-glow-z-expensive`
  - `shadow-glow-ultra`

## Usage Examples

```tsx
// Sentiment
<div className="text-bull shadow-glow-bull">Bullish Text</div>

// Charts
<Line stroke="hsl(var(--chart-1))" />

// Tiers
<Badge className="bg-tier-ultra text-black shadow-glow-ultra">ULTRA</Badge>

// Z-Score
<div className="bg-z-cheap shadow-glow-z-cheap">Undervalued</div>
```
