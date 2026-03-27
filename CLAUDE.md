# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

**Compile:**
```bash
javac -cp "lib/gson.jar:src" src/*.java -d bin
```

**Run locally:**
```bash
java -cp "lib/gson.jar:bin" App
```
Server starts on `http://localhost:8080` (override with `PORT` env var).

**Docker:**
```bash
docker build -t market-dashboard .
docker run -p 8080:8080 market-dashboard
```

**Optional env vars:**
- `PORT` — HTTP server port (default: 8080)
- `GEMINI_API_KEY` — Enables AI semantic analysis in the news panel

There is no test suite.

## Architecture

This is a single-process Java HTTP server that acts as a **proxy + transformation layer** between the browser and external financial APIs (Yahoo Finance, Google News RSS, Gemini).

### Request Flow

```
Browser → StaticFileHandler (serves web/)
        → ApiHandler (/api/*) → StockAPIClient → Yahoo Finance API
```

`App.java` creates two `com.sun.net.httpserver` contexts on a cached thread pool:
- `/` → `StaticFileHandler` — serves files from `web/`
- `/api/` → `ApiHandler` — all data endpoints

### ApiHandler Responsibilities

Each `/api/*` route is handled by a private method:

| Route | Method | Notes |
|---|---|---|
| `/api/quotes` | `handleQuotes` | Fetches quotes concurrently via `CompletableFuture`, with 60s in-memory cache. Falls back to stale cache on error, or returns a `StockQuote` with `name="Fallback"` if no cache exists. |
| `/api/chart` | `handleChart` | Proxies Yahoo Finance historical data. For gold/silver symbols, scales close prices by a troy-oz-to-local-unit factor before returning. |
| `/api/news` | `handleNews` | Fetches Yahoo Finance RSS + Google News RSS concurrently, deduplicates by normalized title, filters by `TRUSTED_SOURCES`, returns top 12 with lexicon and optional Gemini sentiment analysis. |
| `/api/search` | `handleSearch` | Proxies Yahoo Finance symbol search. |
| `/api/calendar` | `handleCalendar` | Returns hardcoded mock earnings/IPO data. |

### Commodity Localization

Gold (`XAUINR=X`) and Silver (`XAGINR=X`) prices from Yahoo Finance are in INR per troy ounce. `localizeMetal()` in `ApiHandler` converts them to INR per 10g (gold) and INR per 1kg (silver) using `GOLD_UNIT_G / TROY_OZ_TO_G` and `SILVER_UNIT_G / TROY_OZ_TO_G` factors. The same scaling is applied to historical chart data in `handleChart`.

### Frontend State

`script.js` manages a nested `appState` object (`{ MainTab: { SubTab: [symbols] } }`), persisted to `localStorage` as `vanguardState`. On load it deep-merges saved state with `defaultState`, injecting any missing default symbols. Quotes are fetched every 60 seconds and update the DOM either structurally (full rebuild) or in-place depending on whether the symbol list changed.

### Key Frontend–Backend Contract

- The fallback quote for an unavailable symbol has `name === "Fallback"` — the frontend renders a simplified "Data Unavailable" row on this value.
- Chart data is passed through as raw Yahoo Finance JSON; the frontend reads `chart.result[0].timestamp` and `chart.result[0].indicators.quote[0].close`.
- News response shape: `{ news: [...], lexicon: { recommendation, summary }, semantic: { recommendation, summary, isLocked } }`.
