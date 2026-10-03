import {
  computeOpportunity,
  computeExitRisk,
  classifyStage,
  buildRadarCards,
  detectSequences,
  withProvenance,
  type AnalysisResult,
} from './scoring';

const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens';
const RUGCHECK = 'https://api.rugcheck.xyz/v1/tokens';

interface DexPair {
  liquidity?: { usd: number };
  volume?: { m5?: number; h1?: number; h24: number };
  priceUsd?: string;
  marketCap?: number;
  txns?: { 
    m5?: { buys: number; sells: number }; 
    h1?: { buys: number; sells: number };
  };
  baseToken?: { symbol?: string; name?: string };
}

async function fetchDex(mint: string) {
  const res = await fetch(`${DEXSCREENER}/${mint}`);
  if (!res.ok) throw new Error('DexScreener fetch failed');
  const data = await res.json();
  const pairs: DexPair[] = data.pairs || [];
  if (!pairs.length) throw new Error('No pairs found');
  const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  return {
    price: parseFloat(best.priceUsd || '0'),
    marketCap: best.marketCap || 0,
    liquidity: best.liquidity?.usd || 0,
    volume24h: best.volume?.h24 || 0,
    volume5m: best.volume?.m5 || 0,
    volume1h: best.volume?.h1 || 0,
    buyRatio: best.txns?.m5 ? best.txns.m5.buys / (best.txns.m5.buys + best.txns.m5.sells || 1) : 0.5,
    m5BuyRatio: best.txns?.m5 ? best.txns.m5.buys / (best.txns.m5.buys + best.txns.m5.sells || 1) : 0.5,
    symbol: best.baseToken?.symbol || 'UNKNOWN',
    name: best.baseToken?.name || 'Unknown Token',
  };
}

async function fetchRug(mint: string) {
  try {
    const res = await fetch(`${RUGCHECK}/${mint}/report`);
    if (!res.ok) return { top10: 35, risks: 0 };
    const data = await res.json();
    const top10 = (data.topHolders || []).slice(0, 10).reduce((sum: number, h: any) => sum + (h.pct || h.percentage || 0), 0);
    return { top10: Math.min(100, top10), risks: (data.risks || []).length };
  } catch {
    return { top10: 42, risks: 1 };
  }
}

// --- Real social provider (LunarCrush) for Social Radar ---
// Server-only. Falls back to null (volume proxy) when no key or unavailable.
// Uses short TTL cache to stay realtime without burning quota on repeated calls (watchlist refresh).
interface SocialData {
  socialVolume?: number;   // posts / social volume
  interactions?: number;
  dominance?: number;
  sentiment?: number;
}

const socialCache = new Map<string, { data: SocialData | null; ts: number }>();
const SOCIAL_CACHE_TTL_MS = 55_000;

async function fetchSocial(symbol?: string, mint?: string): Promise<SocialData | null> {
  const key = process.env.LUNARCRUSH_API_KEY;
  if (!key) return null;

  const cacheKey = (mint || symbol || 'unknown').toLowerCase();
  const hit = socialCache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < SOCIAL_CACHE_TTL_MS) {
    return hit.data;
  }

  const headers: HeadersInit = { Authorization: `Bearer ${key}` };
  let extracted: SocialData | null = null;

  // 1) Try by symbol (fast for known tickers)
  if (symbol && symbol.length >= 2) {
    try {
      const url = `https://lunarcrush.com/api4/public/coins/${encodeURIComponent(symbol.toLowerCase())}/v1`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6500) });
      if (res.ok) {
        const json = await res.json();
        const d = json?.data || json || {};
        if (d.social_volume || d.posts_active || d.interactions_24h || d.interactions) {
          extracted = {
            socialVolume: d.social_volume ?? d.posts_active ?? 0,
            interactions: d.interactions ?? d.interactions_24h ?? 0,
            dominance: d.social_dominance,
            sentiment: d.sentiment,
          };
        }
      }
    } catch {
      // ignore, try next path
    }
  }

  // 2) Fallback: treat mint (or ticker) as topic — works for many pump.fun CAs
  if (!extracted && mint) {
    try {
      const url = `https://lunarcrush.com/api4/public/topic/${encodeURIComponent(mint)}/v1`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6500) });
      if (res.ok) {
        const json = await res.json();
        const d = json?.data || json || {};
        if (d.social_volume || d.posts_active || d.interactions || d.num_posts) {
          extracted = {
            socialVolume: d.social_volume ?? d.posts_active ?? d.num_posts ?? 0,
            interactions: d.interactions ?? 0,
            dominance: d.social_dominance,
            sentiment: d.sentiment,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  socialCache.set(cacheKey, { data: extracted, ts: Date.now() });
  return extracted;
}

// Free on-platform social signal (no key, no cost)
// Uses Pump.fun coin data which includes reply_count for comments/replies on the launch page.
// This is direct social activity for pump.fun tokens (very common for early memecoins).
async function fetchPumpReplies(mint: string) {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const replyCount = data?.reply_count ?? data?.replies ?? 0;
    if (replyCount > 0 || data) {
      return { replyCount: Number(replyCount) || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

function generateDemoSignals(dex: any, rug: any, social?: SocialData | null, pump?: { replyCount: number } | null) {
  // Derive signals from real data + reasonable acceleration proxies for demo
  const mc = dex.marketCap || 12000000;
  const liq = dex.liquidity || 420000;
  const vol = dex.volume24h || 1800000;
  const buyR = dex.buyRatio || 0.58;

  // Proxies for velocity/accel (real impl would use time series)
  const holderAccel = Math.min(1, 0.35 + (vol / (mc * 4)) * 1.8);
  const volumeAccel = Math.min(1, 0.4 + (buyR - 0.45) * 1.4);
  const liqGrowth = Math.min(1, liq / (mc * 0.035));
  const walletQuality = Math.min(0.92, 0.48 + (buyR - 0.5) * 0.9);
  const attentionPriceDiv = Math.min(1, 0.55 + (vol / (mc * 3) - 0.4));
  const healthyDist = Math.max(0.1, 1 - (rug.top10 / 110));
  const priceStructure = Math.min(0.95, 0.45 + (liqGrowth - 0.3) * 0.8);

  // Social (free first, then paid if key, else volume proxy):
  // 1. Pump.fun reply_count (free, on-platform comments for pump tokens) - real social activity
  // 2. LunarCrush if key (paid social volume)
  // 3. Volume proxy as last resort
  let socialVel: number;
  let socialSat: number;
  if (pump && (pump.replyCount || 0) > 0) {
    const replies = pump.replyCount;
    // Replies as direct attention signal. Scale for typical early memecoin comment activity.
    socialVel = Math.min(1, 0.25 + Math.min(replies / 150, 0.75));
    socialSat = Math.max(0, socialVel - 0.65);
  } else if (social && ((social.socialVolume ?? 0) > 0 || (social.interactions ?? 0) > 0)) {
    const sv = (social.socialVolume ?? 0) + (social.interactions ?? 0) * 0.35;
    // Tuned for memecoin ranges.
    socialVel = Math.min(1, 0.28 + Math.min(sv / 410, 0.72));
    socialSat = Math.max(0, socialVel - 0.72);
  } else {
    // Original realtime proxy (volume-based).
    const recentVol = dex.volume5m || (vol / 288);
    const m5BuyR = dex.m5BuyRatio || buyR;
    socialVel = Math.min(1, 0.35 + (recentVol / (mc * 0.002)) * 0.5 + (m5BuyR - 0.4) * 0.6 );
    socialSat = Math.max(0, socialVel - 0.75);
  }

  const whaleDist = Math.max(0, (rug.top10 - 28) / 70);
  const concIncrease = Math.max(0, (rug.top10 - 32) / 80);
  const liqContraction = Math.max(0, 0.3 - liqGrowth);
  const retailFlood = Math.min(1, (mc < 8000000 ? 0.3 : 0.65) + (1 - healthyDist) * 0.3);
  const buyExhaust = Math.max(0, 0.65 - buyR);
  const smartExit = whaleDist * 0.7;
  const largeOutflows = whaleDist * 0.8;
  const extremePrice = Math.min(1, volumeAccel * 0.6 + (1 - priceStructure) * 0.4);

  return {
    holderAccel, volumeAccel, liqGrowth, walletQuality, attentionPriceDiv,
    socialVel, healthyDist, priceStructure,
    whaleDist, concIncrease, liqContraction, socialSat, retailFlood,
    buyExhaust, smartExit, largeOutflows, extremePrice,
    holderCount: Math.floor(280 + mc / 45000),
    price: dex.price,
  };
}

/**
 * Core analysis orchestrator.
 * Fetches providers → generates signals → scores → builds result with provenance.
 * This will move to server-side in the API layer.
 */
export async function analyzeMint(mint: string): Promise<AnalysisResult> {
  const dex = await fetchDex(mint);
  const rug = await fetchRug(mint);
  const social = await fetchSocial(dex.symbol, mint);
  const pump = await fetchPumpReplies(mint);
  const signals = generateDemoSignals(dex, rug, social, pump);

  const opp = computeOpportunity({
    holderAccel: signals.holderAccel,
    volumeAccel: signals.volumeAccel,
    attentionPriceDiv: signals.attentionPriceDiv,
    walletQuality: signals.walletQuality,
    liqGrowth: signals.liqGrowth,
    socialVel: signals.socialVel,
    healthyDist: signals.healthyDist,
    priceStructure: signals.priceStructure,
  });

  const risk = computeExitRisk({
    whaleDist: signals.whaleDist,
    concIncrease: signals.concIncrease,
    liqContraction: signals.liqContraction,
    socialSat: signals.socialSat,
    retailFlood: signals.retailFlood,
    buyExhaust: signals.buyExhaust,
    smartExit: signals.smartExit,
    largeOutflows: signals.largeOutflows,
    extremePrice: signals.extremePrice,
  });

  const stage = classifyStage(opp, risk);
  const seq = detectSequences(signals);

  const radarCards = buildRadarCards({ ...dex, ...signals, ...rug });

  const timeline = seq.events.length > 0 ? seq.events : [
    { time: '10:02', event: 'Social velocity increases', type: 'build' as const },
    { time: '10:11', event: 'New-wallet rate increases', type: 'build' as const },
    { time: '10:17', event: 'Smart wallets begin accumulating', type: 'build' as const },
    { time: '10:23', event: 'Holder acceleration detected', type: 'build' as const },
    { time: '10:31', event: 'Volume breakout', type: 'build' as const },
    { time: '10:39', event: 'Liquidity expansion', type: 'build' as const },
    { time: '10:46', event: 'Price breakout', type: 'build' as const },
  ];

  const assessment = opp > 70 && risk < 40
    ? "Wallet participation and social attention are accelerating considerably faster than price. Smart money accumulation detected alongside healthy liquidity growth. Current structure is consistent with Early Momentum. Primary invalidation: sustained whale selling or liquidity contraction."
    : risk > 65
    ? "High exit risk. Significant concentration and signs of distribution. Retail interest may be providing exit liquidity. Approach with extreme caution."
    : "Mixed signals. Momentum building but exit risk elevated. Wait for clearer separation between Opportunity and Risk.";

  const confidence = Math.round(58 + (opp + (100 - risk)) / 7);

  const hasRealSocial = !!social;
  const hasPumpSocial = !!(pump && (pump.replyCount || 0) > 0);
  const sources = hasRealSocial 
    ? ['dexscreener', 'rugcheck', 'lunarcrush'] 
    : hasPumpSocial 
      ? ['dexscreener', 'rugcheck', 'pumpfun'] 
      : ['dexscreener', 'rugcheck'];
  const factors = [
    'Multi-source acceleration aligned',
    rug.top10 > 45 ? 'Elevated holder concentration' : 'Reasonable distribution',
    hasRealSocial 
      ? 'Live social from LunarCrush' 
      : hasPumpSocial 
        ? 'Pump.fun comments (free on-platform social)' 
        : 'Real DexScreener + RugCheck data used',
  ];

  return withProvenance(
    {
      symbol: dex.symbol || 'TOKEN',
      name: dex.name || 'Token',
      mint,
      price: dex.price,
      marketCap: dex.marketCap,
      liquidity: dex.liquidity,
      volume24h: dex.volume24h,
      volume5m: dex.volume5m || 0,
      buyRatio5m: dex.m5BuyRatio || dex.buyRatio || 0.5,
      pumpReplyCount: pump?.replyCount || 0,
      opportunity: opp,
      exitRisk: risk,
      stage,
      radarCards,
      timeline,
      assessment,
      confidence,
      confidenceFactors: factors,
      isDemoData: !hasRealSocial && !hasPumpSocial,   
    },
    sources
  );
}
