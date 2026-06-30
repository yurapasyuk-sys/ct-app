# Order Flow Research

Centurion keeps two data classes separate:

## Dukascopy Quote Microstructure

This data contains bid/ask quotes and quote-side volume from Dukascopy. It is
useful for realistic spread, bid/ask execution, quote update counts, and a
venue-specific liquidity imbalance.

It is not executed aggressor volume and must not be presented as true Delta,
CVD, or global Forex order flow.

Download compact bid/ask minute data:

```powershell
python scripts/download_dukascopy_m1.py `
  --symbols EURUSD `
  --start 2025-07-01 `
  --end 2026-06-19 `
  --mode m1-bidask `
  --output-dir .scratch/dukascopy `
  --workers 12
```

The downloader checkpoints every 250 hours and resumes completed hours from
the existing destination file.

Analyze spread and quote liquidity:

```powershell
npm.cmd run research:microstructure -- `
  --type dukascopy `
  --input .scratch/dukascopy/EURUSD_1m_bidask_2025-07-01_2026-06-19.csv `
  --output .scratch/dukascopy/EURUSD_microstructure.json `
  --pip-size 0.0001
```

## CME True Order Flow

Use CME FX futures data for executed trades and centralized order-book events.
Centurion accepts a Databento-style CSV with:

- `ts_event`
- `price`
- `size`
- `side`
- optional `bid_px_00`, `ask_px_00`, `bid_sz_00`, `ask_sz_00`

Analyze trades or TBBO:

```powershell
npm.cmd run research:microstructure -- `
  --type databento `
  --input C:\data\6E_TBBO.csv `
  --output .scratch\6E_order_flow.json `
  --tick-size 0.00005
```

The report returns aggressor buy/sell volume, Delta, CVD, POC, VAH, VAL,
footprint price levels, and top-of-book imbalance when book sizes are present.
MBO and MBP-10 files can be much larger; keep purchased or licensed raw data
outside the repository.
