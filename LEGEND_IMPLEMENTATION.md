# Legend Implementation Summary

Added legends to all charts using `QuantChart` component.

## Changes

### `src/components/charts/QuantChart.tsx`
- Added `Legend` component.
- Added `label` property to `Overlay` interface.
- Added `mainSeriesName` and `showLegend` props to `QuantChart`.
- Implemented automatic legend generation based on main series and overlays.

### Component Updates
Updated the following components to provide explicit labels and main series names:

1. **Cross Pair Analyzer** (`src/components/labs/CrossPairAnalyzer.tsx`)
   - Main Series: "Vol Adjusted Ratio"
   - Overlays: "Correlation", Symbol A, Symbol B

2. **RVWAP Chart** (`src/components/rvwap/RvwapChart.tsx`)
   - Main Series: "Price"
   - Overlays: "RVWAP 30D", "RVWAP 90D", "RVWAP 365D"

3. **Unified Chart Panel** (`src/components/charts/UnifiedChartPanel.tsx`)
   - Main Series: "Price"
   - Overlays: "Market Pulse"

4. **OHLC Chart** (`src/components/ohlc/OhlcChart.tsx`)
   - Main Series: "Price"
   - Overlays: "Tension"

5. **VWAP Z-Score Panel** (`src/components/charts/VwapZScorePanel.tsx`)
   - Main Series: "Price"
   - Overlays: "Z-Score (Nd)"

6. **Mobile VWAP Panel** (`src/components/mobile/MobileVwapPanel.tsx`)
   - Main Series: "Price"
   - Overlays: "Session VWAP"

## Verification
- Check all charts in the application.
- Verify that a legend appears in the top-left corner.
- Verify that the legend items match the chart lines/areas.
