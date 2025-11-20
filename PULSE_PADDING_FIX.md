# Pulse Panel Padding Fix

## Issue
The "Market Pulse" graph in the bottom panel was hitting the top border (separator line) when values reached 100, creating a cramped visual appearance.

## Fix
Modified `src/components/charts/QuantChart.tsx` to introduce a `pulsePaddingTop` (15px) in the scaling logic for the Pulse panel.

### Changes
- Added `pulsePaddingTop = 15` constant.
- Updated `pulseScaleY` calculation to subtract this padding from the available height.
- This ensures that `maxVal` (100) maps to `panelTop + 15px` instead of `panelTop`.

## Result
The Pulse graph now has a "micro margin" at the top, preventing it from touching the separator line, as requested.
