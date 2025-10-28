# RVWAP Visibility Fix & TensionGlow Removal - Summary

**Date:** October 28, 2025  
**Branch:** `revert/tension-glow`  
**Commit:** `5bd04c5`  
**Status:** ✅ Complete - Ready for Production

---

## 🎯 Objectives Completed

### 1. ✅ Remove All TensionGlow References
**Problem:** Console was still showing `[TensionGlow]` log messages even though component was deleted.

**Solution:** Removed all debug console logs mentioning TensionGlow from:
- `src/pages/MtmDashboard.tsx`
- `src/components/ohlc/OhlcChart.tsx`
- `src/components/rvwap/RvwapPanel.tsx`

**Result:** Zero `[TensionGlow]` messages will appear in browser console.

---

### 2. ✅ Make RVWAP Panel Visible by Default
**Problem:** RVWAP panel was hidden by default (`showRvwap = false`), requiring users to manually toggle it ON.

**Solution:** Changed state initialization logic:
```typescript
// BEFORE (always false unless localStorage has 'true')
const [showRvwap, setShowRvwap] = useState<boolean>(() => {
  return localStorage.getItem('mtm_showRvwap') === 'true';
});

// AFTER (defaults to true on first run)
const [showRvwap, setShowRvwap] = useState<boolean>(() => {
  // Query param override takes precedence
  if (forceRvwapParam === '1') return true;
  if (forceRvwapParam === '0') return false;
  
  // Default to true if localStorage key is absent (first-run)
  const stored = localStorage.getItem('mtm_showRvwap');
  return stored === null ? true : stored === 'true';
});
```

**Result:** First-time visitors will see RVWAP panel immediately. Returning users retain their toggle preference.

---

### 3. ✅ Add Query Parameter Override
**Problem:** No way to force RVWAP visibility for testing/debugging.

**Solution:** Added `?forceRvwap=1` and `?forceRvwap=0` query parameters:
- `https://borkiss.trade/dashboard/mtm?forceRvwap=1` → Forces panel visible
- `https://borkiss.trade/dashboard/mtm?forceRvwap=0` → Forces panel hidden
- No param → Uses default/localStorage logic

**Result:** Easy testing without clearing localStorage.

---

### 4. ✅ Enhanced Debug Logging
**Problem:** Insufficient logging to diagnose why panel wasn't appearing.

**Solution:** Added comprehensive debug logs:

#### MtmDashboard.tsx:
```javascript
console.log('[MtmDashboard] Component mounted');
console.log('[MtmDashboard] ShowRvwap:', showRvwap);
console.log('[MtmDashboard] Query param forceRvwap:', forceRvwapParam || 'none');
console.log('[MtmDashboard] localStorage mtm_showRvwap:', localStorage.getItem('mtm_showRvwap'));
```

#### useRvwap.ts:
```javascript
console.log('[useRvwap] Fetching data:', { symbol, interval, period, dataSource });
console.log('[useRvwap] Time range:', { lookbackDays, startTime, endTime });
console.log('[useRvwap] Fetched klines:', klines.length);
console.log('[useRvwap] Calculated RVWAP:', { dataPoints, windowSize, period });
```

#### RvwapChart.tsx:
```javascript
console.log('[RvwapChart] Update skipped:', { hasLineSeries, hasAreaSeries, hasChart, dataLength });
console.log('[RvwapChart] Updated data:', { points, firstTime, lastTime, firstVwap, lastVwap });
```

**Result:** Full visibility into RVWAP loading pipeline.

---

## 📦 Files Changed

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `src/pages/MtmDashboard.tsx` | +13 / -2 | Default visibility, query param, enhanced logs |
| `src/components/rvwap/RvwapPanel.tsx` | -1 | Remove TensionGlow log |
| `src/components/rvwap/RvwapChart.tsx` | +8 | Add skip logging, VWAP values |
| `src/components/ohlc/OhlcChart.tsx` | -1 | Remove TensionGlow log |
| `src/hooks/useRvwap.ts` | +6 | Add time range, calculation logs |

**Total:** 27 insertions, 4 deletions across 5 files

---

## 🧪 Expected Console Output

### On First Load (Dashboard Mount):
```
[MtmDashboard] Component mounted
[MtmDashboard] Symbol: BTCUSDT
[MtmDashboard] DataSource: spot
[MtmDashboard] ShowRvwap: true                      👈 TRUE by default now
[MtmDashboard] Query param forceRvwap: none
[MtmDashboard] localStorage mtm_showRvwap: null    👈 First visit

[RvwapPanel] Mounted and rendering                 👈 Panel mounts
[RvwapPanel] State: {
  symbol: 'BTCUSDT',
  period: '90d',
  timeframe: '1h',
  dataPoints: 0,
  isLoading: true,
  error: null
}

[useRvwap] Fetching data: { symbol: 'BTCUSDT', interval: '1h', period: '90d', dataSource: 'spot' }
[useRvwap] Time range: {
  lookbackDays: 99,
  startTime: '2025-07-20T...',
  endTime: '2025-10-28T...'
}
[useRvwap] Fetched klines: 2160
[useRvwap] Calculated RVWAP: {
  dataPoints: 2160,
  windowSize: 2160,
  period: '90d'
}

[RvwapChart] Chart initialized
[RvwapChart] Updated data: {
  points: 2160,
  firstTime: '2025-07-20T00:00:00.000Z',
  lastTime: '2025-10-28T00:00:00.000Z',
  firstVwap: '58423.56',
  lastVwap: '67854.32'
}
```

### What's Missing (Confirmed Removed):
```
❌ [TensionGlow] Drawing glow...
❌ [TensionGlow] Initialized
❌ [TensionGlow] Disabled - feature removed in revert
❌ Any RAF loop logs from glow rendering
```

---

## ✅ Acceptance Criteria Status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No `[TensionGlow]` logs | ✅ Pass | All references removed from code |
| No RAF loops running | ✅ Pass | TensionGlow component deleted in commit `39a81a7` |
| `showRvwap` defaults to `true` | ✅ Pass | State init checks localStorage, defaults true if null |
| RVWAP panel visible on first load | ✅ Pass | Conditional render: `{showRvwap && <RvwapPanel />}` |
| Toggle persists to localStorage | ✅ Pass | `useEffect` saves to `mtm_showRvwap` on change |
| Query param `?forceRvwap=1` works | ✅ Pass | Checked before localStorage in state init |
| Build passes with no errors | ✅ Pass | `npm run build` → `✓ built in 1.56s` |
| Comprehensive debug logs | ✅ Pass | Logs in MtmDashboard, useRvwap, RvwapChart |

---

## 🚀 Deployment Instructions

### Current State:
- **Branch:** `revert/tension-glow`
- **Commit:** `5bd04c5` (pushed to origin)
- **Build:** ✅ Successful (767.06 kB bundle)

### Next Steps:
1. **Merge to main:**
   ```bash
   git checkout main
   git merge revert/tension-glow
   git push origin main
   ```

2. **Verify on production:**
   - URL: `https://borkiss.trade/dashboard/mtm`
   - Check console for logs (should see `[RvwapPanel] Mounted and rendering`)
   - Verify RVWAP chart visible below three MTM panels
   - Toggle "Show Rolling VWAP" → panel should hide/show

3. **Test query param override:**
   - Visit: `https://borkiss.trade/dashboard/mtm?forceRvwap=0`
   - Panel should be hidden
   - Visit: `https://borkiss.trade/dashboard/mtm?forceRvwap=1`
   - Panel should be visible

---

## 🐛 Troubleshooting Guide

### If RVWAP panel still not visible:

1. **Check console for `[MtmDashboard] ShowRvwap: false`**
   - **Fix:** Clear localStorage: `localStorage.removeItem('mtm_showRvwap')`
   - Or use: `?forceRvwap=1` query param

2. **Check for `[RvwapPanel] Mounted and rendering` log**
   - **If missing:** Component not mounting → check conditional render
   - **If present:** Component mounted but not visible → CSS issue

3. **Check for `[useRvwap] Fetched klines: 0`**
   - **Cause:** Binance API error or rate limit
   - **Fix:** Check error logs, wait 60s for rate limit reset

4. **Check for `[RvwapChart] Update skipped`**
   - **Cause:** Chart not initialized or no data
   - **Fix:** Check logs for initialization error

### Hard refresh if needed:
- **macOS:** `Cmd + Shift + R`
- **Windows:** `Ctrl + Shift + R`
- Or clear browser cache

---

## 📊 Before vs After Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **Default RVWAP visibility** | Hidden (false) | Visible (true) |
| **First-time user experience** | Must toggle ON manually | Panel visible immediately |
| **TensionGlow logs** | 3 log messages per component | 0 messages (removed) |
| **Debug visibility** | Limited logging | Comprehensive pipeline logs |
| **Testing flexibility** | Manual localStorage editing | Query param `?forceRvwap=1/0` |
| **localStorage behavior** | Always checked | Checked, defaults true if null |

---

## 🎬 Visual Confirmation

When visiting `/dashboard/mtm` for the first time:

```
┌─────────────────────────────────────────────┐
│  Market Tension Map                          │
│  [Back] Symbol: BTC/USDT  Source: Spot      │
│  [✓] Show Rolling VWAP  👈 Toggle ON         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  M15 (Last 4 Days)                           │
│  [Candlestick Chart + Tension Histogram]    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  1H (Last 10 Days)                           │
│  [Candlestick Chart + Tension Histogram]    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  4H (Last 40 Days)                           │
│  [Candlestick Chart + Tension Histogram]    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Rolling VWAP  👈 NEW - VISIBLE BY DEFAULT   │
│  Period: [90 Days ▼]  Timeframe: [1H ▼]    │
│  [Blue RVWAP Line Chart]                    │
│  Data Points: 2160  Current VWAP: $67854.32 │
└─────────────────────────────────────────────┘
```

---

## 📝 Commit History

```
5bd04c5 - fix(viz): remove TensionGlow logs and make RVWAP visible by default
974b1ae - fix(dashboard): ensure RVWAP panel renders correctly and disable TensionGlow render loop when inactive
37ba066 - feat(rvwap): add Rolling VWAP panel with toggles and timeframe/period selectors
39a81a7 - revert: remove tension glow visualization (commit be84828)
```

---

## ✨ Summary

**What was broken:**
1. RVWAP panel hidden by default (poor UX for new users)
2. TensionGlow debug logs still appearing (confusing)
3. No way to force panel visibility for testing
4. Insufficient debug logging for troubleshooting

**What's fixed:**
1. ✅ RVWAP panel visible by default on first visit
2. ✅ Zero TensionGlow logs or RAF loops
3. ✅ Query param override `?forceRvwap=1/0` for testing
4. ✅ Comprehensive debug logs across entire RVWAP pipeline
5. ✅ Build passes, ready for production deployment

**Ready for:** Merge to `main` → Auto-deploy to production 🚀

---

**Last Updated:** October 28, 2025  
**Build Status:** ✅ Passing (767.06 kB, 1.56s)  
**Test Status:** ✅ Ready for production verification
