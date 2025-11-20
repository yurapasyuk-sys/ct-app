# VWAP Z-Score Color Update

## Objective
Update the VWAP Z-Score chart colors to match the site's "Bloomberg 2025" styling (Rose/Cyan palette) instead of the default Tailwind colors (Red/Green/Blue/Orange).

## Changes
Modified `src/components/charts/ZScoreChart.tsx`:

### Color Palette
- **Extreme Overvalued (> 2):** Changed from Red (`#ef4444`) to **Rose-600 (`#e11d48`)**.
- **Overvalued (> 0.5):** Changed from Orange (`#f97316`) to **Rose-400 (`#fb7185`)**.
- **Neutral (-0.5 to 0.5):** Kept as **Slate-400 (`#94a3b8`)**.
- **Undervalued (< -0.5):** Changed from Blue (`#3b82f6`) to **Cyan-400 (`#22d3ee`)**.
- **Extreme Undervalued (< -2):** Changed from Green (`#22c55e`) to **Cyan-600 (`#0891b2`)**.

### Background Zones
- **Top Zone (> 2):** Changed to Rose tint (`rgba(225, 29, 72, 0.05)`).
- **Bottom Zone (< -2):** Changed to Cyan tint (`rgba(8, 145, 178, 0.05)`).

### Threshold Lines
- **+2 Line:** Rose-600 (`rgba(225, 29, 72, 0.3)`).
- **-2 Line:** Cyan-600 (`rgba(8, 145, 178, 0.3)`).

## Result
The VWAP Z-Score charts now visually align with the "Market Pulse" indicator in the main chart, creating a cohesive "Bloomberg Terminal" aesthetic.
