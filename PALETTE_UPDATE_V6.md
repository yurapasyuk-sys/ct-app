# Singularity v6 Palette Update

Updated the implementation to strictly follow the "Singularity v6" export block provided.

## Changes

### `src/index.css`
- Renamed Pulse variables to match export:
  - `--pulse-0-cold`
  - `--pulse-50-neutral`
  - `--pulse-100-hot`
- Added missing variables:
  - `--gradient-pulse`
  - `--fx-glow-*` (bull, bear, pulse-extreme, z-cheap, z-expensive, ultra)
  - `--bg-app`, `--bg-surface`, `--bg-border` (mapped to existing HSL values)
  - `--text-primary`, `--text-secondary` (mapped to existing HSL values)

### `tailwind.config.ts`
- Updated `colors.pulse` to use the new variable names.
- Updated `boxShadow` to use CSS variables (`var(--fx-glow-...)`) instead of hardcoded values, ensuring a single source of truth in CSS.

## Verification
- Check `src/index.css` to confirm all variables from the HTML export are present.
- Check `tailwind.config.ts` to confirm it references the correct CSS variables.
