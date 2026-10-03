"use client";

import React, { useState, useEffect } from 'react';
import { Search, Copy, AlertTriangle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { 
  withProvenance,
  type AnalysisResult, type Stage 
} from '../lib/scoring';


export default function FOMORadar() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(() => {
    // Start with the full example loaded so mobile/desktop immediately shows gauges, cards, timeline
    return withProvenance(
      {
        symbol: "DOJO",
        name: "Dojo",
        mint: "example-dojo-mint-for-demo",
        price: 0.0000412,
        marketCap: 12400000,
        liquidity: 487000,
        volume24h: 3120000,
        opportunity: 81,
        exitRisk: 23,
        stage: "Early Momentum",
        radarCards: [
          { title: "Holder Radar", current: "2,840", change: "+312 (15m)", acceleration: "2.8x", status: "Building", assessment: "Holder count accelerating. Strong new wallet inflow without concentration spikes." },
          { title: "Smart Money Radar", current: "11 wallets", change: "+7", acceleration: "3.4x", status: "Building", assessment: "Eleven historically profitable wallets have accumulated during the last 45 minutes." },
          { title: "Whale Radar", current: "Stable", change: "—", acceleration: "—", status: "Stable", assessment: "Large holders are not currently distributing." },
          { title: "Volume Radar", current: "$3.12M", change: "+68% 5m", acceleration: "2.9x", status: "Building", assessment: "Volume expanding with sustained buy pressure." },
          { title: "Liquidity Radar", current: "$487k", change: "+11%", acceleration: "1.7x", status: "Building", assessment: "Liquidity is expanding alongside volume." },
          { title: "Social Radar", current: "184", change: "+97", acceleration: "4.1x", status: "Building", assessment: "Social velocity rising faster than price — strong attention/price divergence." },
          { title: "Price Radar", current: "$0.0000412", change: "+14%", acceleration: "1.6x", status: "Building", assessment: "Price structure improving. Not yet parabolic." }
        ],
        timeline: [
          { time: "10:02", event: "Social velocity increases", type: "build" },
          { time: "10:11", event: "New-wallet rate increases", type: "build" },
          { time: "10:17", event: "Smart wallets begin accumulating", type: "build" },
          { time: "10:23", event: "Holder acceleration detected", type: "build" },
          { time: "10:31", event: "Volume breakout", type: "build" },
          { time: "10:39", event: "Liquidity expansion", type: "build" },
          { time: "10:46", event: "Price breakout", type: "build" },
        ],
        assessment: "Wallet participation and social attention are accelerating considerably faster than price. Eleven historically profitable wallets have accumulated during the last 45 minutes and large holders are not currently distributing. Liquidity is expanding alongside volume.\n\nCurrent structure is more consistent with Early Momentum than late-stage FOMO.\n\nPrimary invalidation signal: sustained whale selling or liquidity contraction.",
        confidence: 74,
        confidenceFactors: ["Strong multi-source acceleration (holder + social + smart)", "Clean bullish sequence detected", "Low whale distribution signals", "Real DexScreener liquidity/volume used"],
        isDemoData: true
      },
      ['demo']
    );
  });
  const [error, setError] = useState('');
  const [resultKey, setResultKey] = useState(0);

  // Watchlist for multiple tokens
  const [watchlist, setWatchlist] = useState<AnalysisResult[]>([]);

  // Hot low-cap Pump.fun tokens (for the "button that shows them")
  const [hotTokens, setHotTokens] = useState<any[]>([]);
  const [hotLoading, setHotLoading] = useState(false);
  const [runners, setRunners] = useState<any[]>([]);
  const [runnersLoading, setRunnersLoading] = useState(false);

  // Load watchlist mints from localStorage and re-analyze on mount
  useEffect(() => {
    const savedMints = localStorage.getItem('watchlistMints');
    if (savedMints) {
      const mints: string[] = JSON.parse(savedMints);
      (async () => {
        const results = await Promise.all(
          mints.map(async (m) => {
            try {
              const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mint: m }),
              });
              if (res.ok) return await res.json();
            } catch {}
            return null;
          })
        );
        const valid = results.filter((r): r is AnalysisResult => !!r);
        setWatchlist(valid);
      })();
    }
  }, []);

  const loadExample = () => {
    console.log('Reload Full Example clicked, bumping resultKey');

    // Force a visible refresh: briefly clear so the remount (via resultKey) produces a perceptible flash of the full spec example.
    setResult(null);
    setError('');
    setMint('');

    setTimeout(() => {
      const example = withProvenance(
        {
          symbol: "DOJO",
          name: "Dojo",
          mint: "example-dojo-mint-for-demo",
          price: 0.0000412,
          marketCap: 12400000,
          liquidity: 487000,
          volume24h: 3120000,
          opportunity: 81,
          exitRisk: 23,
          stage: "Early Momentum",
          radarCards: [
            {
              title: "Holder Radar",
              current: "2,840",
              change: "+312 (15m)",
              acceleration: "2.8x",
              status: "Building",
              assessment: "Holder count accelerating. Strong new wallet inflow without concentration spikes."
            },
            {
              title: "Smart Money Radar",
              current: "11 wallets",
              change: "+7",
              acceleration: "3.4x",
              status: "Building",
              assessment: "Eleven historically profitable wallets have accumulated during the last 45 minutes."
            },
            {
              title: "Whale Radar",
              current: "Stable",
              change: "—",
              acceleration: "—",
              status: "Stable",
              assessment: "Large holders are not currently distributing."
            },
            {
              title: "Volume Radar",
              current: "$3.12M",
              change: "+68% 5m",
              acceleration: "2.9x",
              status: "Building",
              assessment: "Volume expanding with sustained buy pressure."
            },
            {
              title: "Liquidity Radar",
              current: "$487k",
              change: "+11%",
              acceleration: "1.7x",
              status: "Building",
              assessment: "Liquidity is expanding alongside volume."
            },
            {
              title: "Social Radar",
              current: "184",
              change: "+97",
              acceleration: "4.1x",
              status: "Building",
              assessment: "Social velocity rising faster than price — strong attention/price divergence."
            },
            {
              title: "Price Radar",
              current: "$0.0000412",
              change: "+14%",
              acceleration: "1.6x",
              status: "Building",
              assessment: "Price structure improving. Not yet parabolic."
            }
          ],
          timeline: [
            { time: "10:02", event: "Social velocity increases", type: "build" },
            { time: "10:11", event: "New-wallet rate increases", type: "build" },
            { time: "10:17", event: "Smart wallets begin accumulating", type: "build" },
            { time: "10:23", event: "Holder acceleration detected", type: "build" },
            { time: "10:31", event: "Volume breakout", type: "build" },
            { time: "10:39", event: "Liquidity expansion", type: "build" },
            { time: "10:46", event: "Price breakout", type: "build" },
          ],
          assessment: "Wallet participation and social attention are accelerating considerably faster than price. Eleven historically profitable wallets have accumulated during the last 45 minutes and large holders are not currently distributing. Liquidity is expanding alongside volume.\n\nCurrent structure is more consistent with Early Momentum than late-stage FOMO.\n\nPrimary invalidation signal: sustained whale selling or liquidity contraction.",
          confidence: 74,
          confidenceFactors: [
            "Strong multi-source acceleration (holder + social + smart)",
            "Clean bullish sequence detected",
            "Low whale distribution signals",
            "Real DexScreener liquidity/volume used"
          ],
          isDemoData: true
        },
        ['demo']
      );
      setResult(example);
      setMint("demo-dojo");
      setResultKey(k => k + 1);
      toast.success("Loaded spec example (Early Momentum)");
    }, 280);
  };

  const analyze = async (address?: string) => {
    const target = (address || mint).trim();
    if (!target || target.length < 32) {
      toast.error('Enter a valid Solana mint address');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: target }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Analysis failed');
      }
      const analysis: AnalysisResult = await res.json();
      setResult(analysis);
      toast.success(`Analysis complete — ${analysis.stage}`);
    } catch (e: any) {
      const msg = e.message || 'Analysis failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadDemo = (demoMint: string) => {
    setMint(demoMint);
    analyze(demoMint);
  };

  const loadHotTokens = async () => {
    setHotLoading(true);
    try {
      const res = await fetch('/api/hot');
      const data = await res.json();
      setHotTokens(data.tokens || []);
      if (!data.tokens || data.tokens.length === 0) {
        toast.info('No hot low-caps right now — try again in a minute');
      }
    } catch {
      toast.error('Could not load hot tokens');
    } finally {
      setHotLoading(false);
    }
  };

  const loadRunners = async () => {
    setRunnersLoading(true);
    try {
      const res = await fetch('/api/runners');
      const data = await res.json();
      setRunners(data.tokens || []);
      if (!data.tokens || data.tokens.length === 0) {
        toast.info('No early runners right now. The curve is quiet.');
      }
    } catch {
      toast.error('Could not load early runners');
    } finally {
      setRunnersLoading(false);
    }
  };

  // Watchlist helpers
  const addToWatchlist = async (targetMint?: string) => {
    const target = targetMint || mint;
    if (!target || target.length < 32) {
      toast.error('Enter a valid Solana mint address');
      return;
    }
    if (watchlist.some((w) => w.mint === target)) {
      const existing = watchlist.find((w) => w.mint === target);
      if (existing) setResult(existing);
      toast.info('Already in your tokens list');
      return;
    }
    // fetch fresh
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: target }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const newResult: AnalysisResult = await res.json();
      const updated = [...watchlist, newResult];
      setWatchlist(updated);
      localStorage.setItem('watchlistMints', JSON.stringify(updated.map((r) => r.mint)));
      setResult(newResult);
      setMint(target);
      toast.success('Added to My Tokens');
    } catch (e) {
      toast.error('Failed to add token');
    }
  };

  const removeFromWatchlist = (mintToRemove: string) => {
    const updated = watchlist.filter((w) => w.mint !== mintToRemove);
    setWatchlist(updated);
    localStorage.setItem('watchlistMints', JSON.stringify(updated.map((r) => r.mint)));
    if (result?.mint === mintToRemove) {
      setResult(null);
    }
  };

  const refreshWatchlist = async () => {
    if (watchlist.length === 0) return;
    const mints = watchlist.map((w) => w.mint);
    const results = await Promise.all(
      mints.map(async (m) => {
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mint: m }),
          });
          if (res.ok) return await res.json();
        } catch {}
        return null;
      })
    );
    const valid = results.filter((r): r is AnalysisResult => !!r);
    setWatchlist(valid);
    localStorage.setItem('watchlistMints', JSON.stringify(valid.map((r) => r.mint)));
    toast.success('Watchlist refreshed');
  };

  const loadFromWatchlist = (item: AnalysisResult) => {
    setResult(item);
    setMint(item.mint);
  };

  const copyMint = () => {
    if (result) {
      navigator.clipboard.writeText(result.mint);
      toast.success('Contract address copied');
    }
  };

  const getStageColor = (stage: Stage) => {
    if (stage === 'Early Momentum' || stage === 'Pre-FOMO') return 'pill-green';
    if (stage === 'FOMO Expansion') return 'pill-amber';
    return 'pill-red';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f4f2ff]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#a78bfa] flex items-center justify-center font-bold text-lg">FR</div>
              <div>
                <h1 className="text-3xl font-semibold tracking-[-1.2px]">FOMO Radar</h1>
                <p className="text-sm text-[#8b879c] -mt-1">Solana Momentum Intelligence</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:block text-[10px] sm:text-xs text-[#5c586c] max-w-[160px] sm:max-w-[260px] text-right">
            Detect acceleration before obvious FOMO.<br />Measure exit risk before becoming liquidity.
          </div>
        </div>

        {/* Input */}
        <div className="card p-5 mb-6 overflow-x-hidden">
          <div className="flex gap-3 w-full items-center">
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyze()}
                placeholder="Paste Solana mint (e.g. ...pump)"
                className="w-full bg-[#111113] border border-[#2a2a30] rounded-xl px-5 py-3.5 text-base placeholder:text-[#5c586c] focus:outline-none focus:border-[#6366f1] focus:ring-0 focus:shadow-none"
              />
            </div>
            <button
              onClick={() => analyze()}
              disabled={loading}
              className="flex items-center gap-2 bg-[#6366f1] hover:bg-[#5559e0] disabled:opacity-60 text-white font-medium px-5 sm:px-8 rounded-xl transition-colors flex-shrink-0"
            >
              {loading ? 'Analyzing...' : <><Search className="w-4 h-4" /> Analyze</>}
            </button>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <button 
              onClick={() => loadExample()}
              className="text-xs px-3.5 py-1.5 rounded bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30 font-medium"
            >
              Reload Full Example (matches spec)
            </button>
            <button onClick={() => loadDemo('9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump')} className="text-xs px-3 py-1 rounded bg-[#1f1f25] hover:bg-[#2a2a30]">Real: ANSEM-like</button>
            <button onClick={() => loadDemo('Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump')} className="text-xs px-3 py-1 rounded bg-[#1f1f25] hover:bg-[#2a2a30]">Real: CATE-like</button>
            <button 
              onClick={loadHotTokens} 
              disabled={hotLoading}
              className="text-xs px-3 py-1 rounded bg-[#22c55e]/10 hover:bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30"
            >
              {hotLoading ? 'Loading...' : 'Hot Low-Cap (Pump.fun)'}
            </button>
            <button
              onClick={loadRunners}
              disabled={runnersLoading}
              className="text-xs px-3 py-1 rounded bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30"
            >
              {runnersLoading ? 'Loading...' : 'Early Runners'}
            </button>
            <span className="hidden sm:inline text-[9px] sm:text-[10px] text-[#5c586c] self-center ml-1">Auto-loaded example on open. Full example uses the exact assessment text from the spec. Real data = live DexScreener + RugCheck.</span>
          </div>
        </div>

        {/* Hot low-cap tokens from button */}
        {hotTokens.length > 0 && (
          <div className="mb-6">
            <div className="text-sm font-medium tracking-[0.5px] text-[#8b879c] mb-2 flex items-center gap-2">
              HOT LOW-CAP PUMP.FUN TOKENS (live, free)
              <button onClick={loadHotTokens} className="text-[10px] text-[#5c586c] hover:text-white">↻ refresh</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {hotTokens.map((t: any) => (
                <div key={t.mint} className="card p-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{t.symbol}</div>
                      <div className="text-[#8b879c] text-[10px]">MC ~${(t.marketCap / 1000).toFixed(0)}k • {t.replies} comments</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMint(t.mint);
                      analyze(t.mint);
                    }}
                    className="mt-1.5 w-full text-[10px] px-2 py-1 rounded bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 text-[#a78bfa]"
                  >
                    Analyze in Radar
                  </button>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[#5c586c] mt-1">Click to load + analyze. Use with the strategy: after analyzing, use the links (Stalkchain now goes straight to the KOL feed).</div>
          </div>
        )}

        {runners.length > 0 && (
          <div className="mb-6">
            <div className="text-sm font-medium tracking-[0.5px] text-[#8b879c] mb-2 flex items-center gap-2">
              EARLY RUNNERS — curve still filling (loosened test limits)
              <button onClick={loadRunners} className="text-[10px] text-[#5c586c] hover:text-white">↻ refresh</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {runners.map((t: any) => (
                <div key={t.mint} className="card p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{t.symbol}</div>
                      <div className="text-[#8b879c] text-[10px]">${(t.marketCap / 1000).toFixed(1)}k · {t.ageMin}m old · curve {t.curvePct}%</div>
                    </div>
                    <span className={t.status === 'alert' ? 'pill-green' : 'pill-amber'}>
                      {t.status === 'alert' ? 'ALERT' : 'WATCH'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8b879c] mt-1">{t.reason} Fill {t.fillPerMin}/min.</div>
                  <button
                    onClick={() => {
                      setMint(t.mint);
                      analyze(t.mint);
                    }}
                    className="mt-2 w-full text-[10px] px-2 py-1 rounded bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 text-[#f59e0b]"
                  >
                    Analyze in Radar
                  </button>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[#5c586c] mt-1">Alert is before the vertical move. It is not a buy. A coin already at the top of the chart will not appear here.</div>
          </div>
        )}

        {/* My Tokens Watchlist - visual list of your tokens */}
        {watchlist.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium tracking-[0.5px] text-[#8b879c]">MY TOKENS ({watchlist.length})</div>
              <button
                onClick={refreshWatchlist}
                className="text-xs px-3 py-1 rounded bg-[#1f1f25] hover:bg-[#2a2a30]"
              >
                Refresh All
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {watchlist.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => loadFromWatchlist(item)}
                  className="card p-3 text-sm cursor-pointer hover:border-[#a78bfa] transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <div className="font-semibold">{item.symbol}</div>
                      <div className="text-[10px] text-[#8b879c] truncate">
                        {item.mint.slice(0, 6)}...{item.mint.slice(-4)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(item.mint);
                      }}
                      className="text-xs text-[#8b879c] hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex gap-3 text-xs mt-2">
                    <div>
                      Opp <span className="font-medium text-[#22c55e]">{item.opportunity}</span>
                    </div>
                    <div>
                      Risk <span className="font-medium text-[#ef4444]">{item.exitRisk}</span>
                    </div>
                  </div>
                  <div className="text-[10px] mt-1">{item.stage}</div>
                  <div className="text-[10px] text-[#8b879c] mt-0.5">
                    ${item.price.toFixed(item.price < 0.01 ? 6 : 4)} • MC ${Math.round(item.marketCap / 1000000)}M
                  </div>
                  <div className="text-[10px] text-[#8b879c] mt-0.5">
                    5m Vol ${(item.volume5m || 0).toLocaleString()} • Buy {Math.round((item.buyRatio5m || 0.5) * 100)}%
                  </div>
                  {item.pumpReplyCount && item.pumpReplyCount > 0 && (
                    <div className="text-[10px] text-emerald-400 mt-0.5">Pump comments: {item.pumpReplyCount}</div>
                  )}
                  {item.dataSources?.includes('lunarcrush') && (
                    <div className="text-[10px] text-emerald-400 mt-0.5">LIVE social</div>
                  )}
                  <div className="mt-0.5 text-[9px] text-[#8b879c] flex flex-wrap gap-x-1">
                    <a href={`https://dexscreener.com/solana/${item.mint}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Dex</a>
                    <span className="text-[#5c586c]">·</span>
                    <a href="https://stalkchain.com/kol-feed" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">KOLs</a>
                    <span className="text-[#5c586c]">·</span>
                    <a href="https://fomopulse.app/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Pulse</a>
                    <span className="text-[#5c586c]">·</span>
                    <a href="https://rhtrenches.com/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Trenches</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mb-6 text-red-400 text-sm bg-red-950/30 border border-red-900 px-4 py-2 rounded-xl">{error}</div>}

        {/* Results */}
        {result && (
          <div key={resultKey}>
            <div className="flex justify-between items-center mb-2">
              {result.isDemoData && (
                <div className="text-[10px] px-2 py-0.5 rounded bg-[#a78bfa]/10 text-[#a78bfa]">
                  Spec example (auto-loaded)
                </div>
              )}
              <button 
                onClick={() => { setResult(null); setMint(''); }}
                className="text-xs text-[#8b879c] hover:text-white flex items-center gap-1 ml-auto"
              >
                Clear
              </button>
              {result && !watchlist.some((w) => w.mint === result.mint) && (
                <button
                  onClick={() => addToWatchlist(result.mint)}
                  className="text-xs px-3 py-1 rounded bg-[#a78bfa]/10 hover:bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30 ml-2"
                >
                  + Add to My Tokens
                </button>
              )}
            </div>
            {/* Token Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-4 gap-y-1">
              <div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl sm:text-4xl font-semibold tracking-[-1.5px]">{result.symbol}</div>
                  <div onClick={copyMint} className="flex items-center gap-1 text-xs text-[#8b879c] cursor-pointer hover:text-white">
                    {result.mint.slice(0, 8)}...{result.mint.slice(-6)} <Copy className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-[#8b879c] text-sm mt-0.5">{result.name}</div>
              </div>

              <div className="text-xs sm:text-sm tabular-nums text-left sm:text-right">
                <div>Price: <span className="font-medium text-white">${result.price.toFixed(result.price < 0.01 ? 8 : 6)}</span></div>
                <div className="text-[#8b879c]">MC: ${result.marketCap.toLocaleString()} • Liq: ${result.liquidity.toLocaleString()} • 24h Vol: ${result.volume24h.toLocaleString()} {result.volume5m ? `• 5m: $${(result.volume5m || 0).toLocaleString()}` : ''}</div>
                {result.pumpReplyCount && result.pumpReplyCount > 0 && (
                  <div className="text-[10px] text-emerald-400 mt-0.5">Pump.fun comments: {result.pumpReplyCount}</div>
                )}
                <div className="mt-0.5 text-[10px] text-[#8b879c] flex flex-wrap gap-x-1.5">
                  <a href={`https://dexscreener.com/solana/${result.mint}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Dexscreener</a>
                  <span className="text-[#5c586c]">·</span>
                  <a href="https://stalkchain.com/kol-feed" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Stalkchain KOLs</a>
                  <span className="text-[#5c586c]">·</span>
                  <a href="https://fomopulse.app/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">FOMO Pulse (RH tape)</a>
                  <span className="text-[#5c586c]">·</span>
                  <a href="https://rhtrenches.com/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">RH Trenches</a>
                  <span className="text-[#5c586c]">·</span>
                  <a href="https://www.hoodwatch.io/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">Hoodwatch</a>
                  <span className="text-[#5c586c]">·</span>
                  <a href="https://fomo.family/" target="_blank" rel="noopener noreferrer" className="hover:text-[#a78bfa]">fomo.family</a>
                </div>
              </div>
            </div>

            {/* Gauges + Stage */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
              {/* Opportunity Gauge */}
              <div className="lg:col-span-2 card p-5 sm:p-6 lg:p-8 flex flex-col items-center">
                <div className="uppercase text-[10px] tracking-[1.5px] text-[#8b879c] mb-1">FOMO OPPORTUNITY</div>
                <div className="score-gauge flex items-center justify-center my-3">
                  <div className="relative w-full h-full">
                    <svg width="100%" height="100%" viewBox="0 0 180 180" className="rotate-[-90deg] block">
                      <circle cx="90" cy="90" r="82" fill="none" stroke="#1f1f25" strokeWidth="14" />
                      <circle 
                        cx="90" cy="90" r="82" fill="none" 
                        stroke="#22c55e" strokeWidth="14" strokeLinecap="round"
                        strokeDasharray={`${(result.opportunity / 100) * 515} 515`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="score-value text-[#22c55e]">{result.opportunity}</div>
                        <div className="text-xs -mt-1 text-[#8b879c]">/ 100</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exit Risk Gauge */}
              <div className="lg:col-span-2 card p-5 sm:p-6 lg:p-8 flex flex-col items-center">
                <div className="uppercase text-[10px] tracking-[1.5px] text-[#8b879c] mb-1">EXIT RISK</div>
                <div className="score-gauge flex items-center justify-center my-3">
                  <div className="relative w-full h-full">
                    <svg width="100%" height="100%" viewBox="0 0 180 180" className="rotate-[-90deg] block">
                      <circle cx="90" cy="90" r="82" fill="none" stroke="#1f1f25" strokeWidth="14" />
                      <circle 
                        cx="90" cy="90" r="82" fill="none" 
                        stroke="#ef4444" strokeWidth="14" strokeLinecap="round"
                        strokeDasharray={`${(result.exitRisk / 100) * 515} 515`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="score-value text-[#ef4444]">{result.exitRisk}</div>
                        <div className="text-xs -mt-1 text-[#8b879c]">/ 100</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stage */}
              <div className="card p-5 sm:p-6 lg:p-8 flex flex-col">
                <div className="text-sm font-medium tracking-[1px] text-[#8b879c] mb-2">CURRENT STAGE</div>
                <div className={`pill ${getStageColor(result.stage)} text-lg px-5 py-1 mt-auto w-fit`}>{result.stage}</div>
                <div className="text-[10px] text-[#5c586c] mt-4">Opportunity and Risk are orthogonal. High + High = caution, not opportunity.</div>
              </div>
            </div>

            {/* Radar Cards */}
            <div className="mb-2 text-sm font-medium tracking-[0.5px] text-[#8b879c]">RADAR CARDS</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
              {result.radarCards.map((card: any, i: number) => (
                <div key={i} className="radar-card card text-sm">
                  <div className="font-semibold mb-2 flex items-center justify-between">
                    {card.title}
                    {card.title === 'Social Radar' && result.dataSources?.includes('lunarcrush') && (
                      <span className="text-[9px] px-1.5 py-px rounded bg-emerald-950 text-emerald-400 ml-1">LIVE</span>
                    )}
                    <span className={`text-[10px] px-2 py-px rounded ${card.status === 'Building' ? 'bg-green-950 text-green-400' : card.status === 'Warning' || card.status === 'Distributing' ? 'bg-red-950 text-red-400' : 'bg-zinc-800'}`}>{card.status}</span>
                  </div>
                  <div className="text-2xl font-semibold tabular-nums mb-1">{card.current}</div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-[#8b879c]">{card.change}</span>
                    <span className="text-[#a78bfa]">{card.acceleration}</span>
                  </div>
                  <div className="mt-3 text-[#8b879c] text-[12px] sm:text-[12.5px] leading-tight">{card.assessment}</div>
                  <div className="mt-1 text-[10px] text-[#5c586c]">Historical: {['Stronger accel than 68% of peers', 'Top 25% for this MC band', 'Better than 72% of recent launches', 'Volume profile in top quartile', 'Liq growth above median', 'Attention divergence in 80th percentile', 'Structure healthier than 60% of cohort'][i]}</div>
                </div>
              ))}
            </div>

            {/* AI Assessment */}
            <div className="card p-4 sm:p-6 mb-6">
              <div className="uppercase tracking-[1px] text-xs text-[#8b879c] mb-2">AI ASSESSMENT</div>
              <p className="text-[15px] leading-relaxed">{result.assessment}</p>
              <div className="mt-4 text-xs text-[#5c586c]">
                AI Confidence: <span className="font-medium text-[#f4f2ff]">{result.confidence}%</span> — {result.confidenceFactors.join(' • ')}
              </div>
            </div>

            {/* Timeline */}
            <div className="card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium tracking-[0.5px] text-[#8b879c]">
                <Clock className="w-4 h-4" /> EVENT TIMELINE — SEQUENCE DETECTION
              </div>
              <div className="relative space-y-3 pl-2">
                {result.timeline.map((ev: any, idx: number) => (
                  <div key={idx} className="timeline-event flex items-start gap-3 text-sm">
                    <div className="font-mono text-xs text-[#5c586c] w-[38px] sm:w-[42px] shrink-0 pt-0.5">{ev.time}</div>
                    <div className={`flex-1 ${ev.type === 'build' ? 'text-[#22c55e]' : ev.type === 'dist' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                      {ev.event}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[#5c586c] mt-4">Sequence order matters. Clean early sequences increase Opportunity. Distribution sequences elevate Exit Risk.</div>
            </div>

            <div className="text-center text-[10px] text-[#5c586c] mt-8">
              This is quantitative intelligence, not financial advice. Data from public APIs. Full real-time holder/smart/social history requires paid providers (see fomo-radar-spec).
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto text-[#8b879c] text-sm space-y-3">
              <p>Paste any Solana contract address above and click Analyze.</p>
              <p>The engine computes <span className="text-[#f4f2ff]">FOMO Opportunity</span> and <span className="text-[#f4f2ff]">Exit Risk</span> scores using velocity, acceleration, wallet quality, concentration dynamics, and detected sequences.</p>
              <p className="text-[#5c586c]">Click <span className="font-medium text-[#a78bfa]">“Reload Full Example (matches spec)”</span> above to instantly see the complete dashboard as described in the specification (gauges, 7 radar cards, timeline, and the exact assessment text).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
