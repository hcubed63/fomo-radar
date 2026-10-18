// Alert log + outcome tracking. Everything lives in ONE KV key ("state") so the free plan's
// KV limits hold (1 read per run, at most ~1 write per 5 minutes plus one per alert run, no list calls).
import { PUMP_HEADERS } from "./quality.js";
export const TP = 1.25, SL = 0.85, CLOSE_MIN = 60, CHECK_EVERY_MS = 5 * 60000, CHECKPOINTS = [5, 15, 30];
const SUPPLY = 1e9;
const MAX_LOG = 2000;

async function getJson(url) {
  try { const r = await fetch(url, { headers: PUMP_HEADERS }); return r.ok ? await r.json() : null; } catch { return null; }
}

// Alerts Hans reported before the log existed (times are Brisbane, UTC+10). Holder notes are his numbers.
const BACKFILL = [
  { mint: "4znAboeQv71KnMBtdWspYWJq9u915KXvYEdq15uupump", sym: "PUMPCATE", score: 9, alertMc: 5900, alertTs: Date.parse("2026-10-18T09:49:51+10:00"), holdersAtAlert: 48, note: "backfilled; 28 holders at 9:59 (Hans)" },
  { mint: "6St47Gy9qM7VsGks8XPPZtwfeaLZkZkwVpg2nfSopump", sym: "FACE", score: 9, alertMc: 6400, alertTs: Date.parse("2026-10-18T09:50:51+10:00"), note: "backfilled" },
  { mint: "7A4K6mGHD76ysNatMf6xCrimDQUBt7EcGDScL6m2pump", sym: "SI", score: 8, alertMc: 8500, alertTs: Date.parse("2026-10-18T09:54:51+10:00"), holdersAtAlert: 44, note: "backfilled; 71 holders later (Hans)" },
  { mint: "4Wewvre7VMESZSxs6KV18TmVALqjgUh79cKzyX7vpump", sym: null, score: null, alertMc: null, alertTs: Date.parse("2026-10-18T09:59:51+10:00"), note: "backfilled from dedupe list; score and reasons not recorded" },
];

export async function loadState(env) {
  let st = await env.SEEN.get("state", "json");
  if (!st) {
    // One-time migration from the old one-key-per-mint dedupe list.
    st = { seen: {}, alerts: [] };
    let cursor;
    do {
      const l = await env.SEEN.list({ cursor });
      for (const k of l.keys) if (k.name !== "state") st.seen[k.name] = Date.now();
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
  }
  if (!st.backfilled) {
    for (const b of BACKFILL) if (!st.alerts.some((a) => a.mint === b.mint))
      st.alerts.push(newAlert(b));
    st.backfilled = true; st.dirty = true;
  }
  // Forget dedupe entries after 24h.
  for (const [m, t] of Object.entries(st.seen)) if (Date.now() - t > 86400000) delete st.seen[m];
  return st;
}

export function newAlert(x) {
  return { mint: x.mint, sym: x.sym ?? null, score: x.score ?? null, reasons: x.reasons ?? null, why: x.why ?? null,
    alertMc: x.alertMc ?? null, alertTs: x.alertTs, holdersAtAlert: x.holdersAtAlert ?? null, newBuyers5mBefore: x.newBuyers5m ?? null,
    topPct: x.topPct ?? null, devPct: x.devPct ?? null, fill: x.fill ?? null, note: x.note ?? null,
    status: "open", outcome: null, hitTs: null, peakMc: null, peakTs: null, mc5: null, mc15: null, mc30: null, mc60: null,
    holders5: null, holders15: null, holders30: null, lastCheck: 0 };
}

// Rebuild an alert's price outcome from pump.fun 1-minute candles (mcap = price x 1B supply).
function applyCandles(a, candles) {
  const start = Math.floor(a.alertTs / 60000) * 60000 + 60000; // first full minute after the alert
  const rows = candles.filter((c) => c.timestamp >= start && c.timestamp < a.alertTs + CLOSE_MIN * 60000)
    .map((c) => ({ t: c.timestamp, h: +c.high * SUPPLY, l: +c.low * SUPPLY, c: +c.close * SUPPLY }))
    .sort((x, y) => x.t - y.t);
  if (a.alertMc == null) {
    const prev = candles.filter((c) => c.timestamp < start).sort((x, y) => y.timestamp - x.timestamp)[0];
    if (prev) a.alertMc = Math.round(+prev.close * SUPPLY);
  }
  if (!a.alertMc || !rows.length) return;
  a.outcome = null; a.hitTs = null; a.peakMc = null;
  for (const r of rows) {
    if (a.peakMc == null || r.h > a.peakMc) { a.peakMc = Math.round(r.h); a.peakTs = r.t; }
    if (!a.outcome) {
      const tp = r.h >= a.alertMc * TP, sl = r.l <= a.alertMc * SL;
      if (tp && sl) { a.outcome = "both_same_minute"; a.hitTs = r.t; }
      else if (tp) { a.outcome = "take_profit"; a.hitTs = r.t; }
      else if (sl) { a.outcome = "stop"; a.hitTs = r.t; }
    }
  }
  for (const n of [5, 15, 30, 60]) {
    const at = a.alertTs + n * 60000;
    if (Date.now() < at) continue;
    const r = rows.filter((x) => x.t + 60000 <= at + 60000 && x.t <= at).at(-1);
    if (r) a["mc" + n] = Math.round(r.c);
  }
}

// Returns the number of subrequests used. budget = max allowed.
export async function checkOpen(st, coinsByMint, budget) {
  let used = 0;
  const now = Date.now();
  for (const a of st.alerts) {
    if (a.status !== "open") continue;
    if (!a.sym && coinsByMint.get(a.mint)) { a.sym = coinsByMint.get(a.mint).symbol; st.dirty = true; }
    const age = (now - a.alertTs) / 60000;
    // Holder checkpoints need a live read at the right moment (can't be rebuilt later).
    for (const n of CHECKPOINTS) {
      if (a["holders" + n] == null && age >= n && age < n + 4 && used < budget) {
        const h = await getJson(`https://frontend-api-v3.pump.fun/coins/top-holders/${a.mint}`); used++;
        if (h && typeof h.totalHolders === "number") { a["holders" + n] = h.totalHolders; st.dirty = true; }
      }
    }
    const closing = age >= CLOSE_MIN;
    if ((closing || now - a.lastCheck >= CHECK_EVERY_MS) && used < budget) {
      const j = await getJson(`https://swap-api.pump.fun/v2/coins/${a.mint}/candles?interval=1m&limit=${Math.min(1000, Math.ceil(age) + 10)}&currency=USD&createdTs=${a.alertTs - 3600000}`); used++;
      if (Array.isArray(j)) applyCandles(a, j);
      a.lastCheck = now; st.dirty = true;
      if (closing && Array.isArray(j)) { a.status = "closed"; if (!a.outcome) a.outcome = "neither"; }
      if (closing && !Array.isArray(j) && age > CLOSE_MIN + 30) { a.status = "closed"; a.outcome = a.outcome || "unknown"; }
    }
  }
  if (st.alerts.length > MAX_LOG) st.alerts = st.alerts.slice(-MAX_LOG);
  return used;
}

const COLS = ["day", "time", "sym", "mint", "score", "reasons", "alertMc", "outcome", "hitMin", "peakMc", "peakPct", "mc5", "mc15", "mc30", "mc60",
  "holdersAtAlert", "holders5", "holders15", "holders30", "holderChange30", "newBuyers5mBefore", "topPct", "devPct", "fill", "status", "note"];
const bris = (t) => new Date(t + 10 * 3600000).toISOString(); // Brisbane is UTC+10, no DST
export function rows(st) {
  return st.alerts.map((a) => {
    const lastH = a.holders30 ?? a.holders15 ?? a.holders5;
    return { day: bris(a.alertTs).slice(0, 10), time: bris(a.alertTs).slice(11, 19), sym: a.sym, mint: a.mint, score: a.score, reasons: a.reasons,
      alertMc: a.alertMc, outcome: a.outcome, hitMin: a.hitTs ? Math.round((a.hitTs - a.alertTs) / 60000) : null, peakMc: a.peakMc,
      peakPct: a.peakMc && a.alertMc ? Math.round((a.peakMc / a.alertMc - 1) * 100) : null, mc5: a.mc5, mc15: a.mc15, mc30: a.mc30, mc60: a.mc60,
      holdersAtAlert: a.holdersAtAlert, holders5: a.holders5, holders15: a.holders15, holders30: a.holders30,
      holderChange30: lastH != null && a.holdersAtAlert != null ? lastH - a.holdersAtAlert : null,
      newBuyers5mBefore: a.newBuyers5mBefore, topPct: a.topPct, devPct: a.devPct, fill: a.fill, status: a.status, note: a.note };
  });
}
export function summary(rs) {
  const byDay = {};
  for (const r of rs) {
    const d = (byDay[r.day] ||= { alerts: 0, take_profit: 0, stop: 0, both_same_minute: 0, neither: 0, open: 0, _peak: [], _hc: [] });
    d.alerts++;
    if (r.status === "open" && !r.outcome) d.open++; else if (r.outcome in d) d[r.outcome]++;
    if (r.peakPct != null) d._peak.push(r.peakPct);
    if (r.holderChange30 != null) d._hc.push(r.holderChange30);
  }
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  for (const d of Object.values(byDay)) {
    const decided = d.take_profit + d.stop;
    d.winRate = decided ? Math.round((d.take_profit / decided) * 100) + "%" : null;
    d.avgPeakPct = avg(d._peak); d.avgHolderChange = avg(d._hc); delete d._peak; delete d._hc;
  }
  return byDay;
}
export function csv(rs) {
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [COLS.join(","), ...rs.map((r) => COLS.map((c) => esc(r[c])).join(","))].join("\n");
}
