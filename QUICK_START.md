# Quick Start - MTM Dashboard

## Access the Dashboard

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Open in Browser**
   - Direct URL: `http://localhost:8080/dashboard/mtm`
   - Or navigate from homepage → click "Dashboard" in navigation

## What You'll See

### Three Real-Time Panels
- **M15**: 15-minute candles, last 4 days
- **1H**: 1-hour candles, last 10 days  
- **4H**: 4-hour candles, last 40 days

### Each Panel Contains
- 📊 **OHLC Candlestick Chart** (green up, red down)
- 📈 **Tension Histogram** (gray normal, green high tension)
- 🔄 **Auto-refresh every 15 seconds**
- ⏱️ **Live countdown timer**
- 🟢 **Status indicator** (green=OK, amber=loading, red=error)
- 📅 **Last sync timestamp**
- 📊 **Stats**: candle count, tension points, latest value

### Top Controls
- **Symbol Selector**: BTCUSDT, ETHUSDT
- **Data Source**: Spot or Futures
- Settings persist to browser storage

## Understanding Tension Index

### What is it?
A normalized score (0-100) combining:
1. **Volatility Score** (inverted): Lower volatility = compression
2. **Volume Score**: Higher volume = accumulation

### Color Coding
- **Gray bars**: Normal market conditions
- **Green bars**: High tension (potential breakout zone)
- **Red dashed line**: Threshold (M15=74, 1H=75, 4H=80)

### Trading Interpretation
When tension exceeds threshold:
- Market is in compression
- Low volatility + volume present
- Potential for volatility expansion
- Not a directional signal (just identifies zones)

## Rate Limiting

The dashboard is designed to **never hammer the API**:
- ✅ Minimum 15s between requests per panel
- ✅ Shared cache across all panels
- ✅ Exponential backoff on errors (4 retries)
- ✅ Jitter to prevent synchronized requests
- ✅ Old data displayed during errors

## Configuration Quick Reference

### Change Lookback Periods
Edit `TIMEFRAMES` in `/src/pages/MtmDashboard.tsx`:
```typescript
lookbackDays: 4,  // Change this value
```

### Adjust Tension Thresholds
Edit `getRecommendedThreshold` in `/src/lib/tension.ts`:
```typescript
'15m': 74,  // Change threshold for M15
'1h': 75,   // Change threshold for 1H
'4h': 80,   // Change threshold for 4H
```

### Change Refresh Interval
Edit `minRefreshMs` in `/src/pages/MtmDashboard.tsx`:
```typescript
minRefreshMs: 15000,  // 15 seconds (min 5s recommended)
```

### Add More Symbols
Edit `SYMBOLS` array in `/src/pages/MtmDashboard.tsx`:
```typescript
const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },  // Add more
];
```

## Troubleshooting

### Charts not loading?
1. Open browser console (F12)
2. Check for network errors
3. Verify Binance API is accessible
4. Try switching between Spot/Futures
5. Clear browser cache and reload

### "Failed to fetch" errors?
- Check internet connection
- VPN may block Binance API
- Try different data source (Spot vs Futures)
- Dashboard will auto-retry with backoff

### Tension data missing?
- Normal for first ~55 candles (calculation period)
- Wait for more data to accumulate
- Check that klines are being fetched

### Performance issues?
- Close other browser tabs
- Reduce refresh interval (not recommended < 5s)
- Use a single timeframe instead of all three

## Data Sources

### Binance Spot API
- Endpoint: `https://api.binance.com/api/v3/klines`
- Public, no authentication required
- Rate limit: 1200 requests/minute (IP-based)

### Binance Futures API  
- Endpoint: `https://fapi.binance.com/fapi/v1/klines`
- Public, no authentication required
- Rate limit: 2400 requests/minute (IP-based)

## Technical Stack

- **Vite**: Build tool
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **lightweight-charts**: Candlestick charts
- **Canvas API**: Tension histograms
- **Binance API**: Market data

## No Backend Required

This is a **100% client-side** application:
- ✅ No server needed
- ✅ No database
- ✅ No cron jobs
- ✅ Runs entirely in browser
- ✅ Direct API calls to Binance

## Next Steps

1. **Explore the Dashboard**: Navigate to `/dashboard/mtm`
2. **Change Symbols**: Try ETHUSDT
3. **Observe Patterns**: Watch for green bars (high tension)
4. **Customize**: Adjust thresholds to match your strategy
5. **Read Docs**: See `README.md` for full documentation

---

**Happy trading! 🚀**

For detailed technical documentation, see:
- `README.md` - Full documentation
- `MTM_DASHBOARD_SUMMARY.md` - Implementation details
