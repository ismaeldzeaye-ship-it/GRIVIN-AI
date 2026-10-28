import { JournalEntry, TradingSignal } from '../types';

const STORAGE_KEY = 'grevin_ai_journal_entries';

export function getStoredJournalEntries(): JournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialSampleJournal();
    return JSON.parse(raw);
  } catch {
    return getInitialSampleJournal();
  }
}

export function saveJournalEntry(entry: JournalEntry): JournalEntry[] {
  const current = getStoredJournalEntries();
  const index = current.findIndex(e => e.id === entry.id);
  let updated: JournalEntry[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = entry;
  } else {
    updated = [entry, ...current];
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function deleteJournalEntry(id: string): JournalEntry[] {
  const current = getStoredJournalEntries();
  const updated = current.filter(e => e.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function createJournalFromSignal(signal: TradingSignal, lotSize = 1.0): JournalEntry {
  return {
    id: `jnl-${Date.now()}`,
    signalId: signal.id,
    symbol: signal.symbol,
    direction: signal.direction === 'BUY' ? 'BUY' : 'SELL',
    strategy: signal.strategy,
    session: signal.session,
    entryTime: Math.floor(Date.now() / 1000),
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.tp,
    lotSize,
    status: 'OPEN',
    notes: `Triggered via ${signal.strategyName}. Setup Grade: ${signal.grade}. Target (2R): ${signal.tp}`,
    tags: [signal.session, signal.strategy, 'SMC'],
    executionRating: 5
  };
}

function getInitialSampleJournal(): JournalEntry[] {
  return [
    {
      id: 'jnl-sample-1',
      symbol: 'XAU/USD',
      direction: 'BUY',
      strategy: 'POC_BOUNCE',
      session: 'LONDON_NY_OVERLAP',
      entryTime: Math.floor(Date.now() / 1000) - 86400 * 2,
      exitTime: Math.floor(Date.now() / 1000) - 86400 * 2 + 7200,
      entryPrice: 2735.40,
      exitPrice: 2748.20,
      stopLoss: 2729.80,
      takeProfit: 2748.00,
      rOutcome: 2.28,
      lotSize: 1.5,
      pnlCash: 1920.00,
      status: 'CLOSED',
      notes: 'Clean reaction at European session POC with Fair Value Gap confluence. Exited exactly at TP1.',
      tags: ['LONDON_NY_OVERLAP', 'POC_BOUNCE', 'WIN'],
      executionRating: 5
    },
    {
      id: 'jnl-sample-2',
      symbol: 'NAS100',
      direction: 'SELL',
      strategy: 'VALUE_AREA_REVERSAL',
      session: 'NEW_YORK',
      entryTime: Math.floor(Date.now() / 1000) - 86400,
      exitTime: Math.floor(Date.now() / 1000) - 86400 + 5400,
      entryPrice: 20450.0,
      exitPrice: 20380.0,
      stopLoss: 20490.0,
      takeProfit: 20370.0,
      rOutcome: 1.75,
      lotSize: 2.0,
      pnlCash: 1400.00,
      status: 'CLOSED',
      notes: 'Failed auction outside VAH. Responsive institutional sellers pushed price straight back to POC.',
      tags: ['NEW_YORK', 'VA_REVERSAL', 'WIN'],
      executionRating: 4
    }
  ];
}
