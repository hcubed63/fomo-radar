# FOMO Radar — Session Summary

**Project**: `/Users/hanshansson/fomo-radar`  
**Date range**: 2026-09-12 (this session)  
**Status**: Core dashboard complete and mobile-polished. "All perfect" confirmed on real device (LAN).

---

## Background & Origin

- Started from an earlier lightweight personal tool (`fomo-tracker/`) — Python ThreadingHTTPServer + vanilla JS SPA + `launch-radar.py` that scanned pump.fun + DexScreener, computed conviction/heat scores, supported Telegram/email alerts, and ran in `--monitor` mode.
- User shared a **detailed 20-deliverable product spec** for a new professional-grade **"FOMO Radar"** Solana intelligence platform.
- Explicit request: build the real app (not just docs), faithful to the spec:
  - Dual orthogonal scores (FOMO Opportunity 0-100 + Exit Risk 0-100)
  - 5 stages
  - Velocity + acceleration + sequence detection (not raw numbers)
  - 7 radar cards with current/change/acceleration/status/assessment + historical peer comparisons
  - Event timeline (sequence order matters)
  - AI-style assessment with confidence + factors
  - Empirical vs. hypothesis vs. experimental labeling mindset
  - "Detect acceleration before obvious FOMO, and detect distribution before becoming exit liquidity"
- Architecture goal: pure scoring engine (Supabase/Redis/webhook ready), Next.js frontend, DexScreener + RugCheck for MVP (notes on paid providers needed for full smart/holder history).

---

## What Was Built

### 1. Scoring Engine (`lib/scoring.ts`)
Exact implementation of the spec formulas:

- **computeOpportunity** (weights: 0.18 holderAccel, 0.15 volumeAccel, 0.13 attentionPriceDiv, 0.14 walletQuality, 0.10 liqGrowth, 0.09 socialVel, 0.08 healthyDist, 0.08 priceStructure + sequence bonus capped at 8)
- **computeExitRisk** (symmetric: 0.18 whaleDist, 0.15 concIncrease, etc. + sequence penalty)
- **classifyStage** → Pre-FOMO / Early Momentum / FOMO Expansion / Euphoria / Distribution / Exit
- **detectSequences** — simple but functional pattern matching for build vs. distribution events
- **buildRadarCards** — produces all 7 cards:
  1. Holder Radar
  2. Smart Money Radar
  3. Whale Radar
  4. Volume Radar
  5. Liquidity Radar
  6. Social Radar
  7. Price Radar
- Each card includes `current`, `change`, `acceleration`, `status`, `assessment` + injected "Historical:" peer comparison line.
- Robust normalization helper.
- Full TypeScript types (`AnalysisResult`, `RadarCard`, `Stage`).

### 2. Frontend (`app/page.tsx`)
- **Always-visible full dashboard**: Initial `useState` pre-loads the complete DOJO example (81 Opportunity / 23 Exit Risk, "Early Momentum", all 7 cards, 7-event timeline, exact multi-paragraph assessment text from the spec, 74% confidence, `isDemoData: true`).
- **Input + Actions**:
  - Paste Solana mint + "Analyze" (live path)
  - "Reload Full Example (matches spec)"
  - "Real: ANSEM-like" and "Real: CATE-like" demo buttons (live DexScreener data)
- **Token Header**: Symbol, truncated mint (copy button), name, Price / MC / Liq / 24h Vol.
- **Gauges + Stage**:
  - Two large SVG circular gauges (green for Opportunity, red for Exit Risk).
  - Stage pill with color coding.
  - Responsive grid (stacks on mobile, 5-col layout on lg+).
- **Radar Cards Grid**: Responsive (1 → 2 → 3 → 4 columns). Full content always shown.
- **AI Assessment**: Full prose + "AI Confidence: XX% — factor1 • factor2 ..."
- **Event Timeline**: Chronological sequence events with color coding (build/green, dist/red, warning/amber).
- **Real Data Path**:
  - `fetchDex` (DexScreener — price, MC, liquidity, volume, buy ratio)
  - `fetchRug` (RugCheck — top10 concentration, risks)
  - `generateDemoSignals` (velocity/accel proxies derived from live data)
  - Full scoring + radar card generation on live tokens.
- **Polish & UX**: Toasts (sonner), lucide-react icons, dark premium trading theme, copy-to-clipboard, loading states, error handling.
- **Responsive & Mobile**:
  - Gauge sizes: 132px (≤640px) → 160px base → 192px (≥1024px)
  - Token header stacks on mobile
  - Responsive paddings (`p-5 sm:p-6 lg:p-8`)
  - Cards, timeline, assessment all tighten gracefully
  - Input row: `w-full`, `min-w-0`, flex improvements

### 3. Data & Integration Notes
- Free tier only for MVP (DexScreener + RugCheck).
- Explicit comments throughout that full holder/smart money/social history + true velocity time-series require paid providers (Birdeye, Helius, LunarCrush, etc.).
- `isDemoData` flag surfaces limitations.

### 4. Styling & Theming (`app/globals.css`, layout)
- Premium dark trading palette (`#0a0a0f`, cards `#16161b`, green `#22c55e`, red `#ef4444`, accent `#6366f1` / `#a78bfa`).
- Custom SVG gauge + timeline dot/line CSS.
- Consolidated responsive rules (no more conflicting media queries).
- Geist font family.

### 5. Technical Stack
- Next.js 16 + Turbopack + React 19 + TypeScript
- Tailwind 4
- No external state libs (pure React + useState/useEffect)
- Sonner for toasts
- Lucide icons
- Pure functions for scoring (easy to test/port)

### 6. Major Iterations (driven by screenshots + feedback)
- Made full spec dashboard visible immediately on load (no blank state).
- Fixed gauge sizing/centering on mobile (hardcoded SVG → viewBox + 100% + relative wrapper + `inset-0` centering).
- Header + metrics made mobile-friendly (stacking, smaller text).
- Added historical comparison lines to all 7 radar cards.
- Multiple spacing, padding, text-size, and button layout refinements for phone + desktop parity.
- **Final bug fix**: "When you click in search, screen moves sideways" (input focus + on-screen keyboard).
  - Added proper `viewport` export (maximumScale: 1).
  - `overflow-x: hidden` on html + body.
  - Hardened input (`focus:ring-0 focus:shadow-none`).
  - `w-full` + `overflow-x-hidden` on input card/row.
- User confirmed on real iPhone at LAN IP: "all perfect".

---

## Current Capabilities (as of end of session)

- Paste any Solana CA → live analysis (or instant full spec example).
- See dual scores, stage, 7 radar cards with acceleration signals + peer comparisons.
- See clean event timeline.
- Read exact assessment text + confidence breakdown.
- Works beautifully on desktop and mobile (tested via LAN + devtools).
- No hype language — quantitative intelligence only + disclaimers.
- Analysis now runs via `POST /api/analyze` (lib/analyze.ts is the single orchestrator with provenance). Client demo paths remain instant/static.

**Run it**:
```bash
cd fomo-radar
npm run dev
# open http://localhost:3000 or http://192.168.1.17:3000 (your LAN IP)
```

---

## What Is Not Yet Implemented (per original spec)

- Full historical time-series storage + real velocity/acceleration over multiple windows
- Paid provider integrations (Birdeye for smart money, Helius webhooks, etc.)
- Backtesting framework + replay
- Alerts (Telegram, email, in-app, webhook)
- Multi-token radar / scanning
- User accounts / saved watches
- Production deployment (Vercel + Supabase/Redis ready in design)
- More rigorous sequence FSM and cohort normalization

These were intentionally scoped out of this core UI + scoring MVP phase.

---

## Process Notes

- Followed strict workspace rules: plan mode for non-trivial work, subagent exploration, detailed task lists, build-after-every-group, browser verification mindset.
- All UI changes verified via repeated `npm run build`, content checks, and real-device feedback from screenshots.
- Changes kept minimal and elegant — no kitchen-sink refactors.
- Faithful to the original product spec language and philosophy.

---

## Files of Note

- `lib/scoring.ts` — the heart (pure, versionable)
- `app/page.tsx` — single-file rich dashboard
- `app/globals.css` — theme + responsive gauge/card rules
- `app/layout.tsx` — metadata + viewport (now properly locked for mobile)
- `SUMMARY.md` — this document

---

**Overall outcome**: A working, beautiful, spec-faithful FOMO Radar dashboard that shows the full intended experience immediately, works on phone and laptop, and is ready for the next layer of real data depth and features.

Ready for tomorrow (or whenever). Just say the word.

---

## 2026-09-14: Real Social Radar (LunarCrush)

- Added optional realtime social via LunarCrush (server-only `LUNARCRUSH_API_KEY`).

## 2026-09-16: Stack companions from tweet (fomo.family / RH Trenches / FOMO Pulse / Stalkchain / Hoodwatch / Bot)

**User request**: Look at the URLs in the @goatyishere post (images provided) and evaluate if worth using any for FOMO Radar. "can we add some things to this [live URL]?"

**Research + verdict** (executed in plan mode then implemented):
- Full probes (Jina + direct /api calls + GitHub read) + codebase subagent + image reads.
- FOMO Radar already has strong free realtime social via Pump.fun reply_count (on-platform comments) — primary path, LC optional paid.
- Verdict: **Yes, worth using as the broader stack** (manual discovery + alerts layer). Radar is the perfect free "deep per-mint scoring + provenance" complement.
  - Stalkchain: highest relevance for Solana KOLs on pump-style tokens.
  - FOMO Pulse: best free public APIs (tape/traders/bags/discover) but RH Chain only.
  - Others: excellent UIs for flow/whales/social trading.
  - No stable free public Solana-mint-specific JSON from most (avoid scrape).
- Scoped addition: minimal additive external links (plain <a>, existing muted styles) in main token header + watchlist cards.
  - Always includes Dexscreener (exact mint link) + the recommended tools with short labels and RH Chain notes where relevant.
- No changes to analyze, scoring, Pump social, provenance, isDemoData, dataSources, or any logic.
- Builds clean after edits.
- Full browser verification performed (see below).

**Changes**:
- app/page.tsx: links row after Pump comments in result header; compact version in My Tokens cards.
- README.md: new "Fits the recommended stack" subsection.
- This SUMMARY: outcome recorded.
- plan.md: full evaluation + execution proof appended.

**Verification**:
- `npm run build` succeeded (multiple times).
- curl /api/analyze on real CATE mint (Ai66...pump): opp/risk/stage/pump/sources/isDemoData all correct and unchanged.
- Dev server running; full user flows exercised: load demo, analyze real mint (CATE), see new links, add to My Tokens, load from watchlist, refresh.
- All result surfaces (header with links + Pump line, gauges, 7 cards including Social, assessment with factors, watchlist grid) receive data consistently.
- Regressions hunted: Pump comments/LIVE social badges still appear correctly; demo path untouched; no layout shift or new errors.
- Desktop + narrow mobile emulation: links readable, wrap gracefully, no overflow, hover works.
- Links are direct where possible (Dexscreener uses the mint); others go to main sites (user searches symbol/CA as intended by the tools).
- "Exercise like real user": paste/analyze own token → full dashboard + stack links immediately usable → add to list → cards show provenance + links → click through.

**Outcome**: Users following the tweet stack now have one-click paths from any Radar analysis (or watchlist card) straight into the recommended companion tools. Radar keeps its unique free value. Zero cost, zero new deps, provenance honest.

This completes the prior unfinished evaluation + "add value" request. All per Global Playbook (plan first, subagents, read-before-edit, verification before done, free-only).
- `fetchSocial` (symbol first, then mint-as-topic, 55s TTL cache) + branch in `generateDemoSignals`.
- When present: real `socialVel`/`socialSat` from mentions/interactions instead of pure 5m vol proxy.
- `dataSources` includes 'lunarcrush', confidenceFactors notes "Live social from LunarCrush", `isDemoData` flips false for that result.
- Social Radar card gets a small LIVE badge in UI.
- Zero-config fallback: exact previous proxy behavior + `isDemoData: true` when no key (or fetch fails).
- Proxy path verified identical via build + live curl on real mint (CATE). Social card still works for demo + watchlist.
- README updated with enable steps. No new deps, no scoring changes, minimal UI addition.
- This gives Social Radar actual leading attention value (user request: "yes i want this realtime dont you think? otherwise whats the reral value?").
- Next: user adds key + `vercel --prod`, re-analyzes watchlist tokens, verifies different (real) Social numbers + slight Opp shift.

Builds clean. Proxy path 100% compatible. Ready for key + prod verification.