// FOMO Radar alert trigger on Cloudflare (replaces the always-on box timer, scripts/alert-trigger.sh).
// pump.fun blocks Vercel, but not Cloudflare, so this fetches the coin list here and POSTs it to
// /api/telegram, which scores coins and sends Telegram alerts. Dedupe lives in KV (one key per mint).
const PAGES = 4;
const SORTS = ["created_timestamp", "last_trade_timestamp"];
const SEEN_TTL = 86400; // 24h
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FIELDS = ["mint", "symbol", "name", "image_uri", "usd_market_cap", "market_cap_usd", "reply_count",
  "created_timestamp", "complete", "real_token_reserves", "base_decimals", "ath_market_cap", "ath_market_cap_timestamp"];

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
  const seen = [];
  let cursor;
  do {
    const l = await env.SEEN.list({ cursor });
    for (const k of l.keys) seen.push(k.name);
    cursor = l.list_complete ? undefined : l.cursor;
  } while (cursor);

  const r = await fetch(env.ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ seen, coins }),
  });
  let resp = {};
  try { resp = await r.json(); } catch {}
  if (r.status === 200 && Array.isArray(resp.sentMints)) {
    await Promise.all(resp.sentMints.map((m) => env.SEEN.put(m, String(Date.now()), { expirationTtl: SEEN_TTL })));
  }
  const summary = { pumpStatuses: pages.map((p) => p.status), coins: coins.length, seen: seen.length, endpoint: r.status,
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
    return Response.json(await runOnce(env));
  },
};
