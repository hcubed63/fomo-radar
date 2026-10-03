/**
 * FOMO Radar — Core TypeScript Interfaces
 *
 * Sourced from:
 * - 03-schema.sql (tokens, snapshots, events, analyses)
 * - 06-opportunity-score.md + 07-exit-risk-score.md
 * - 09-sequence-detection.md
 * - 10-dashboard-wireframes.md + 11-component-hierarchy.md
 * - 02-architecture.md (provenance: formulaVersion, dataSources, confidenceFactors)
 *
 * All computed results MUST carry provenance.
 * Scoring functions remain pure.
 */

export type Stage =
  | 'Pre-FOMO'
  | 'Early Momentum'
  | 'FOMO Expansion'
  | 'Euphoria'
  | 'Distribution / Exit';

export interface RadarCard {
  title: string;
  current: string | number;
  change: string;
  acceleration: string;
  status: 'Building' | 'Stable' | 'Warning' | 'Distributing';
  assessment: string;
}

export interface TimelineEvent {
  time: string;
  event: string;
  type: 'build' | 'warning' | 'dist';
}

/**
 * Core analysis result returned to the UI (and later by /api/analyze).
 * This is the shape the dashboard expects.
 */
export interface AnalysisResult {
  // Identity
  symbol: string;
  name: string;
  mint: string;

  // Current market snapshot (from providers)
  price: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  volume5m?: number;
  buyRatio5m?: number;
  pumpReplyCount?: number;

  // Dual orthogonal scores (0-100)
  opportunity: number;
  exitRisk: number;

  stage: Stage;

  // Radar UI data
  radarCards: RadarCard[];
  timeline: TimelineEvent[];

  // AI-style assessment
  assessment: string;
  confidence: number;
  confidenceFactors: string[];

  // === Provenance (mandatory per spec) ===
  formulaVersion: string;      // e.g. "v1-2026-09"
  dataSources: string[];       // e.g. ["dexscreener", "rugcheck", "birdeye"]
  isDemoData: boolean;         // true when using proxies instead of real time-series

  // Optional for debug/replay
  raw?: Record<string, unknown>;
}

/**
 * Input shape for the pure scoring functions (normalized 0-1 values + optional bonuses).
 * These come from provider enrichment + velocity/acceleration calculation.
 */
export interface OpportunityInputs {
  holderAccel: number;
  volumeAccel: number;
  attentionPriceDiv: number;
  walletQuality: number;
  liqGrowth: number;
  socialVel: number;
  healthyDist: number;
  priceStructure: number;
  sequenceBonus?: number;
}

export interface ExitRiskInputs {
  whaleDist: number;
  concIncrease: number;
  liqContraction: number;
  socialSat: number;
  retailFlood: number;
  buyExhaust: number;
  smartExit: number;
  largeOutflows: number;
  extremePrice: number;
  sequencePenalty?: number;
}

/**
 * Full snapshot (core of time-series, velocity, replay, backtesting).
 * Mirrors snapshots table in 03-schema.sql (selected fields for V1).
 */
export interface Snapshot {
  capturedAt: string; // ISO

  // Market (from DexScreener etc)
  priceUsd?: number;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume5m?: number;
  volumeH1?: number;
  volumeH24?: number;

  // Velocity / acceleration (will come from real windows later)
  holderCount?: number;
  holderVelocity?: number;
  holderAcceleration?: number;

  volumeVelocity?: number;
  volumeAcceleration?: number;
  buyRatio5m?: number;

  liqVelocity?: number;
  liqAcceleration?: number;

  priceVelocity?: number;
  priceAcceleration?: number;

  // Concentration & risk
  top10Concentration?: number;
  top20Concentration?: number;
  concChange15m?: number;
  rugScore?: number;
  risks?: unknown[];

  // Social
  socialMentions15m?: number;
  socialVelocity?: number;
  uniqueAuthors15m?: number;

  // Smart / wallet quality
  smartMoneyNetFlow?: number;
  smartWalletsAccumulating?: number;
  newWallets15m?: number;
  newWalletsQualityScore?: number;

  // Whale
  whaleNetFlow?: number;
  topWalletsSellingCount?: number;

  raw?: Record<string, unknown>;
  dataSources: string[];
}

/**
 * Discrete event for timeline + sequence detection.
 * (See 09-sequence-detection.md and events table in 03-schema.sql)
 */
export interface Event {
  eventTime: string;
  eventType: string; // 'social_accel', 'holder_accel', 'smart_accum', 'whale_dist', 'volume_breakout', etc.
  value?: number;
  metadata?: Record<string, unknown>;
  source?: string;
}

/**
 * Result of a full analysis run (what /api/analyze will return in the future).
 */
export interface AnalyzeResult extends AnalysisResult {
  snapshot: Snapshot;
  events: Event[];
}

// Convenience type for the scoring engine
export type StageClassifier = (opportunity: number, exitRisk: number) => Stage;