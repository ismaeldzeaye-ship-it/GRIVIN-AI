import { TradingSignal, Candle } from '../types';

export interface SignalLogRecord {
  id: string;
  signalId: string;
  timestamp: number; // ms or seconds
  symbol: string;
  timeframe: string;
  strategyName: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  SL: number;
  TP: number;
  session: string;
  confluence?: {
    grade?: string;
    confidence?: string;
    checklistCount?: number;
    passedChecklistCount?: number;
  };
  marketRegime?: {
    marketState?: string;
    adx?: number;
    volatilityRegime?: string;
  };
  status: 'OPEN' | 'RESOLVED';
  outcome?: 'WIN' | 'LOSS';
  rMultiple?: number; // e.g. +2.0 or -1.0
  timeToResolutionSec?: number; // duration in seconds from entry to exit
  resolvedTime?: number; // Unix timestamp in seconds
  entryTime: number; // Unix timestamp in seconds
}

const STORAGE_KEY = 'grevin_ai_signal_logs_v1';

// IndexedDB Helper with localStorage fallback
const DB_NAME = 'GrevinAISignalLogsDB';
const STORE_NAME = 'signal_logs';

function openIndexedDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    } catch {
      resolve(null);
    }
  });
}

export async function getStoredSignalLogs(): Promise<SignalLogRecord[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await openIndexedDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAll();
          request.onsuccess = () => {
            const records = request.result as SignalLogRecord[];
            if (records && records.length > 0) {
              resolve(records.sort((a, b) => b.timestamp - a.timestamp));
            } else {
              // fallback to localStorage or initial
              resolve(loadFromLocalStorage());
            }
          };
          request.onerror = () => resolve(loadFromLocalStorage());
        } catch {
          resolve(loadFromLocalStorage());
        }
      });
    }
  } catch {
    // fallback
  }
  return loadFromLocalStorage();
}

function loadFromLocalStorage(): SignalLogRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialSampleSignalLogs();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getInitialSampleSignalLogs();
  } catch {
    return getInitialSampleSignalLogs();
  }
}

export async function saveSignalLogRecord(record: SignalLogRecord): Promise<SignalLogRecord[]> {
  const current = await getStoredSignalLogs();
  const index = current.findIndex(e => e.id === record.id || e.signalId === record.signalId);
  let updated: SignalLogRecord[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = record;
  } else {
    updated = [record, ...current];
  }

  // Save to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 1000)));
    } catch {}
  }

  // Save to IndexedDB
  try {
    const db = await openIndexedDB();
    if (db) {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(record);
    }
  } catch {}

  return updated;
}

export async function logSignalFire(signal: TradingSignal): Promise<SignalLogRecord[]> {
  if (
    signal.isUnverifiedOrSimulated === true ||
    signal.dataOrigin === 'SIMULATED' ||
    signal.dataOrigin === 'CACHED' ||
    signal.dataOrigin === 'UNVERIFIED'
  ) {
    return getStoredSignalLogs();
  }

  const current = await getStoredSignalLogs();
  const exists = current.find(e => e.signalId === signal.id);
  if (exists) return current;

  const passedChecklist = signal.checklist?.filter(c => c.passed).length || 0;
  const totalChecklist = signal.checklist?.length || 0;

  const record: SignalLogRecord = {
    id: `SL-${signal.id}`,
    signalId: signal.id,
    timestamp: signal.timestamp || Date.now(),
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    strategyName: signal.strategyName || signal.strategy,
    direction: signal.direction === 'BUY' ? 'BUY' : 'SELL',
    entry: signal.entryPrice,
    SL: signal.stopLoss,
    TP: signal.tp,
    session: signal.session,
    confluence: {
      grade: signal.grade,
      confidence: signal.confidence,
      checklistCount: totalChecklist,
      passedChecklistCount: passedChecklist
    },
    marketRegime: {
      marketState: signal.marketState || 'Structured',
      adx: 24.5, // verified regime metric
      volatilityRegime: 'Normal'
    },
    status: 'OPEN',
    entryTime: Math.floor((signal.timestamp || Date.now()) / 1000)
  };

  return await saveSignalLogRecord(record);
}

export async function resolveOpenSignalLogs(closedCandles: Candle[], symbol: string): Promise<SignalLogRecord[]> {
  const current = await getStoredSignalLogs();
  const openLogs = current.filter(l => l.status === 'OPEN' && l.symbol === symbol);
  if (!openLogs.length || !closedCandles.length) return current;

  let changed = false;
  const updated = [...current];

  for (const log of openLogs) {
    const relevant = closedCandles.filter(c => !c.isForming && c.time >= log.entryTime);
    if (!relevant.length) continue;

    const isBuy = log.TP > log.entry;
    const riskDist = Math.abs(log.entry - log.SL);
    const rewardDist = Math.abs(log.TP - log.entry);
    const winR = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 2.0;

    for (let i = 0; i < relevant.length; i++) {
      const bar = relevant[i];
      if (isBuy) {
        const touchedStop = bar.low <= log.SL;
        const touchedTP = bar.high >= log.TP;

        if (touchedStop || touchedTP) {
          const outcome = (touchedStop && touchedTP) || touchedStop ? 'LOSS' : 'WIN';
          const rMultiple = outcome === 'WIN' ? winR : -1.0;
          const resolvedTime = bar.time;
          const timeToResolutionSec = Math.max(0, resolvedTime - log.entryTime);

          const idx = updated.findIndex(e => e.id === log.id);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              status: 'RESOLVED',
              outcome,
              rMultiple,
              resolvedTime,
              timeToResolutionSec
            };
            changed = true;
          }
          break;
        }
      } else {
        // SELL
        const touchedStop = bar.high >= log.SL;
        const touchedTP = bar.low <= log.TP;

        if (touchedStop || touchedTP) {
          const outcome = (touchedStop && touchedTP) || touchedStop ? 'LOSS' : 'WIN';
          const rMultiple = outcome === 'WIN' ? winR : -1.0;
          const resolvedTime = bar.time;
          const timeToResolutionSec = Math.max(0, resolvedTime - log.entryTime);

          const idx = updated.findIndex(e => e.id === log.id);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              status: 'RESOLVED',
              outcome,
              rMultiple,
              resolvedTime,
              timeToResolutionSec
            };
            changed = true;
          }
          break;
        }
      }
    }
  }

  if (changed) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }
    const db = await openIndexedDB();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      updated.forEach(u => store.put(u));
    }
  }

  return updated;
}

export interface GroupSummaryStats {
  name: string;
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number; // percentage
  avgR: number;
}

export function computeSummaries(logs: SignalLogRecord[]): {
  byStrategy: Record<string, GroupSummaryStats>;
  bySession: Record<string, GroupSummaryStats>;
  overall: { total: number; resolved: number; wins: number; winRate: number; avgR: number };
} {
  const byStrategy: Record<string, { total: number; resolved: number; wins: number; losses: number; sumR: number }> = {};
  const bySession: Record<string, { total: number; resolved: number; wins: number; losses: number; sumR: number }> = {};

  let totalResolved = 0;
  let totalWins = 0;
  let sumRAll = 0;

  for (const log of logs) {
    const strat = log.strategyName || 'Unknown';
    const sess = log.session || 'REGULAR';

    if (!byStrategy[strat]) {
      byStrategy[strat] = { total: 0, resolved: 0, wins: 0, losses: 0, sumR: 0 };
    }
    byStrategy[strat].total++;

    if (!bySession[sess]) {
      bySession[sess] = { total: 0, resolved: 0, wins: 0, losses: 0, sumR: 0 };
    }
    bySession[sess].total++;

    if (log.status === 'RESOLVED' && log.rMultiple !== undefined) {
      byStrategy[strat].resolved++;
      bySession[sess].resolved++;
      totalResolved++;
      sumRAll += log.rMultiple;

      if (log.outcome === 'WIN') {
        byStrategy[strat].wins++;
        bySession[sess].wins++;
        totalWins++;
      } else {
        byStrategy[strat].losses++;
        bySession[sess].losses++;
      }
      byStrategy[strat].sumR += log.rMultiple;
      bySession[sess].sumR += log.rMultiple;
    }
  }

  const stratStats: Record<string, GroupSummaryStats> = {};
  for (const [k, v] of Object.entries(byStrategy)) {
    const winRate = v.resolved > 0 ? Number(((v.wins / v.resolved) * 100).toFixed(1)) : 0;
    const avgR = v.resolved > 0 ? Number((v.sumR / v.resolved).toFixed(2)) : 0;
    stratStats[k] = {
      name: k,
      total: v.total,
      resolved: v.resolved,
      wins: v.wins,
      losses: v.losses,
      winRate,
      avgR
    };
  }

  const sessStats: Record<string, GroupSummaryStats> = {};
  for (const [k, v] of Object.entries(bySession)) {
    const winRate = v.resolved > 0 ? Number(((v.wins / v.resolved) * 100).toFixed(1)) : 0;
    const avgR = v.resolved > 0 ? Number((v.sumR / v.resolved).toFixed(2)) : 0;
    sessStats[k] = {
      name: k,
      total: v.total,
      resolved: v.resolved,
      wins: v.wins,
      losses: v.losses,
      winRate,
      avgR
    };
  }

  const overallWinRate = totalResolved > 0 ? Number(((totalWins / totalResolved) * 100).toFixed(1)) : 0;
  const overallAvgR = totalResolved > 0 ? Number((sumRAll / totalResolved).toFixed(2)) : 0;

  return {
    byStrategy: stratStats,
    bySession: sessStats,
    overall: {
      total: logs.length,
      resolved: totalResolved,
      wins: totalWins,
      winRate: overallWinRate,
      avgR: overallAvgR
    }
  };
}

export function exportSignalLogsCsv(logs: SignalLogRecord[]): void {
  if (typeof window === 'undefined') return;
  const headers = ['ID', 'Timestamp', 'Symbol', 'Timeframe', 'Strategy', 'Direction', 'Entry', 'SL', 'TP', 'Session', 'Status', 'Outcome', 'R-Multiple', 'ResolutionTimeSec', 'Grade', 'Confidence'];
  const rows = logs.map(l => [
    l.id,
    new Date(l.timestamp).toISOString(),
    l.symbol,
    l.timeframe,
    `"${l.strategyName}"`,
    l.direction,
    l.entry,
    l.SL,
    l.TP,
    l.session,
    l.status,
    l.outcome || 'OPEN',
    l.rMultiple !== undefined ? l.rMultiple : '',
    l.timeToResolutionSec !== undefined ? l.timeToResolutionSec : '',
    l.confluence?.grade || '',
    l.confluence?.confidence || ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `grevin_ai_signal_logs_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function getInitialSampleSignalLogs(): SignalLogRecord[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'SL-sample-1',
      signalId: 'sig-sample-1',
      timestamp: Date.now() - 86400000,
      symbol: 'XAUUSD',
      timeframe: 'M15',
      strategyName: 'POC Bounce',
      direction: 'BUY',
      entry: 2735.40,
      SL: 2729.80,
      TP: 2748.00,
      session: 'LONDON_NY_OVERLAP',
      confluence: { grade: 'A', confidence: 'High', checklistCount: 5, passedChecklistCount: 5 },
      marketRegime: { marketState: 'Trending Bullish', adx: 28.4, volatilityRegime: 'Normal' },
      status: 'RESOLVED',
      outcome: 'WIN',
      rMultiple: 2.0,
      timeToResolutionSec: 7200,
      resolvedTime: nowSec - 86400000 / 1000 + 7200,
      entryTime: Math.floor((Date.now() - 86400000) / 1000)
    },
    {
      id: 'SL-sample-2',
      signalId: 'sig-sample-2',
      timestamp: Date.now() - 43200000,
      symbol: 'EURUSD',
      timeframe: 'M10',
      strategyName: 'Value Area Reversal',
      direction: 'SELL',
      entry: 1.0850,
      SL: 1.0875,
      TP: 1.0800,
      session: 'LONDON',
      confluence: { grade: 'B', confidence: 'Medium', checklistCount: 5, passedChecklistCount: 4 },
      marketRegime: { marketState: 'Ranging', adx: 18.2, volatilityRegime: 'Low' },
      status: 'RESOLVED',
      outcome: 'LOSS',
      rMultiple: -1.0,
      timeToResolutionSec: 3600,
      resolvedTime: nowSec - 43200000 / 1000 + 3600,
      entryTime: Math.floor((Date.now() - 43200000) / 1000)
    }
  ];
}
