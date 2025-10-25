# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/f3fc6053-e1fb-4358-a1f8-bbac87153c3a

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/f3fc6053-e1fb-4358-a1f8-bbac87153c3a) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/f3fc6053-e1fb-4358-a1f8-bbac87153c3a) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## MTM Dashboard (Market Tension Map)

### Overview

The MTM Dashboard is a real-time market analysis tool that displays OHLC candlestick charts alongside "Tension Map" histograms for multiple timeframes. It helps identify potential market compression zones by analyzing volatility and volume patterns.

### Features

- **Three Timeframes**: M15 (4 days), 1H (10 days), 4H (40 days)
- **Real-time Data**: Auto-refreshes every 15 seconds with intelligent rate limiting
- **Tension Indicators**: Combined volatility and volume score normalized to 0-100
- **Interactive Charts**: Lightweight candlestick charts with synchronized tension histograms
- **Symbol Selection**: Switch between BTCUSDT and ETHUSDT
- **Data Source Toggle**: Choose between Binance Spot or Futures API

### Installation

The dashboard uses the `lightweight-charts` library for charting. To install dependencies:

```bash
npm install
```

All required dependencies are already listed in `package.json`.

### Running Locally

Start the development server:

```bash
npm run dev
```

Then navigate to: `http://localhost:8080/dashboard/mtm`

### Data Source

The dashboard fetches data from Binance's public REST API:
- **Spot**: `https://api.binance.com/api/v3/klines`
- **Futures**: `https://fapi.binance.com/fapi/v1/klines`

No authentication is required for public market data.

### Rate Limiting & Resilience

To avoid hammering the Binance API, the dashboard implements:

1. **15-second refresh interval** per panel (configurable)
2. **In-memory caching** keyed by symbol, interval, and lookback
3. **Exponential backoff** on 429/5xx errors (500ms, 1s, 2s, up to 4 retries)
4. **Jitter** to desynchronize requests across panels
5. **AbortController** for canceling stale requests

If a refresh occurs before 15 seconds have elapsed, cached data is returned immediately.

### Tension Map Calculation

The tension index combines two normalized scores (0-100):

1. **Volatility Score** (inverted):
   - Calculate rolling standard deviation of close prices
   - Normalize to relative volatility (std / price)
   - Lower volatility → higher score

2. **Volume Score**:
   - Normalize volume against rolling min/max
   - Higher volume → higher score

3. **Tension Index** = (Volatility Score + Volume Score) / 2

Bars exceeding the threshold are highlighted in green, indicating potential compression zones.

### Configuration

#### Timeframe Settings

You can adjust lookback periods and thresholds in `/src/pages/MtmDashboard.tsx`:

```typescript
const TIMEFRAMES = [
  {
    id: 'm15',
    label: 'M15',
    interval: '15m',
    lookbackDays: 4,      // Change this
    description: 'Last 4 Days',
  },
  // ...
];
```

#### Calculation Periods & Thresholds

Default values are defined in `/src/lib/tension.ts`:

```typescript
export function getRecommendedPeriod(interval: string): number {
  const periodMap: Record<string, number> = {
    '15m': 55,  // Rolling window for M15
    '1h': 40,   // Rolling window for 1H
    '4h': 35,   // Rolling window for 4H
  };
  return periodMap[interval] || 40;
}

export function getRecommendedThreshold(interval: string): number {
  const thresholdMap: Record<string, number> = {
    '15m': 74,  // Tension threshold for M15
    '1h': 75,   // Tension threshold for 1H
    '4h': 80,   // Tension threshold for 4H
  };
  return thresholdMap[interval] || 75;
}
```

#### Refresh Interval

To change the refresh cadence, modify the `minRefreshMs` parameter in `/src/pages/MtmDashboard.tsx`:

```typescript
const { klines, tensionData, ... } = useKlines({
  // ...
  minRefreshMs: 15000,  // Change to 30000 for 30 seconds, etc.
});
```

### Styling

The dashboard uses your existing Tailwind theme with:
- Dark background (`bg-background`)
- Subtle borders (`border-border`)
- Monospace fonts for numeric data
- Card components from shadcn/ui
- No glassmorphism or neon effects

Charts use a transparent background to blend with the dark theme.

### Architecture

```
src/
├── pages/
│   └── MtmDashboard.tsx       # Main dashboard page
├── components/
│   └── ohlc/
│       ├── OhlcChart.tsx      # Candlestick chart wrapper
│       └── TensionHistogram.tsx # Canvas-based histogram
├── hooks/
│   └── useKlines.ts           # Data fetching hook with caching
└── lib/
    ├── binance.ts             # API client with retry logic
    └── tension.ts             # Tension calculation utilities
```

### Limitations

- **Client-side only**: No server or cron jobs required
- **No Open Interest**: OI data is not included in this version
- **Public API only**: Uses Binance's public endpoints (no auth)
- **No persistence**: Data is cached in-memory only

### Troubleshooting

**Charts not loading?**
- Check browser console for API errors
- Verify Binance API is accessible (not blocked by firewall/VPN)
- Ensure you're not hitting rate limits (dashboard handles this automatically)

**Tension data missing?**
- Tension calculations require a minimum number of candles (equal to the period)
- Check that klines are being fetched successfully

**TypeScript errors?**
- Run `npm install` to ensure all dependencies are installed
- Check that lightweight-charts is properly installed

### Future Enhancements

Potential additions (not implemented):
- Open Interest integration
- Backtesting interface
- Export to CSV
- Custom alerts when tension exceeds threshold
- Multiple symbol comparison
- WebSocket for real-time updates
````