// FOMO Radar launch paper-trade experiment. No Telegram, no trading.
// Samples brand-new pump.fun launches, then ~33 min after launch rebuilds their first 30 minutes from
// 1-minute candles and records what buying at ~1 and ~2 minutes old would have done.
const H = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", Origin: "https://pump.fun", Referer: "https://pump.fun/" };
const SAMPLE_PER_RUN = 15;   // random launches added per run (run = 2 min)
const EVAL_PER_RUN = 30;     // candle fetches per run (free plan: 50 subrequests)
const EVAL_AGE_MIN = 33, WINDOW_MIN = 30, MAX_ROWS = 4000;
const SUPPLY = 1e9;
const bris = (t) => new Date(t + 10 * 3600000).toISOString().replace("T", " ").slice(0, 19);

async function getJson(url) { try { const r = await fetch(url, { headers: H }); return r.ok ? await r.json() : null; } catch { return null; } }

export function evaluate(p, candles) {
  const cs = candles.map((c) => ({ t: c.timestamp, o: +c.open * SUPPLY, h: +c.high * SUPPLY, l: +c.low * SUPPLY, c: +c.close * SUPPLY })).sort((a, b) => a.t - b.t);
  const mcAt = (ms) => { const r = cs.filter((x) => x.t <= ms - 60000).at(-1) || cs.filter((x) => x.t <= ms).at(-1); return r ? r.c : cs[0] ? cs[0].o : null; }; // before the first trade = launch price
  const out = { mint: p.mint, sym: p.sym, launch: bris(p.created), created: p.created, startMc: cs[0] ? Math.round(cs[0].c) : null };
  for (const e of [1, 2]) {
    const entryT = p.created + e * 60000, entry = mcAt(entryT);
    const rows = cs.filter((x) => x.t >= Math.floor(entryT / 60000) * 60000 && x.t < p.created + WINDOW_MIN * 60000);
    const k = "e" + e;
    if (!entry) { out[k] = null; continue; }
    if (!rows.length) { // nobody traded after the entry minute: flat, no exit move, counted as dead
      out[k] = { entryMc: Math.round(entry), first: "neither", firstMin: null, hit10: false, hit15: false, peakPct: 0, timeToPeakMin: null, rug10: false, mc10: Math.round(entry), dead10: true, noTrades: true };
      continue;
    }
    let first = null, firstMin = null, peak = 0, peakT = null, hit10 = false, hit15 = false, rug10 = false;
    for (const r of rows) {
      if (r.h > peak) { peak = r.h; peakT = r.t; }
      if (r.h >= entry * 1.10) hit10 = true;
      if (r.h >= entry * 1.15) hit15 = true;
      if (r.t < p.created + 10 * 60000 && r.l <= entry * 0.5) rug10 = true;
      if (!first) {
        const tp = r.h >= entry * 1.25, sl = r.l <= entry * 0.85;
        if (tp || sl) { first = tp && sl ? "both_same_minute" : tp ? "take_profit" : "stop"; firstMin = Math.round((r.t - entryT) / 60000); }
      }
    }
    const last10 = mcAt(p.created + 10 * 60000);
    out[k] = { entryMc: Math.round(entry), first: first || "neither", firstMin, hit10, hit15, peakPct: Math.round((peak / entry - 1) * 100),
      timeToPeakMin: Math.max(0, Math.round((peakT - entryT) / 60000)), rug10, mc10: last10 ? Math.round(last10) : null,
      dead10: rug10 || (last10 != null && last10 <= entry * 0.6) };
  }
  return out;
}

function summarize(rows, sinceMs) {
  const res = {};
  for (const e of ["e1", "e2"]) {
    const xs = rows.filter((r) => r.created >= sinceMs && r[e]).map((r) => r[e]);
    const n = xs.length, pct = (f) => (n ? Math.round((xs.filter(f).length / n) * 1000) / 10 : null);
    const tp = xs.filter((x) => x.first === "take_profit").length, sl = xs.filter((x) => x.first === "stop").length;
    const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    res[e === "e1" ? "buyAt1Min" : "buyAt2Min"] = { n, tpFirstPct: pct((x) => x.first === "take_profit"), stopFirstPct: pct((x) => x.first === "stop"),
      bothSameMinutePct: pct((x) => x.first === "both_same_minute"), neitherPct: pct((x) => x.first === "neither"),
      winRateDecided: tp + sl ? Math.round((tp / (tp + sl)) * 1000) / 10 : null,
      hit10Pct: pct((x) => x.hit10), hit15Pct: pct((x) => x.hit15), deadOrRug10MinPct: pct((x) => x.dead10),
      medianPeakPct: med(xs.map((x) => x.peakPct)), medianTimeToPeakMin: med(xs.map((x) => x.timeToPeakMin)),
      // EV per trade if you exit at +25% / -15% (neither = exit at 30 min mark, ignored as 0): rough, ignores fees/slippage.
      evPctPerTradeTpSl: n ? Math.round(((tp * 25 - sl * 15) / n) * 10) / 10 : null };
  }
  return res;
}

async function runOnce(env) {
  const st = (await env.STATE.get("state", "json")) || { pending: [], rows: [], startedAt: Date.now(), launchesSeen: 0, sampled: 0 };
  const now = Date.now();
  const list = await getJson("https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false");
  let added = 0, fresh = [];
  if (Array.isArray(list)) {
    const known = new Set([...st.pending.map((p) => p.mint), ...st.rows.slice(-1000).map((r) => r.mint)]);
    // Launches 0-3 min old that we haven't seen; with 2-min runs each launch is eligible once or twice.
    fresh = list.filter((c) => c?.mint && c.created_timestamp && now - c.created_timestamp <= 180000 && !known.has(c.mint)
      // standard pump.fun curve launches only (odd-supply modes break mcap = price x 1B)
      && (c.usd_market_cap || c.market_cap_usd || 0) >= 1500 && (c.usd_market_cap || c.market_cap_usd || 0) <= 15000 && !c.complete);
    const newSince = fresh.filter((c) => !st.lastCreated || c.created_timestamp > st.lastCreated);
    st.launchesSeen += newSince.length;
    if (fresh.length) st.lastCreated = Math.max(st.lastCreated || 0, ...fresh.map((c) => c.created_timestamp));
    const pick = fresh.sort(() => Math.random() - 0.5).slice(0, SAMPLE_PER_RUN);
    for (const c of pick) st.pending.push({ mint: c.mint, sym: c.symbol, created: c.created_timestamp });
    added = pick.length; st.sampled += added;
  }
  let evaluated = 0, failed = 0;
  const due = st.pending.filter((p) => now - p.created >= EVAL_AGE_MIN * 60000).slice(0, EVAL_PER_RUN);
  const done = new Set();
  await Promise.all(due.map(async (p) => {
    const j = await getJson(`https://swap-api.pump.fun/v2/coins/${p.mint}/candles?interval=1m&limit=60&currency=USD&createdTs=${p.created}`);
    if (Array.isArray(j)) { st.rows.push(evaluate(p, j)); evaluated++; done.add(p.mint); }
    else if (now - p.created > 90 * 60000) { done.add(p.mint); failed++; } else failed++;
  }));
  st.pending = st.pending.filter((p) => !done.has(p.mint));
  if (st.rows.length > MAX_ROWS) st.rows = st.rows.slice(-MAX_ROWS);
  st.lastRun = now;
  // Merge-on-write so a manual /run overlapping the cron can't drop rows or pending launches.
  const cur = (await env.STATE.get("state", "json")) || { pending: [], rows: [] };
  const rowMints = new Set(st.rows.map((r) => r.mint));
  for (const r of cur.rows || []) if (!rowMints.has(r.mint)) { st.rows.push(r); rowMints.add(r.mint); }
  const pend = new Set(st.pending.map((p) => p.mint));
  for (const p of cur.pending || []) if (!pend.has(p.mint) && !rowMints.has(p.mint)) st.pending.push(p);
  st.rows.sort((a, b) => a.created - b.created);
  if (st.rows.length > MAX_ROWS) st.rows = st.rows.slice(-MAX_ROWS);
  await env.STATE.put("state", JSON.stringify(st));
  const s = { listOk: Array.isArray(list), fresh: fresh.length, added, evaluated, failed, pending: st.pending.length, rows: st.rows.length };
  console.log(JSON.stringify(s));
  return s;
}

const COLS = ["launch", "sym", "mint", "startMc"];
const E = ["entryMc", "first", "firstMin", "hit10", "hit15", "peakPct", "timeToPeakMin", "rug10", "mc10", "dead10"];
function csv(rows) {
  const head = [...COLS, ...E.map((f) => "e1_" + f), ...E.map((f) => "e2_" + f)];
  const v = (x) => (x == null ? "" : String(x).replace(/,/g, " "));
  return [head.join(","), ...rows.map((r) => [...COLS.map((c) => v(r[c])), ...E.map((f) => v(r.e1?.[f])), ...E.map((f) => v(r.e2?.[f]))].join(","))].join("\n");
}

export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(runOnce(env)); },
  async fetch(req, env) {
    const u = new URL(req.url), auth = req.headers.get("Authorization") || "";
    if (!env.CRON_SECRET || (auth !== `Bearer ${env.CRON_SECRET}` && u.searchParams.get("key") !== env.CRON_SECRET)) return new Response("unauthorized", { status: 401 });
    if (u.pathname === "/run") {
      const cur = await env.STATE.get("state", "json");
      if (cur?.lastRun && Date.now() - cur.lastRun < 90000) return Response.json({ skipped: "a run happened <90s ago" }, { status: 409 });
      return Response.json(await runOnce(env));
    }
    const st = (await env.STATE.get("state", "json")) || { rows: [], pending: [] };
    if (u.pathname === "/launch-log.csv") return new Response(csv(st.rows), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    if (u.pathname === "/launch-log") {
      const now = Date.now(), hrs = st.startedAt ? (now - st.startedAt) / 3.6e6 : 0;
      return Response.json({
        about: "Paper trade: buy new pump.fun launches at ~1 or ~2 min old; outcome over first 30 min from 1-min candles. Exit rule +25% take profit / -15% stop. Times Brisbane (UTC+10).",
        startedAt: st.startedAt ? bris(st.startedAt) : null, lastRun: st.lastRun ? bris(st.lastRun) : null, hoursRunning: Math.round(hrs * 10) / 10,
        launchesSeen: st.launchesSeen, sampled: st.sampled, evaluated: st.rows.length, pending: st.pending.length,
        evaluatedPerHour: hrs ? Math.round(st.rows.length / Math.max(hrs - 0.55, 0.1)) : null,
        last24h: summarize(st.rows, now - 86400000), allTime: summarize(st.rows, 0),
        recent: u.searchParams.get("rows") === "all" ? st.rows : st.rows.slice(-50),
      });
    }
    return new Response("use /launch-log, /launch-log.csv or /run", { status: 404 });
  },
};
