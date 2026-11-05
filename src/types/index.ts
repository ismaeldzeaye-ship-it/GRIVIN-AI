export type Timeframe = '10m' | '45m' | '1H' | 'H1' | 'M1' | 'M5' | 'M15' | 'H4' | 'D1';

export type SignalDirection = 'BUY' | 'SELL' | 'WAIT' | 'NO SIGNAL';

export type SignalStatus = 
  | 'VALID' 
  | 'WAIT' 
  | 'INVALID' 
  | 'TRIGGERED' 
  | 'TP_HIT' 
  | 'SL_HIT'
  | 'NO_SIGNAL';

export type StrategyType = 
  | 'STRATEGY_1A' // Strategy 1A: POC Bounce
  | 'STRATEGY_1B' // Strategy 1B: Value Area Reversal
  | 'STRATEGY_1C' // Strategy 1C: Breakout Continuation
  | 'STRATEGY_2'  // Strategy 2: Market Structure Essentials
  | 'STRATEGY_3'  // Strategy 3: Advanced Market Structure & SMC
  | 'POC_BOUNCE' 
  | 'VALUE_AREA_REVERSAL' 
  | 'CONFIRMED_BREAKOUT';

export type SetupGrade = 'A' | 'B' | 'C' | 'A+';

export type MarketState = 'Trending Bullish' | 'Trending Bearish' | 'Ranging';

export type MarketSessionType = 
  | 'ASIAN' 
  | 'LONDON' 
  | 'NEW_YORK' 
  | 'LONDON_NY_OVERLAP' 
  | 'LONDON_KZ'
  | 'LONDON_MID'
  | 'NY_AFTERNOON'
  | 'LATE_CLOSE'
  | 'CLOSED';

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // tick volume or true volume
  buyVolume?: number;
  sellVolume?: number;
  isForming?: boolean; // true if candle is currently forming/open
  isOffHours?: boolean; // true if Binance SPY/QQQ candle is outside 09:30-16:00 New York regular hours
  sourceCandleTimes?: number[]; // Timestamps of underlying source candles (for M10 and M45)
  sourceDescription?: string; // e.g. "Synthesized from 2x closed M5 candles [08:00, 08:05 UTC]"
}

export type VolumeType = 'NONE' | 'APPROXIMATE_TICK' | 'REAL_VOLUME';

export interface Tick {
  time: number;
  symbol: string;
  bid: number;
  ask: number;
  volume: number;
}

export type SymbolLiveStatus = 'ACTIVE' | 'MARKET CLOSED' | 'UNAVAILABLE' | 'UNVERIFIED' | 'OFF-HOURS';

export type DataSourceOrigin = 'LIVE_PROVEN' | 'SIMULATED' | 'CACHED' | 'UNVERIFIED';

export interface SymbolDataProof {
  symbol: string;
  underlyingSymbol: string;
  provider: 'DERIV' | 'BINANCE' | 'SIMULATION';
  lastTickPrice: number | null;
  lastTickTimeUtc: string | null;
  lastTickEpoch: number | null;
  ageSeconds: number | null;
  ticksReceivedSinceLoad: number;
  lastCandleTimePerTimeframe: Record<string, string | null | undefined>;
  dataSourceType: DataSourceOrigin;
}

export interface SymbolInfo {
  symbol: string;
  brokerSymbol?: string;
  derivSymbol?: string;
  exactBrokerSymbol?: string; // Exact Deriv symbol (e.g. "frxEURUSD") or "unavailable"
  name: string;
  category: 'FOREX' | 'METALS' | 'INDICES' | 'CRYPTO';
  digits: number;
  pipSize: number;
  volumeType: VolumeType;
  provider: 'DERIV' | 'BINANCE' | 'SIMULATION';
  pipValuePerStandardLot?: number; // fetched from symbol specs
  lotSize?: number; // contract size
  minLot?: number;
  maxLot?: number;
  lotStep?: number;
  currentBid: number;
  currentAsk: number;
  spreadPips: number;
  dayChangePercent: number;
  dayHigh: number;
  dayLow: number;
  isAvailable: boolean; // marked unavailable if not in active_symbols
  unavailabilityReason?: string;
  exchangeIsOpen?: boolean; // Deriv exchange_is_open
  isTradingSuspended?: boolean; // Deriv is_trading_suspended
  isMarketOpen: boolean; // Evaluated market open status (crypto 24/7, forex/indices closed on weekends)
  marketType?: BinanceMarketType; // 'SPOT' or 'FUTURES'
  status: SymbolLiveStatus; // Live status: ACTIVE, MARKET CLOSED, UNAVAILABLE, UNVERIFIED
  dataOrigin: DataSourceOrigin; // LIVE_PROVEN, SIMULATED, CACHED, UNVERIFIED
  isPerpetual?: boolean; // True for Binance USDT-M perpetual contracts (SPYUSDT, QQQUSDT)
  perpetualLabel?: string; // e.g. "USDT-M Perpetual Contract (Not index or CME futures)"
}

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  percentage: number;
}

export type VolumeProfileType = 'REAL_VOLUME' | 'TIME_AT_PRICE';

export interface VolumeProfile {
  poc: number; // Point of Control
  vah: number; // Value Area High (70%)
  val: number; // Value Area Low (70%)
  totalVolume: number; // Genuine trade volume or total weight
  valueAreaVolume: number;
  levels: VolumeProfileLevel[];
  session: MarketSessionType;
  stepSize: number;
  profileType?: VolumeProfileType;
  label?: string; // "REAL (Binance trade execution)" or "APPROXIMATE (time-at-price, no volume)"
  isApproximateTickVolume: boolean;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  confirmed: boolean;
}

export interface MarketStructureEvent {
  id: string;
  type: 'BOS' | 'CHOCH';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  brokenLevel: number;
  time: number;
  candleIndex: number;
  timeframe: Timeframe;
  significance: 'MINOR' | 'MAJOR';
}

export interface SMCZone {
  id: string;
  type: 'ORDER_BLOCK' | 'FVG' | 'LIQUIDITY_POOL';
  direction: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  timeframe: Timeframe;
  candleIndex: number;
  time: number;
  mitigationStatus: 'FRESH' | 'TESTED' | 'MITIGATED';
}

export interface InstitutionalChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  requiredForGradeA: boolean;
  detail: string;
}

export interface SignalAuditLevels {
  poc: number;
  vah: number;
  val: number;
  swingHigh?: number;
  swingLow?: number;
  bosCandleTime?: number;
  bosPrice?: number;
  profileType: VolumeProfileType;
  profileLabel: string;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  substituteNote?: string; // e.g. "Substituted to US500 (OTC_SPC)"
  direction: SignalDirection;
  status: SignalStatus;
  timeframe: Timeframe;
  confirmationTimeframe?: Timeframe;
  strategy: StrategyType;
  strategyName: string;
  marketState?: MarketState; // Trending Bullish / Trending Bearish / Ranging
  strategySelected?: string; // 1A / 1B / 1C / 2 / 3
  strategyReason?: string;
  entryZone: {
    min: number;
    max: number;
  };
  entryPrice: number;
  stopLoss: number;
  stopLossReason?: string; // Structural reason verified >= 1x ATR(14)
  tp: number; // Default single take-profit at 2R
  tp1?: number; // 2R target
  tp2?: number; // Structure / liquidity target
  riskPips: number;
  rewardPips: number;
  rMultiple: 2.0; // 2R default target
  rDistance?: number; // Absolute distance |Entry - SL|
  tp1Distance?: number; // Absolute distance |Entry - TP1| = 2 * R
  rDistanceFormatted?: string; // Formatted distance with unit (e.g. "12.50 pts (125 pips)")
  tp1DistanceFormatted?: string; // Formatted TP1 distance with unit (e.g. "25.00 pts (250 pips)")
  stopDistanceFormatted?: string; // Stop distance in pips and points
  stopDistancePoints?: number;
  tp1DistancePoints?: number;
  tp1OverRRatio?: string; // "TP1 / R = 2.00 OK" computed from displayed numbers
  validUntilTimeUtc?: string; // e.g. "14:30:00 UTC"
  validUntilEpoch?: number; // Expiry epoch in ms
  signalCandleTime?: number; // Timestamp in seconds of the triggering closed candle
  atr14AtEntry?: number; // Actual ATR14 value on entry timeframe
  isMathCheckPassed?: boolean; // True if TP1/R == 2.00, stop side valid, stop >= 1x ATR14
  newsProtectionNotice?: string; // Always "News protection NOT VERIFIED"
  sessionLabel?: string; // Descriptive session label e.g. "Asian Session (00:00-07:00 UTC)"
  isQuietHours?: boolean; // True if during Asian (00-07) or Late (21-24)
  riskReward?: string; // e.g. "1:2.0"
  estimatedHoldTime?: string; // Minimum 3-4 minutes, typically 10m-several hours
  grade: SetupGrade; // A / B / C / A+ setup grade
  confidence?: 'Low' | 'Medium' | 'High' | 'A+ with confluence';
  invalidationCondition?: string; // Invalidate if price moves >0.25R away or closes beyond structural extreme
  failedCondition?: string; // Which condition failed if NO SIGNAL
  session: MarketSessionType;
  sessionTimeUtc?: string; // e.g. "London Killzone 08:30 UTC"
  killZone?: string; // e.g. "LONDON_OPEN_KZ", "NY_OPEN_KZ"
  h1Bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reason: string;
  timestamp: number;
  checklist: InstitutionalChecklistItem[];
  auditLevels?: SignalAuditLevels;
  aiAnalysis?: string;
  marketType?: BinanceMarketType; // 'SPOT' or 'FUTURES'
  exactSymbol?: string; // e.g. "BTCUSDT"
  volumeType?: VolumeType;
  isUnverifiedOrSimulated?: boolean;
  dataOrigin?: DataSourceOrigin;
}

export interface ForwardTestTrade {
  id: string;
  signalId: string;
  symbol: string;
  provider: 'DERIV' | 'BINANCE' | 'SIMULATION';
  marketType?: BinanceMarketType;
  setup: StrategyType;
  setupName: string;
  session: MarketSessionType;
  killZone: string;
  grade: SetupGrade;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rMultiple: number; // 2.0
  entryTime: number; // Unix seconds
  status: 'OPEN' | 'RESOLVED';
  resolution?: 'WIN' | 'LOSS';
  exitPrice?: number;
  resolvedTime?: number;
  rOutcome?: number; // +2.0 or -1.0
  pnlPips?: number;
  durationBars?: number;
  bothTouchedInSameBar?: boolean;
}

export interface ForwardTestStats {
  totalSignals: number;
  resolvedSignals: number;
  openSignals: number;
  wins: number;
  losses: number;
  winRate: number; // 0 - 100%
  avgR: number; // e.g. +0.85R
  maxDrawdownR: number; // e.g. 3.0R
  isSampleTooSmall: boolean; // true if resolvedSignals < 30
}

export type NotificationType = 
  | 'BUY_SETUP'
  | 'SELL_SETUP'
  | 'STATUS_WAIT'
  | 'STATUS_INVALID'
  | 'PRICE_LEVEL'
  | 'PRICE_APPROACH_POC'
  | 'PRICE_APPROACH_VAH_VAL'
  | 'CONFIRMED_BOS'
  | 'CONFIRMED_CHOCH'
  | 'CONFIRMED_BREAKOUT'
  | 'CONFIRMED_VA_REVERSAL'
  | 'CONFIRMED_POC_BOUNCE'
  | 'CONNECTION_INTERRUPTED'
  | 'DATA_FEED_STALE';

export interface AlertNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  instrument: string;
  direction?: SignalDirection;
  timeframe?: string;
  strategyName?: string;
  entryZone?: string;
  stopLoss?: number;
  takeProfit?: number;
  grade?: SetupGrade;
  reason: string;
  timestamp: number;
  read: boolean;
  soundPlayed?: boolean;
}

export interface NotificationControls {
  enabled: boolean;
  selectedInstruments: string[];
  selectedNotificationTypes: NotificationType[];
  selectedTimeframes: Timeframe[];
  minimumGrade: SetupGrade; // 'A', 'B', or 'C'
  cooldownMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "23:00"
  quietHoursEnd: string;   // "06:00"
  soundAlertsEnabled: boolean;
  vibrateEnabled: boolean;
}

export interface DerivSymbolDebugInfo {
  lastRequestSent: string;
  lastResponseType: 'candles' | 'error' | 'empty' | 'pending';
  candleCount: number;
  lastCandleTime: string | null;
  errorMessage: string | null;
}

export interface DerivConnectionState {
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  latencyMs: number | null;
  lastHeartbeat: number | null;
  isStale: boolean;
  lastMessageTime: number | null;
  activeSymbolsCount: number;
  activeSymbolsLoading: boolean;
  activeSymbolsError: string | null;
  symbolDebugInfo: Record<string, DerivSymbolDebugInfo>;
  endpoint: string;
  errorMessage: string | null;
  simulationMode: boolean;
}

export type BinanceMarketType = 'SPOT' | 'FUTURES';

export interface BinanceConnectionState {
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  latencyMs: number | null;
  lastUpdate: number | null;
  isStale: boolean;
  marketType: BinanceMarketType;
  activeSymbols: string[];
  restEndpoint: string;
  wsEndpoint: string;
  errorMessage: string | null;
  isBlockedRegion: boolean;
  rateLimitWeight1m?: number;
  lastReconnectTime?: number;
}

export interface RateLimitState {
  serviceName: string | null; // e.g. "Deriv WebSocket API", "Gemini AI"
  fullMessage?: string | null;
  message?: string | null;
  isRateLimited: boolean;
  status: 'OK' | 'Rate-limited, retrying';
  lastEventTime: number | null;
}

export interface MarketDataConfig {
  deriv: DerivConnectionState;
  binance: BinanceConnectionState;
  simulationMode: boolean;
  connected: boolean; // True if Deriv or Binance is streaming
  latencyMs: number | null;
  isStale: boolean;
  dataProofMap?: Record<string, SymbolDataProof>;
  rateLimitState?: RateLimitState;
  allowQuietHoursSignals?: boolean; // ON by default: allows signals in Asian and Late sessions
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  strategy: StrategyType;
  session: MarketSessionType;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  rOutcome: number; // e.g. +2.0R, -1.0R
  pnlPips: number;
  status: 'WIN' | 'LOSS' | 'BE';
}

export interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number;
  averageR: number;
  profitFactor: number;
  maxDrawdownR: number;
  equityCurve: { tradeIndex: number; equityR: number; timestamp: number }[];
  breakdownByStrategy: Record<StrategyType, { winRate: number; avgR: number; totalTrades: number }>;
  breakdownBySession: Record<MarketSessionType, { winRate: number; avgR: number; totalTrades: number }>;
  breakdownBySymbol: Record<string, { winRate: number; avgR: number; totalTrades: number }>;
}

export interface JournalEntry {
  id: string;
  signalId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  strategy: StrategyType;
  session: MarketSessionType;
  entryTime: number;
  exitTime?: number;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  rOutcome?: number;
  lotSize: number;
  pnlCash?: number;
  status: 'OPEN' | 'CLOSED';
  notes: string;
  tags: string[];
  executionRating: 1 | 2 | 3 | 4 | 5;
}
