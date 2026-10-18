// FOMO Radar live paper play (paper only: no trading, no Telegram).
// Strategy-search survivor (Slinky21 corpus 5-14 Jul 2026, workspace/strategy-search):
//   entry: first launch-aligned 1-minute bucket (minutes 0-29 after launch) whose CLOSE market cap >= 60 SOL;
//          filter: (buys+1)/(sells+1) >= 2.5, trade COUNTS over that bucket and the 2 before it (fewer if j<2);
//          one evaluation per coin (if the first crossing fails the filter, the coin is skipped);
//          entry price = close of that bucket.
//   exit:  stop -10% from entry; once the peak (from earlier buckets) is >= +50%, stop = max(stop, peak x 0.75);
//          stop checked against each bucket's low before its high, gap-through fills at the bucket open;
//          time stop: close of the 60th bucket from entry.
//   costs per $10: 1% fee each way, 0.0015 SOL priority fee each way (SOL price from pump.fun trade quotes),
//          slippage 3% each way (+2% under 40 SOL mc, +2% more under 30 SOL), same formula as search.py.
import { DurableObject } from "cloudflare:workers";

const H = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", Origin: "https://pump.fun", Referer: "https://pump.fun/" };
export const CFG = { CROSS: 60, BSR: 2.5, SL: 0.10, TRAIL_AFTER: 0.50, TRAIL: 0.25, HOLD_BUCKETS: 60, MAX_ENTRY_BUCKET: 29, STAKE: 10, FEE: 0.01, PRIO_SOL: 0.0015 };
const CREATED_PAGES = 8, ACTIVE_PAGES = 4, BUDGET = 46, ENTRY_PAGES = 6, EXIT_PAGES = 4;
// swap-api (trades) answers 429 when Workers on this account call it often (it is shared with fomo-radar-cron and fomo-radar-launch).
const SWAP_BUDGET = 6; // shared rate limit: the live alert Worker (fomo-radar-cron) needs swap-api for its dev-sell check
const SOL_QUOTES = new Set(["11111111111111111111111111111111", "So11111111111111111111111111111111111111112"]);
const bris = (t) => (t ? new Date(t + 10 * 3600000).toISOString().replace("T", " ").slice(0, 19) : null);
const nextMinute = () => Math.ceil((Date.now() + 1000) / 60000) * 60000 + 5000; // 5 s after the next minute boundary
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

export const slip = (mc) => 0.03 + (mc < 40 ? 0.02 : 0) + (mc < 30 ? 0.02 : 0);
export function pnlUsd(entryMc, exitMc, solUsd) {
  const prio = CFG.PRIO_SOL * solUsd;
  const gross = (exitMc * (1 - slip(exitMc))) / (entryMc * (1 + slip(entryMc))) - 1;
  return (CFG.STAKE - CFG.STAKE * CFG.FEE - prio) * (1 + gross) * (1 - CFG.FEE) - prio - CFG.STAKE;
}

// Launch-aligned 1-minute buckets from pump.fun trades (ascending). mc = priceSol x 1B.
export function buckets(trades, launch) {
  const out = new Map();
  for (const t of trades) {
    const ts = Date.parse(t.timestamp), mc = +t.priceSol * 1e9;
    if (!Number.isFinite(mc) || ts < launch) continue;
    const k = Math.floor((ts - launch) / 60000);
    let b = out.get(k);
    if (!b) { b = { k, o: mc, h: mc, l: mc, c: mc, nb: 0, ns: 0 }; out.set(k, b); }
    b.h = Math.max(b.h, mc); b.l = Math.min(b.l, mc); b.c = mc;
    if (t.type === "buy") b.nb++; else b.ns++;
  }
  return out;
}

// Exit logic for one bucket. Missing buckets (no trades) = flat at previous close, as in search.py.
export function stepExit(p, b) {
  let st = p.entryMc * (1 - CFG.SL);
  if (p.peak >= p.entryMc * (1 + CFG.TRAIL_AFTER)) st = Math.max(st, p.peak * (1 - CFG.TRAIL));
  if (b.l <= st) return { exit: true, px: b.o < st ? b.o : st, reason: p.peak >= p.entryMc * (1 + CFG.TRAIL_AFTER) ? "trail" : "stop" };
  p.peak = Math.max(p.peak, b.h);
  if (b.k >= p.entryBucket + CFG.HOLD_BUCKETS) return { exit: true, px: b.c, reason: "time60m" };
  return { exit: false };
}

async function getJson(url, ctr) {
  ctr.n++;
  try {
    const r = await fetch(url, { headers: H });
    if (!r.ok) { const k = (url.includes("swap-api") ? "swap" : "list") + r.status; ctr.codes[k] = (ctr.codes[k] || 0) + 1; return null; }
    return await r.json();
  } catch { ctr.codes.err = (ctr.codes.err || 0) + 1; return null; }
}
// Trades newest-first pages until a trade older than `untilTs`, or page cap. Returns ascending trades + whether we reached untilTs.
async function tradesSince(mint, untilTs, pages, ctr) {
  let cur = "0", all = [], reached = false;
  for (let i = 0; i < pages && ctr.n < BUDGET; i++) {
    if (ctr.swap >= SWAP_BUDGET) return { ok: false, trades: [], reached: false, budget: true };
    ctr.swap++;
    const j = await getJson(`https://swap-api.pump.fun/v2/coins/${mint}/trades?limit=100&cursor=${cur}&minSolAmount=0`, ctr);
    if (!j || !Array.isArray(j.trades)) return { ok: false, trades: [], reached: false };
    all.push(...j.trades);
    const oldest = j.trades.length ? Date.parse(j.trades[j.trades.length - 1].timestamp) : 0;
    if (!j.pagination?.hasMore) { reached = true; break; }
    if (oldest < untilTs) { reached = true; break; }
    cur = j.pagination.nextCursor;
  }
  all.sort((a, b) => (a.slotIndexId < b.slotIndexId ? -1 : a.slotIndexId > b.slotIndexId ? 1 : 0));
  return { ok: true, trades: all, reached };
}
const solFrom = (trades) => { for (let i = trades.length - 1; i >= 0; i--) { const t = trades[i]; const u = +t.priceUsd, s = +t.priceSol; if (u > 0 && s > 0) return u / s; } return null; };

export class PlayTracker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seen (mint TEXT PRIMARY KEY, ts INTEGER, status TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS trades (mint TEXT PRIMARY KEY, sym TEXT, launch INTEGER, entryBucket INTEGER, entryTs INTEGER, entryMc REAL,
      buys3 INTEGER, sells3 INTEGER, bsr REAL, detectLagSec INTEGER, solUsd REAL, status TEXT, peak REAL, lastBucket INTEGER, lastClose REAL, lastTs INTEGER,
      exitTs INTEGER, exitReason TEXT, exitMc REAL, exitPct REAL, peakPct REAL, pnlUsd REAL, dataGaps INTEGER DEFAULT 0)`);
    this.running = false;
    this.paused = env.PAUSED === "1";
    ctx.blockConcurrencyWhile(async () => {
      if (this.paused) await ctx.storage.deleteAlarm(); // paused: no scheduled ticks, data kept
      else if (!(await ctx.storage.getAlarm())) await ctx.storage.setAlarm(nextMinute());
    });
  }
  async alarm() {
    if (this.paused) { await this.ctx.storage.deleteAlarm(); return; }
    try { await this.tick(); }
    finally { if (!this.paused) await this.ctx.storage.setAlarm(nextMinute()); }
  }
  meta(k, v) {
    if (v === undefined) { const r = this.sql.exec(`SELECT v FROM meta WHERE k=?`, k).toArray()[0]; return r ? JSON.parse(r.v) : null; }
    this.sql.exec(`INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, JSON.stringify(v));
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/play-log") return Response.json(this.report(u));
    return new Response("not found", { status: 404 });
  }

  async tick() {
    if (this.running) return { skipped: "tick already running" };
    this.running = true;
    try { return await this.tickInner(); } finally { this.running = false; }
  }

  async tickInner() {
    const now = Date.now(), ctr = { n: 0, swap: 0, codes: {} };
    if (!this.meta("startedAt")) this.meta("startedAt", now);
    const c = this.meta("counters") || { runs: 0, crossings: 0, filteredOut: 0, entries: 0, skippedCoverage: 0, skippedLate: 0, listFails: 0 };
    c.runs++;
    // 1) Update open positions first (exits matter most).
    const open = this.sql.exec(`SELECT * FROM trades WHERE status='open' ORDER BY entryTs`).toArray();
    let exitsUpdated = 0, openFails = 0;
    for (const p of open) {
      if (ctr.n >= BUDGET - 4 || ctr.swap >= SWAP_BUDGET) break;
      const r = await tradesSince(p.mint, p.lastTs - 1000, EXIT_PAGES, ctr);
      if (!r.ok) { openFails++; continue; }
      const bs = buckets(r.trades, p.launch);
      const nowBucket = Math.floor((now - p.launch) / 60000);
      let gap = r.reached ? 0 : 1, done = null, k = p.lastBucket + 1;
      const last = Math.min(nowBucket - 1, p.entryBucket + CFG.HOLD_BUCKETS);
      for (; k <= last; k++) {
        const b = bs.get(k) || { k, o: p.lastClose, h: p.lastClose, l: p.lastClose, c: p.lastClose };
        const s = stepExit(p, b);
        p.lastClose = b.c; p.lastBucket = k;
        if (s.exit) { done = { ...s, ts: p.launch + (k + 1) * 60000 }; break; }
      }
      p.lastTs = p.launch + (p.lastBucket + 1) * 60000; // re-fetch from the first unprocessed bucket so partial buckets are never half-read
      if (done) {
        const pnl = pnlUsd(p.entryMc, done.px, p.solUsd);
        this.sql.exec(`UPDATE trades SET status='closed', peak=?, lastBucket=?, lastClose=?, lastTs=?, exitTs=?, exitReason=?, exitMc=?, exitPct=?, peakPct=?, pnlUsd=?, dataGaps=dataGaps+? WHERE mint=?`,
          p.peak, p.lastBucket, p.lastClose, p.lastTs, done.ts, done.reason, done.px, (done.px / p.entryMc - 1) * 100, (p.peak / p.entryMc - 1) * 100, pnl, gap, p.mint);
      } else {
        this.sql.exec(`UPDATE trades SET peak=?, lastBucket=?, lastClose=?, lastTs=?, dataGaps=dataGaps+? WHERE mint=?`, p.peak, p.lastBucket, p.lastClose, p.lastTs, gap, p.mint);
      }
      exitsUpdated++;
    }
    // 2) Scan young coins (newest launches + most recently traded).
    const urls = [];
    for (let i = 0; i < CREATED_PAGES; i++) urls.push(`https://frontend-api-v3.pump.fun/coins?offset=${i * 50}&limit=50&sort=created_timestamp&order=DESC&includeNsfw=true`);
    for (let i = 0; i < ACTIVE_PAGES; i++) urls.push(`https://frontend-api-v3.pump.fun/coins?offset=${i * 50}&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=true`);
    const pages = await Promise.all(urls.map((x) => getJson(x, ctr)));
    const byMint = new Map(); let listOk = 0, oldestCreatedAge = null;
    pages.forEach((pg, i) => {
      if (!Array.isArray(pg)) return; listOk++;
      for (const x of pg) if (x?.mint && !byMint.has(x.mint)) byMint.set(x.mint, x);
      if (i === CREATED_PAGES - 1 && pg.length) oldestCreatedAge = Math.round((now - pg[pg.length - 1].created_timestamp) / 60000);
    });
    if (listOk < urls.length) c.listFails += urls.length - listOk;
    const seen = new Map(this.sql.exec(`SELECT mint, status FROM seen`).toArray().map((r) => [r.mint, r.status]));
    const cands = [];
    for (const x of byMint.values()) {
      const age = now - x.created_timestamp;
      const sst = seen.get(x.mint);
      // 'nocross' = checked from launch, no minute had closed >= 60 SOL yet: re-check only while it trades at/above 60 now.
      if ((sst && sst !== "nocross") || (sst === "nocross" && (x.market_cap || 0) < CFG.CROSS) || x.complete || age > (CFG.MAX_ENTRY_BUCKET + 2) * 60000 || age < 60000) continue;
      if (String(x.total_supply) !== "1000000000000000" || !(x.quote_mint == null || SOL_QUOTES.has(x.quote_mint))) continue; // standard SOL-curve coins only (backtest excluded mayhem)
      const solPer = x.usd_market_cap && x.market_cap ? x.usd_market_cap / x.market_cap : null;
      const athSol = solPer && x.ath_market_cap ? x.ath_market_cap / solPer : 0;
      if ((x.market_cap || 0) >= CFG.CROSS * 0.97 || athSol >= CFG.CROSS) cands.push(x);
    }
    cands.sort((a, b) => b.created_timestamp - a.created_timestamp);
    // 3) Evaluate candidates from trades (exact launch-aligned buckets and buy/sell counts).
    let evaluated = 0, deferred = 0, fetchFails = 0;
    for (const x of cands) {
      if (ctr.n >= BUDGET - 1 || ctr.swap >= SWAP_BUDGET) { deferred++; continue; }
      const launch = x.created_timestamp;
      const r = await tradesSince(x.mint, launch, ENTRY_PAGES, ctr);
      if (!r.ok) { if (++fetchFails >= 3) break; continue; } // likely rate-limited: stop this run, retry next minute
      evaluated++;
      const bs = buckets(r.trades, launch);
      const ks = [...bs.keys()].sort((a, b) => a - b);
      const nowBucket = Math.floor((now - launch) / 60000);
      const j = ks.find((k) => k <= CFG.MAX_ENTRY_BUCKET && k < nowBucket && bs.get(k).c >= CFG.CROSS);
      const mark = (status) => this.sql.exec(`INSERT OR REPLACE INTO seen(mint,ts,status) VALUES(?,?,?)`, x.mint, now, status);
      if (j === undefined) { if (r.reached) mark(nowBucket > CFG.MAX_ENTRY_BUCKET + 1 ? "never_crossed" : "nocross"); continue; }
      if (!r.reached) { mark("skipped_coverage"); c.skippedCoverage++; continue; } // can't prove this is the first crossing
      c.crossings++;
      let nb = 0, ns = 0; for (let k = Math.max(0, j - 2); k <= j; k++) { const b = bs.get(k); if (b) { nb += b.nb; ns += b.ns; } }
      const bsr = (nb + 1) / (ns + 1), entryTs = launch + (j + 1) * 60000, lag = Math.round((now - entryTs) / 1000);
      if (bsr < CFG.BSR) { mark("filtered_bsr"); c.filteredOut++; continue; }
      if (lag > 180) { mark("skipped_late"); c.skippedLate++; continue; } // detected >3 min after the signal: not a live-tradeable entry
      const sol = solFrom(r.trades);
      if (!sol) continue;
      const p = { mint: x.mint, entryMc: bs.get(j).c, entryBucket: j, peak: bs.get(j).c, lastClose: bs.get(j).c, lastBucket: j, launch };
      // Catch up buckets that already finished between the signal and now.
      let done = null;
      for (let k = j + 1; k < nowBucket; k++) {
        const b = bs.get(k) || { k, o: p.lastClose, h: p.lastClose, l: p.lastClose, c: p.lastClose };
        const s = stepExit(p, b); p.lastClose = b.c; p.lastBucket = k;
        if (s.exit) { done = { ...s, ts: launch + (k + 1) * 60000 }; break; }
      }
      const lastTs = launch + (p.lastBucket + 1) * 60000;
      this.sql.exec(`INSERT OR REPLACE INTO trades(mint,sym,launch,entryBucket,entryTs,entryMc,buys3,sells3,bsr,detectLagSec,solUsd,status,peak,lastBucket,lastClose,lastTs) VALUES(?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`,
        x.mint, x.symbol, launch, j, entryTs, p.entryMc, nb, ns, bsr, lag, sol, p.peak, p.lastBucket, p.lastClose, lastTs);
      if (done) {
        const pnl = pnlUsd(p.entryMc, done.px, sol);
        this.sql.exec(`UPDATE trades SET status='closed', exitTs=?, exitReason=?, exitMc=?, exitPct=?, peakPct=?, pnlUsd=? WHERE mint=?`,
          done.ts, done.reason, done.px, (done.px / p.entryMc - 1) * 100, (p.peak / p.entryMc - 1) * 100, pnl, x.mint);
      }
      mark("entered"); c.entries++;
    }
    this.sql.exec(`DELETE FROM seen WHERE ts < ?`, now - 3 * 3600000);
    this.meta("counters", c);
    const s = { fetchFails, httpErrors: ctr.codes, subrequests: ctr.n, swapCalls: ctr.swap, listOk, coinsScanned: byMint.size, oldestCreatedAgeMin: oldestCreatedAge, candidates: cands.length, evaluated, deferred, openUpdated: exitsUpdated, openFails, open: open.length };
    this.meta("lastRun", { at: now, ...s });
    console.log(JSON.stringify(s));
    return s;
  }

  report(u) {
    const now = Date.now();
    const rows = this.sql.exec(`SELECT * FROM trades ORDER BY entryTs`).toArray();
    const closed = rows.filter((r) => r.status === "closed").sort((a, b) => a.exitTs - b.exitTs);
    const stats = (xs) => {
      const n = xs.length; if (!n) return { trades: 0, wins: 0, winRatePct: null, netUsd: 0, avgUsd: null, maxDrawdownUsd: 0, longestLosingStreak: 0, endBankroll: 200 };
      let eq = 200, pk = 200, dd = 0, streak = 0, worst = 0, wins = 0, net = 0;
      for (const r of xs) { net += r.pnlUsd; eq += r.pnlUsd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); if (r.pnlUsd > 0) { wins++; streak = 0; } else { streak++; worst = Math.max(worst, streak); } }
      return { trades: n, wins, winRatePct: r2((wins / n) * 100), netUsd: r2(net), avgUsd: r2(net / n), maxDrawdownUsd: r2(dd), longestLosingStreak: worst, endBankroll: r2(200 + net) };
    };
    const fmt = (r) => ({ mint: r.mint, sym: r.sym, launch: bris(r.launch), entryTime: bris(r.entryTs), entryMinuteAfterLaunch: r.entryBucket + 1, entryMcSol: r2(r.entryMc),
      buys3m: r.buys3, sells3m: r.sells3, bsr: r2(r.bsr), detectLagSec: r.detectLagSec, solUsd: r2(r.solUsd), status: r.status,
      exitTime: bris(r.exitTs), exitReason: r.exitReason, exitMcSol: r2(r.exitMc), exitPct: r2(r.exitPct), peakPct: r2(r.status === "open" ? (r.peak / r.entryMc - 1) * 100 : r.peakPct),
      pnlUsd: r2(r.pnlUsd), dataGaps: r.dataGaps });
    return {
      paused: this.paused,
      about: "Paper only. Entry: first launch-aligned minute (<=30 min after launch) closing >= 60 SOL mcap with (buys+1)/(sells+1) >= 2.5 over that minute and the 2 before; exit -10% stop, 25% trail from peak once +50%, 60-min time stop. $10 per trade, 1% fee + 0.0015 SOL priority each way, 3% slippage each way (+2% <40 SOL, +2% more <30 SOL). Stats on closed trades by exit time, $200 bankroll. Times Brisbane (UTC+10).",
      startedAt: bris(this.meta("startedAt")), lastRun: this.meta("lastRun") ? { ...this.meta("lastRun"), at: bris(this.meta("lastRun").at) } : null,
      counters: this.meta("counters"), open: rows.filter((r) => r.status === "open").length,
      last24h: stats(closed.filter((r) => r.exitTs >= now - 86400000)), sinceStart: stats(closed),
      trades: (u.searchParams.get("rows") === "all" ? rows : rows.slice(-200)).map(fmt),
    };
  }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), auth = req.headers.get("Authorization") || "";
    if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) return new Response("unauthorized", { status: 401 });
    if (u.pathname === "/play-log") return env.PLAY.get(env.PLAY.idFromName("main")).fetch("https://do/play-log" + u.search);
    return new Response("use /play-log (add ?rows=all for every trade)", { status: 404 });
  },
};
