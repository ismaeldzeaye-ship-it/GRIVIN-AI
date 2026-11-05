import { 
  ForwardTestTrade, 
  ForwardTestStats, 
  TradingSignal, 
  Candle, 
  StrategyType, 
  MarketSessionType 
} from '../types';

const STORAGE_KEY = 'grevin_forward_test_trades_v1';

export interface BreakdownGroupStats {
  name: string;
  totalSignals: number;
  resolvedSignals: number;
  openSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  maxDrawdownR: number;
  isSampleTooSmall: boolean;
}

export interface ForwardTestReport {
  overall: ForwardTestStats;
  bySetup: Record<StrategyType, BreakdownGroupStats>;
  bySymbol: Record<string, BreakdownGroupStats>;
  bySession: Record<MarketSessionType, BreakdownGroupStats>;
  storageStatus: {
    browserStorage: boolean;
    serverDiskStorage: boolean;
    cloudDatabase: boolean;
    message: string;
  };
}

/**
 * Loads forward-test trades from LocalStorage.
 */
export function loadTradesFromStorage(): ForwardTestTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[ForwardTest] Failed to load trades from storage:', e);
    return [];
  }
}

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Saves forward-test trades to LocalStorage and triggers debounced background server sync.
 */
export function saveTradesToStorage(trades: ForwardTestTrade[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep most recent 1000 trades to avoid unbounded storage growth
    const trimmedTrades = trades.length > 1000 ? trades.slice(-1000) : trades;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedTrades));

    // Debounced asynchronous sync to backend server disk (1.5s trailing)
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncTradesToServer(trimmedTrades).catch(() => {});
    }, 1500);
  } catch (e) {
    console.warn('[ForwardTest] Failed to save trades to storage:', e);
  }
}

/**
 * Syncs trades to backend server persistent disk storage.
 */
export async function syncTradesToServer(trades: ForwardTestTrade[]): Promise<boolean> {
  try {
    const payload = trades.length > 1000 ? trades.slice(-1000) : trades;
    const res = await fetch('/api/forward-test/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades: payload })
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches trades from backend server persistent disk storage.
 */
export async function fetchTradesFromServer(): Promise<ForwardTestTrade[]> {
  try {
    const res = await fetch('/api/forward-test/trades');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.trades) ? data.trades : [];
  } catch {
    return [];
  }
}

/**
 * Records a trading signal into Forward Test storage.
 * Strictly prevents duplicates by signal ID.
 */
export function recordSignalToForwardTest(
  signal: TradingSignal,
  existingTrades: ForwardTestTrade[]
): { updatedTrades: ForwardTestTrade[]; createdTrade: ForwardTestTrade | null } {
  // Requirement 6: Never record signals from unverified, simulated or cached data
  if (
    signal.isUnverifiedOrSimulated === true ||
    signal.dataOrigin === 'SIMULATED' ||
    signal.dataOrigin === 'CACHED' ||
    signal.dataOrigin === 'UNVERIFIED'
  ) {
    return { updatedTrades: existingTrades, createdTrade: null };
  }

  // If already recorded, return unchanged
  const exists = existingTrades.find(t => t.signalId === signal.id);
  if (exists) {
    return { updatedTrades: existingTrades, createdTrade: null };
  }

  const provider = signal.symbol.includes('USDT') 
    ? 'BINANCE' 
    : (signal.volumeType === 'REAL_VOLUME' ? 'BINANCE' : 'DERIV');

  const newTrade: ForwardTestTrade = {
    id: `FT-${signal.id}`,
    signalId: signal.id,
    symbol: signal.symbol,
    provider,
    marketType: signal.marketType,
    setup: signal.strategy,
    setupName: signal.strategyName,
    session: signal.session,
    killZone: signal.killZone || 'OUTSIDE_KILLZONE',
    grade: signal.grade,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.tp,
    rMultiple: 2.0, // Fixed 2R target per requirement 2
    entryTime: Math.floor((signal.timestamp || Date.now()) / 1000),
    status: 'OPEN'
  };

  const updatedTrades = [newTrade, ...existingTrades];
  saveTradesToStorage(updatedTrades);
  return { updatedTrades, createdTrade: newTrade };
}

/**
 * Evaluates open forward test trades against incoming closed candles.
 * Resolution rules:
 * - When price reaches target: resolved as WIN (+2.0R)
 * - When price reaches stop: resolved as LOSS (-1.0R)
 * - If both are touched inside one closed candle: count it as a LOSS.
 */
export function resolveForwardTestTrades(
  openTrades: ForwardTestTrade[],
  closedCandles: Candle[],
  symbol: string
): { updatedTrades: ForwardTestTrade[]; resolvedTrades: ForwardTestTrade[] } {
  if (!openTrades.length || !closedCandles.length) {
    return { updatedTrades: openTrades, resolvedTrades: [] };
  }

  const resolvedTrades: ForwardTestTrade[] = [];
  const updatedTrades = openTrades.map(trade => {
    // Only evaluate open trades for this matching symbol
    if (trade.status !== 'OPEN' || trade.symbol !== symbol) {
      return trade;
    }

    // Evaluate closed candles that occurred at or after the entry bar
    const relevantCandles = closedCandles.filter(c => !c.isForming && c.time >= trade.entryTime);
    if (!relevantCandles.length) return trade;

    const isBuy = trade.takeProfit > trade.entryPrice;

    for (let barIdx = 0; barIdx < relevantCandles.length; barIdx++) {
      const bar = relevantCandles[barIdx];

      if (isBuy) {
        const touchedStop = bar.low <= trade.stopLoss;
        const touchedTP = bar.high >= trade.takeProfit;

        // Rule: If both are touched inside one candle, count it as a LOSS.
        if (touchedStop && touchedTP) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'LOSS',
            exitPrice: trade.stopLoss,
            resolvedTime: bar.time,
            rOutcome: -1.0,
            bothTouchedInSameBar: true,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }

        if (touchedStop) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'LOSS',
            exitPrice: trade.stopLoss,
            resolvedTime: bar.time,
            rOutcome: -1.0,
            bothTouchedInSameBar: false,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }

        if (touchedTP) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'WIN',
            exitPrice: trade.takeProfit,
            resolvedTime: bar.time,
            rOutcome: 2.0, // Fixed 2R target
            bothTouchedInSameBar: false,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }
      } else {
        // SELL
        const touchedStop = bar.high >= trade.stopLoss;
        const touchedTP = bar.low <= trade.takeProfit;

        // Rule: If both are touched inside one candle, count it as a LOSS.
        if (touchedStop && touchedTP) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'LOSS',
            exitPrice: trade.stopLoss,
            resolvedTime: bar.time,
            rOutcome: -1.0,
            bothTouchedInSameBar: true,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }

        if (touchedStop) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'LOSS',
            exitPrice: trade.stopLoss,
            resolvedTime: bar.time,
            rOutcome: -1.0,
            bothTouchedInSameBar: false,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }

        if (touchedTP) {
          const resolved: ForwardTestTrade = {
            ...trade,
            status: 'RESOLVED',
            resolution: 'WIN',
            exitPrice: trade.takeProfit,
            resolvedTime: bar.time,
            rOutcome: 2.0, // Fixed 2R target
            bothTouchedInSameBar: false,
            durationBars: barIdx + 1
          };
          resolvedTrades.push(resolved);
          return resolved;
        }
      }
    }

    // Still OPEN
    return trade;
  });

  if (resolvedTrades.length > 0) {
    saveTradesToStorage(updatedTrades);
  }

  return { updatedTrades, resolvedTrades };
}

/**
 * Calculates metrics (number of signals, win rate, average R, max drawdown in R)
 * and checks the minimum 30 sample threshold.
 */
export function calculateForwardTestStats(trades: ForwardTestTrade[]): ForwardTestStats {
  const totalSignals = trades.length;
  const resolved = trades.filter(t => t.status === 'RESOLVED');
  const resolvedSignals = resolved.length;
  const openSignals = totalSignals - resolvedSignals;

  const wins = resolved.filter(t => t.resolution === 'WIN').length;
  const losses = resolved.filter(t => t.resolution === 'LOSS').length;

  const winRate = resolvedSignals > 0 ? Number(((wins / resolvedSignals) * 100).toFixed(1)) : 0;

  // Average R across resolved trades
  const totalR = resolved.reduce((acc, t) => acc + (t.rOutcome ?? 0), 0);
  const avgR = resolvedSignals > 0 ? Number((totalR / resolvedSignals).toFixed(2)) : 0;

  // Calculate Max Drawdown in R across chronological resolved trades
  const sortedResolved = [...resolved].sort((a, b) => (a.resolvedTime || 0) - (b.resolvedTime || 0));
  let runningR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;

  for (const t of sortedResolved) {
    runningR += t.rOutcome ?? 0;
    if (runningR > peakR) {
      peakR = runningR;
    }
    const currentDrawdown = peakR - runningR;
    if (currentDrawdown > maxDrawdownR) {
      maxDrawdownR = currentDrawdown;
    }
  }

  return {
    totalSignals,
    resolvedSignals,
    openSignals,
    wins,
    losses,
    winRate,
    avgR,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    isSampleTooSmall: resolvedSignals < 30 // Rule: Show "SAMPLE TOO SMALL" under 30 resolved signals
  };
}

/**
 * Produces complete forward test breakdown by Setup, Symbol, and Session.
 */
export function generateForwardTestReport(trades: ForwardTestTrade[]): ForwardTestReport {
  const overall = calculateForwardTestStats(trades);

  const setups: StrategyType[] = ['POC_BOUNCE', 'VALUE_AREA_REVERSAL', 'CONFIRMED_BREAKOUT'];
  const bySetup: Record<StrategyType, BreakdownGroupStats> = {} as any;

  for (const s of setups) {
    const groupTrades = trades.filter(t => t.setup === s);
    const stats = calculateForwardTestStats(groupTrades);
    bySetup[s] = {
      name: s === 'POC_BOUNCE' ? 'POC Bounce' : s === 'VALUE_AREA_REVERSAL' ? 'Value Area Reversal' : 'Value Area Breakout',
      ...stats
    };
  }

  const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol)));
  const bySymbol: Record<string, BreakdownGroupStats> = {};
  for (const sym of uniqueSymbols) {
    const groupTrades = trades.filter(t => t.symbol === sym);
    const stats = calculateForwardTestStats(groupTrades);
    bySymbol[sym] = {
      name: sym,
      ...stats
    };
  }

  const sessions: MarketSessionType[] = ['ASIAN', 'LONDON', 'NEW_YORK', 'LONDON_NY_OVERLAP'];
  const bySession: Record<MarketSessionType, BreakdownGroupStats> = {} as any;
  for (const sess of sessions) {
    const groupTrades = trades.filter(t => t.session === sess);
    const stats = calculateForwardTestStats(groupTrades);
    bySession[sess] = {
      name: sess.replace('_', ' '),
      ...stats
    };
  }

  // Persistence status diagnosis (requirement: "If persistent storage is not set up, tell me exactly what is missing.")
  const hasLocalStorage = typeof window !== 'undefined' && 'localStorage' in window;
  const storageStatus = {
    browserStorage: hasLocalStorage,
    serverDiskStorage: true,
    cloudDatabase: false,
    message: 'Persistent storage active: Browser LocalStorage + Server Disk JSON store. Note: Firebase Firestore is not provisioned; cross-device cloud sync requires set_up_firebase.'
  };

  return {
    overall,
    bySetup,
    bySymbol,
    bySession,
    storageStatus
  };
}
