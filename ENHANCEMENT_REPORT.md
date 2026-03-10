# MarketFlow — Enhancement & Bug Report
*Generated: 2026-03-10*

---

## 🔴 TRANSLATION BUGS (需修復的翻譯問題)

### 1. `FundsPage.tsx` — Hardcoded English "Day Range"
**Line 182** — The `range` label is hardcoded in English and never translates to Chinese:
```tsx
// ❌ Current
range: "Day Range",

// ✅ Fix
range: language === 'en' ? 'Day Range' : '當日盤中範圍',
```

### 2. `Dashboard.tsx` — "Awaiting data..." not translated
**Line 711** — The fallback text when `lastUpdated` is null is hardcoded in English:
```tsx
// ❌ Current
<span className="opacity-70">Awaiting data...</span>

// ✅ Fix — add to DICTIONARY and use t.awaitingData
en: { awaitingData: "Awaiting data..." }
'zh-TW': { awaitingData: "等待資料中..." }
```

### 3. `HeatmapPage.tsx` — Bottom grid ignores language (item names always Chinese)
**Lines 242–243** — The item list at the bottom of the heatmap always renders `item.name` (Chinese), never uses `item.nameEn` when English is selected:
```tsx
// ❌ Current
<span className="text-[11px] font-semibold truncate text-zinc-200">{item.name}</span>

// ✅ Fix
<span className="text-[11px] font-semibold truncate text-zinc-200">
  {language === 'en' ? (item.nameEn || item.name) : item.name}
</span>
```

### 4. `Dashboard.tsx` & `FundsPage.tsx` — Inline translations bypass DICTIONARY
Several strings are translated inline with ternaries instead of using the centralized `DICTIONARY`, making them easy to miss:
- `Dashboard.tsx` line 873: `language === 'en' ? 'Global Market Heatmap' : '全球市場熱圖'`
- `FundsPage.tsx` line 167: `language === 'en' ? 'Asset Allocation Heatmap' : '資產配置熱圖'`

These should be added to `DICTIONARY` for consistency.

### 5. `market-news.ts` — AI error message not localized (line 188)
```ts
// ❌ Current (always English regardless of lang)
marketSummary = "AI Summary unavailable due to quota or processing error.";

// ✅ Fix
marketSummary = isChinese
  ? "AI 摘要因配額或處理錯誤而無法使用。"
  : "AI Summary unavailable due to quota or processing error.";
```

### 6. `api/market-data.ts` — Wrong `nameEn` for PineBridge India Fund
**Line 51–53** — The `nameEn` says "Japan Equity" but the fund is for India:
```ts
// ❌ Current
symbol: '0P00001EVH',
name: '柏瑞環球基金 - 柏瑞印度股票基金"A"',
nameEn: 'PineBridge Global Funds - PineBridge Japan Equity Fund "A"'  // ← WRONG

// ✅ Fix
nameEn: 'PineBridge Global Funds - PineBridge India Equity Fund "A"'
```

---

## 🟡 PERFORMANCE ISSUES (效能問題)

### 7. `motion` library is installed but unused — remove it
`package.json` includes `"motion": "^12.23.224"` (Framer Motion), but **zero usage** was found in any `.tsx` file. All animations use Tailwind's `animate-in` / `fade-in` CSS classes. This is **dead bundle weight**.
```json
// ❌ Remove from package.json
"motion": "^12.23.24",
```
Run: `npm uninstall motion`

### 8. Server-only packages leaking into frontend bundle
`package.json` lists the following as `dependencies` (not `devDependencies`), so Vite may bundle them or at minimum they inflate `node_modules`:
- `better-sqlite3` — only used server-side
- `dotenv` — only used server-side
- `express` — only used server-side
- `yahoo-finance2` — only used in API routes

These should be moved to `devDependencies` or handled via Vercel's serverless bundling to keep the frontend bundle clean.

### 9. Background polling always force-refreshes cache
**Dashboard.tsx line 667–668** — The 1-hour background poll passes `forceRefresh=true`, which bypasses Redis on every interval call:
```ts
// ❌ Current — bypasses Redis every hour
fetchMarketData(timeRange, true, true, language);
fetchNewsData(language, undefined, true, true);

// ✅ Fix — let Redis cache serve the background poll; only force on manual refresh
fetchMarketData(timeRange, true, false, language);
fetchNewsData(language, undefined, true, false);
```

### 10. `cn()` utility duplicated in 3 files
The `cn()` helper is copy-pasted in `Dashboard.tsx`, `FundsPage.tsx`, and `HeatmapPage.tsx`. Create a shared utility:
```ts
// src/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
Then import from `'./utils'` in each file.

### 11. `MarketStatCard` exported from `Dashboard.tsx`
`FundsPage.tsx` imports `MarketStatCard` directly from `Dashboard.tsx`. This means any code path loading `FundsPage` will also load the entire `Dashboard` module (including its `DICTIONARY`, mock data, all state, etc.). Move shared components to a separate file like `src/components/MarketStatCard.tsx`.

### 12. `DICTIONARY` locale object is large and always fully loaded
The full bilingual `DICTIONARY` (both EN + zh-TW) is loaded on every page render even if only one language is active. For a lightweight app, lazy-load or split into separate locale files:
```ts
// src/locales/en.ts / zh-TW.ts
// then: const t = await import(`./locales/${language}.ts`)
```

---

## 🟢 MINOR / UX SUGGESTIONS (建議改善)

### 13. Ticker tape renders all items twice — virtualize for many items
The ticker duplicates all `displayMarketData` items for the infinite scroll effect (lines 820–826). With many tickers, this doubles DOM nodes. Consider CSS-only loop or a lightweight virtualized ticker.

### 14. `localStorage` settings are fragmented — centralize into one key
Five separate `localStorage` keys are used (`marketflow_lang`, `marketflow_chart_mode`, `marketflow_show_funds`, `user_gemini_key`, `marketflow_cache_*`). Consider using a single settings object to reduce fragmentation:
```ts
// One key for all settings
const settings = JSON.parse(localStorage.getItem('marketflow_settings') || '{}');
```

### 15. `HeatmapPage.tsx` — `viewMode` button is confusingly enabled when viewing funds
When `viewSource === 'funds'`, the grouping is forced to `subCategory` (line 65–69). However, the "By Category" / "By Sub-Category" buttons remain visible and clickable, which can confuse users. Disable or hide "By Category" when `viewSource === 'funds'`.

### 16. `market-news.ts` — Model list is fetched on every news request
Lines 112–126: The code calls `activeAi.models.list()` on **every single news API call** to detect the best model. This adds ~300–500ms latency and an extra API round-trip. Cache the detected model name server-side for the session duration.

### 17. Missing `noMarketData` translation key in DICTIONARY
**Dashboard.tsx line 1014** references `t.noMarketData`, but this key does **not exist** in the DICTIONARY for either language. This will render as `undefined` silently.
```ts
// Add to DICTIONARY
en: { noMarketData: "No market data available." }
'zh-TW': { noMarketData: "市場數據不可用。" }
```

---

## Summary Table

| # | File | Type | Severity |
|---|------|------|----------|
| 1 | FundsPage.tsx | Translation bug | 🔴 High |
| 2 | Dashboard.tsx | Translation bug | 🔴 High |
| 3 | HeatmapPage.tsx | Translation bug | 🔴 High |
| 4 | Dashboard/FundsPage | Inconsistency | 🟡 Medium |
| 5 | market-news.ts | Translation bug | 🟡 Medium |
| 6 | market-data.ts | Data error (wrong nameEn) | 🔴 High |
| 7 | package.json | Bundle bloat (unused `motion`) | 🟡 Medium |
| 8 | package.json | Server deps in frontend | 🟡 Medium |
| 9 | Dashboard.tsx | Unnecessary cache busting | 🟡 Medium |
| 10 | All src files | Code duplication | 🟢 Low |
| 11 | FundsPage.tsx | Module coupling | 🟡 Medium |
| 12 | Dashboard.tsx | Bundle size | 🟢 Low |
| 13 | Dashboard.tsx | DOM performance | 🟢 Low |
| 14 | All src files | Maintainability | 🟢 Low |
| 15 | HeatmapPage.tsx | UX confusion | 🟢 Low |
| 16 | market-news.ts | API latency | 🟡 Medium |
| 17 | Dashboard.tsx | Missing translation key | 🔴 High |
