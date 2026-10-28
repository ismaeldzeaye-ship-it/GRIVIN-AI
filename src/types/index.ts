export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export type SignalDirection = 'BUY' | 'SELL' | 'WAIT';

export type SignalStatus = 
  | 'VALID' 
  | 'WAIT' 
  | 'INVALID' 
  | 'TRIGGERED' 
  | 'TP_HIT' 
  | 'SL_HIT';

export type StrategyType = 
  | 'POC_BOUNCE' 
  | 'VALUE_AREA_REVERSAL' 
  | 'CONFIRMED_BREAKOUT';

export type SetupGrade = 'A' | 'B' | 'C';

export type MarketSessionType = 
  | 'ASIAN' 
  | 'LONDON' 
  | 'NEW_YORK' 
  | 'LONDON_NY_OVERLAP' 
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
}

export interface Tick {
  time: number;
  symbol: string;
  bid: number;
  ask: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  brokerSymbol?: string;
  name: string;
  category: 'FOREX' | 'METALS' | 'INDICES' | 'CRYPTO';
  digits: number;
  pipSize: number;
  pipValuePerStandardLot?: number; // fetched from cTrader
  lotSize?: number; // contract size from cTrader
  minLot?: number;
  maxLot?: number;
  lotStep?: number;
  currentBid: number;
  currentAsk: number;
  spreadPips: number;
  dayChangePercent: number;
  dayHigh: number;
  dayLow: number;
  isAvailable: boolean; // marked unavailable if not in account
}

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  percentage: number;
}

export interface VolumeProfile {
  poc: number; // Point of Control
  vah: number; // Value Area High (70%)
  val: number; // Value Area Low (70%)
  totalVolume: number;
  valueAreaVolume: number;
  levels: VolumeProfileLevel[];
  session: MarketSessionType;
  stepSize: number;
  isApproximateTickVolume: boolean; // Labeled APPROXIMATE (tick volume) unless true volume is available
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

export interface TradingSignal {
  id: string;
  symbol: string;
  direction: SignalDirection;
  status: SignalStatus;
  timeframe: Timeframe;
  confirmationTimeframe?: Timeframe;
  strategy: StrategyType;
  strategyName: string;
  entryZone: {
    min: number;
    max: number;
  };
  entryPrice: number;
  stopLoss: number;
  tp: number; // Default single take-profit at 2R
  riskPips: number;
  rewardPips: number;
  rMultiple: 2.0; // 2R default target
  grade: SetupGrade; // A / B / C setup grade
  session: MarketSessionType;
  reason: string;
  timestamp: number;
  checklist: InstitutionalChecklistItem[];
  aiAnalysis?: string;
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

export interface CTraderConfig {
  clientId: string; // Empty by default
  clientSecret: string;
  accessToken: string;
  accountId: string;
  environment: 'DEMO' | 'LIVE';
  host: string;
  port: number;
  autoReconnect: boolean;
  connected: boolean;
  simulationMode: boolean; // OFF by default
  lastHeartbeat: number | null;
  latencyMs: number | null; // Real measured value or null
  isStale: boolean;
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
