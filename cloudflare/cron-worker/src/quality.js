// Quality signals for FOMO Radar alerts, from pump.fun's free endpoints (reachable from Cloudflare).
// Used by the cron Worker (enrichment) and the shadow test script.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
export const PUMP_HEADERS = { Accept: "application/json", "User-Agent": UA, Origin: "https://pump.fun", Referer: "https://pump.fun/" };
const CURVE_TOKENS = 793_100_000;
const SUPPLY = 1_000_000_000;

export function cheap(coin, now = Date.now()) {
  if (!coin?.mint || coin.complete) return null;
  const mc = coin.market_cap_usd || coin.usd_market_cap || 0;
  if (mc < 4000 || mc > 25000) return null;
  const ageMin = Math.max(0.5, (now - (coin.created_timestamp || now)) / 60000);
  if (ageMin < 4 || ageMin > 45) return null;
  const left = Number(coin.real_token_reserves ?? NaN) / 10 ** (coin.base_decimals ?? 6);
  if (!Number.isFinite(left)) return null;
  const curvePct = Math.max(0, Math.min(100, (1 - left / CURVE_TOKENS) * 100));
  const fill = curvePct / ageMin;
  if (curvePct < 12 || curvePct > 65 || fill < 0.8) return null;
  if (ageMin < 8 && fill > 8) return null;
  const ath = coin.ath_market_cap > 1000 ? coin.ath_market_cap : mc;
  if (mc / ath < 0.7 && ath > mc * 1.25) return null;
  return { mc, ageMin, curvePct, fill };
}

const hasLink = (v) => typeof v === "string" && v.trim().length > 4;
export function socials(coin) {
  return { twitter: hasLink(coin.twitter), telegram: hasLink(coin.telegram), website: hasLink(coin.website) };
}

async function getJson(url) {
  try { const r = await fetch(url, { headers: PUMP_HEADERS }); return r.ok ? await r.json() : null; } catch { return null; }
}

// 2 subrequests per coin. Every field is null when the source failed (shown as "unknown").
export async function enrich(coin) {
  const [h, t] = await Promise.all([
    getJson(`https://frontend-api-v3.pump.fun/coins/top-holders/${coin.mint}`),
    getJson(`https://swap-api.pump.fun/v2/coins/${coin.mint}/trades?limit=100&cursor=0&minSolAmount=0`),
  ]);
  const out = { holders: null, topPct: null, devPct: null, devSold: null, devTradesSeen: null };
  if (h && Array.isArray(h.topHolders)) {
    out.holders = typeof h.totalHolders === "number" ? h.totalHolders : null;
    // The bonding curve account holds the unsold supply; it isn't a wallet.
    const wallets = h.topHolders.filter((x) => x.address !== coin.bonding_curve && x.address !== coin.associated_bonding_curve);
    const pct = (x) => (Number(x.amount) / SUPPLY) * 100;
    out.topPct = wallets.length ? Math.round(Math.max(...wallets.map(pct)) * 10) / 10 : 0;
    const dev = wallets.find((x) => x.address === coin.creator || x.isDev);
    out.devPct = dev ? Math.round(pct(dev) * 10) / 10 : 0;
  }
  if (t && Array.isArray(t.trades)) {
    const devTrades = t.trades.filter((x) => x.userAddress === coin.creator);
    out.devTradesSeen = devTrades.length;
    out.devSold = devTrades.some((x) => x.type === "sell");
  }
  return out;
}

// Gate + 1-10 score + one-line reason. Thresholds are configurable for the shadow test.
export const DEFAULT_RULES = { minFill: 2.5, minHolders: 35, maxTopPct: 10, maxDevPct: 10, needSocial: true };
export function judge(c, s, e, rules = DEFAULT_RULES) {
  const why = [];
  if (c.fill < rules.minFill) why.push("slow fill");
  if (rules.needSocial && !(s.twitter || s.telegram || s.website)) why.push("no socials");
  if (e.devSold === true) why.push("dev sold");
  if (e.holders != null && e.holders < rules.minHolders) why.push("few holders");
  if (e.topPct != null && e.topPct > rules.maxTopPct) why.push("top wallet heavy");
  if (e.devPct != null && e.devPct > rules.maxDevPct) why.push("dev heavy");
  let score = 3;
  score += Math.min(3, (c.fill - rules.minFill) / 1.5 + 1);
  if (e.holders != null) score += e.holders >= 80 ? 2 : e.holders >= 45 ? 1 : 0;
  if (e.topPct != null && e.topPct <= 5) score += 1;
  if (e.devSold === false) score += 0.5;
  if ([s.twitter, s.telegram, s.website].filter(Boolean).length >= 2) score += 0.5;
  if (e.holders == null || e.devSold == null) score -= 1;
  score = Math.max(1, Math.min(10, Math.round(score)));
  const parts = [c.fill >= 4 ? "very fast fill" : c.fill >= rules.minFill ? "fast fill" : "slow fill"];
  parts.push(e.holders == null ? "holders unknown" : `${e.holders} holders`);
  parts.push(e.devSold == null ? "dev sells unknown" : e.devSold ? "dev sold" : e.devPct > 0 ? "dev holding" : "dev not in top holders");
  parts.push(e.topPct == null ? "spread unknown" : `top wallet ${e.topPct}%`);
  const links = [s.twitter && "X", s.telegram && "TG", s.website && "site"].filter(Boolean);
  parts.push(links.length ? links.join("+") : "no socials");
  return { pass: why.length === 0, why, score, line: parts.join(", ") };
}
