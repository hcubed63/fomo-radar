import { NextResponse } from 'next/server';

interface PumpCoin {
  mint: string;
  symbol: string;
  name: string;
  usd_market_cap?: number;
  market_cap?: number;
  reply_count?: number;
  image_uri?: string;
  last_trade_timestamp?: number;
}

export async function GET() {
  try {
    // Fetch recent coins from public Pump.fun API (free, no key)
    // Sort by recent trades, then we'll filter for low-cap + activity
    const res = await fetch(
      'https://frontend-api-v3.pump.fun/coins?offset=0&limit=100&sort=last_trade_timestamp&order=DESC&includeNsfw=false',
      { 
        next: { revalidate: 45 }, // cache 45s for freshness without hammering
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!res.ok) {
      return NextResponse.json({ tokens: [] });
    }

    const coins: PumpCoin[] = await res.json();

    // Filter for "hot low-cap": under ~$150k MC, has some attention (replies or volume proxy)
    // Sort by reply_count as proxy for social heat on Pump, then recent
    const hot = coins
      .filter((c) => {
        const mc = c.usd_market_cap || c.market_cap || 0;
        return mc > 1000 && mc < 150000 && (c.reply_count || 0) > 0;
      })
      .sort((a, b) => (b.reply_count || 0) - (a.reply_count || 0))
      .slice(0, 8)
      .map((c) => ({
        mint: c.mint,
        symbol: c.symbol || c.name?.slice(0, 10) || '???',
        name: c.name || c.symbol || 'Unknown',
        marketCap: Math.round((c.usd_market_cap || c.market_cap || 0) / 1000) * 1000,
        replies: c.reply_count || 0,
        image: c.image_uri || null,
      }));

    return NextResponse.json({ tokens: hot });
  } catch (e) {
    console.error('Hot tokens fetch failed', e);
    return NextResponse.json({ tokens: [] });
  }
}
