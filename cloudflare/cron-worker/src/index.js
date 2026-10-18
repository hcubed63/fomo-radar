// FOMO Radar alert trigger on Cloudflare (replaces the always-on box timer, scripts/alert-trigger.sh).
// pump.fun blocks Vercel, but not Cloudflare, so this fetches the coin list here and POSTs it to
// /api/telegram, which scores coins and sends Telegram alerts. Dedupe and the alert log live in one KV key (see outcomes.js).
import { saveState, loadState, newAlert, checkOpen, rows, summary, csv } from "./outcomes.js";
import { cheap, socials, enrich, judge, DEFAULT_RULES } from "./quality.js";
const PAGES = 4;
const MAX_ENRICH = 12; // 2 subrequests each
// Free plan: 50 subrequests per run. 8 pump pages + 1 endpoint POST; outcome checks get up to 15, scoring the rest.
const BUDGET = 50 - 8 - 1, MAX_OUTCOME = 15;
const SORTS = ["created_timestamp", "last_trade_timestamp"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FIELDS = ["mint", "symbol", "name", "image_uri", "usd_market_cap", "market_cap_usd", "reply_count",
  "created_timestamp", "complete", "real_token_reserves", "base_decimals", "ath_market_cap", "ath_market_cap_timestamp", "creator", "bonding_curve", "associated_bonding_curve", "twitter", "telegram", "website"];

async function fetchPage(sort, i) {
  const url = `https://frontend-api-v3.pump.fun/coins?offset=${i * 50}&limit=50&sort=${sort}&order=DESC&includeNsfw=false`;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA, Origin: "https://pump.fun", Referer: "https://pump.fun/" } });
    const data = r.ok ? await r.json() : [];
    return { status: r.status, coins: Array.isArray(data) ? data : [] };
  } catch (e) { return { status: 0, coins: [] }; }
}

async function runOnce(env) {
  const pages = await Promise.all(SORTS.flatMap((s) => Array.from({ length: PAGES }, (_, i) => fetchPage(s, i))));
  const byMint = new Map();
  for (const p of pages) for (const c of p.coins) if (c && c.mint && !byMint.has(c.mint)) {
    const o = {}; for (const f of FIELDS) o[f] = c[f] ?? null; byMint.set(c.mint, o);
  }
  const coins = [...byMint.values()];
  const st = await loadState(env);
  const seen = Object.keys(st.seen);
  const outcomeCalls = await checkOpen(st, byMint, MAX_OUTCOME);
  const maxEnrich = Math.max(0, Math.min(MAX_ENRICH, Math.floor((BUDGET - outcomeCalls) / 2)));
  // Extra checks only for coins that already pass the cheap rules and haven't alerted yet.
  const seenSet = new Set(seen);
  const now = Date.now();
  const cands = coins.map((c) => [c, cheap(c, now)]).filter(([c, q]) => q && !seenSet.has(c.mint))
    .sort((a, b) => b[1].fill - a[1].fill).slice(0, maxEnrich);
  const judged = await Promise.all(cands.map(async ([c, q]) => {
    const s = socials(c); const e = await enrich(c); const j = judge(q, s, e, DEFAULT_RULES);
    c.quality = { ...j, ...e, fill: Math.round(q.fill * 10) / 10 };
    return { sym: c.symbol, pass: j.pass, score: j.score, why: j.why };
  }));
  const r = await fetch(env.ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ seen, coins }),
  });
  let resp = {};
  try { resp = await r.json(); } catch {}
  if (r.status === 200 && Array.isArray(resp.sentMints) && resp.sentMints.length) {
    for (const m of resp.sentMints) {
      st.seen[m] = Date.now();
      const c = byMint.get(m); const q = c?.quality || {};
      st.alerts.push(newAlert({ mint: m, sym: c?.symbol, score: q.score, reasons: q.line, why: q.why, alertMc: Math.round(c?.usd_market_cap || c?.market_cap_usd || 0) || null,
        alertTs: Date.now(), holdersAtAlert: q.holders, newBuyers5m: q.newBuyers5m, topPct: q.topPct, devPct: q.devPct, fill: q.fill }));
    }
    st.dirty = true;
  }
  if (st.dirty) { delete st.dirty; await saveState(env, st); }
  const summary = { outcomeCalls, open: st.alerts.filter((a) => a.status === "open").length, judged, pumpStatuses: pages.map((p) => p.status), coins: coins.length, seen: seen.length, endpoint: r.status,
    ok: resp.ok, scanned: resp.scanned, candidates: resp.candidates, sent: resp.sent, errors: resp.errors };
  console.log(JSON.stringify(summary));
  return summary;
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(runOnce(env)); },
  async fetch(req, env) {
    const u = new URL(req.url);
    const auth = req.headers.get("Authorization") || "";
    if (!env.CRON_SECRET || (auth !== `Bearer ${env.CRON_SECRET}` && u.searchParams.get("key") !== env.CRON_SECRET))
      return new Response("unauthorized", { status: 401 });
    if (u.pathname === "/run") {
      // Don't overlap a scheduled run (they take up to ~50s and fire every minute).
      const st = await env.SEEN.get("state", "json");
      if (st?.lastSave && Date.now() - st.lastSave < 60000) return Response.json({ skipped: "a run saved <60s ago; try again shortly" }, { status: 409 });
      return Response.json(await runOnce(env));
    }
    const st = (await env.SEEN.get("state", "json")) || { alerts: [] };
    const rs = rows(st);
    if (u.pathname === "/log.csv") return new Response(csv(rs), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    if (u.pathname === "/log") return Response.json({ summaryByDay: summary(rs), alerts: rs });
    return new Response("use /log, /log.csv or /run", { status: 404 });
  },
};
