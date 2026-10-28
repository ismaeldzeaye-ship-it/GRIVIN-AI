import React, { useState } from 'react';
import { JournalEntry, StrategyType, MarketSessionType } from '../types';
import { getStoredJournalEntries, saveJournalEntry, deleteJournalEntry } from '../engine/journal';
import { formatPrice } from '../data/symbolMapping';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Star, 
  TrendingUp, 
  TrendingDown, 
  Tag, 
  Clock,
  CheckCircle,
  FileText
} from 'lucide-react';

export const JournalView: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>(() => getStoredJournalEntries());
  const [showAddModal, setShowAddModal] = useState(false);

  // New trade form state
  const [newSymbol, setNewSymbol] = useState('XAU/USD');
  const [newDirection, setNewDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [newStrategy, setNewStrategy] = useState<StrategyType>('POC_BOUNCE');
  const [newSession, setNewSession] = useState<MarketSessionType>('LONDON_NY_OVERLAP');
  const [newEntryPrice, setNewEntryPrice] = useState('2742.50');
  const [newExitPrice, setNewExitPrice] = useState('2752.50');
  const [newStopLoss, setNewStopLoss] = useState('2737.50');
  const [newTakeProfit, setNewTakeProfit] = useState('2752.50');
  const [newLotSize, setNewLotSize] = useState('1.0');
  const [newROutcome, setNewROutcome] = useState('2.0');
  const [newNotes, setNewNotes] = useState('Executed cleanly on session POC rejection.');
  const [newRating, setNewRating] = useState<1 | 2 | 3 | 4 | 5>(5);

  const handleAddTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: JournalEntry = {
      id: `jnl-${Date.now()}`,
      symbol: newSymbol,
      direction: newDirection,
      strategy: newStrategy,
      session: newSession,
      entryTime: Math.floor(Date.now() / 1000) - 3600,
      exitTime: Math.floor(Date.now() / 1000),
      entryPrice: Number(newEntryPrice) || 0,
      exitPrice: Number(newExitPrice) || 0,
      stopLoss: Number(newStopLoss) || 0,
      takeProfit: Number(newTakeProfit) || 0,
      lotSize: Number(newLotSize) || 1.0,
      rOutcome: Number(newROutcome) || 0,
      status: 'CLOSED',
      notes: newNotes,
      tags: [newSession, newStrategy],
      executionRating: newRating
    };

    const updated = saveJournalEntry(entry);
    setEntries(updated);
    setShowAddModal(false);
  };

  const handleDelete = (id: string) => {
    const updated = deleteJournalEntry(id);
    setEntries(updated);
  };

  const totalTrades = entries.length;
  const wins = entries.filter(e => (e.rOutcome || 0) > 0).length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
  const totalR = entries.reduce((acc, e) => acc + (e.rOutcome || 0), 0).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header and Quick Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Institutional Trading Journal</h2>
            <p className="text-xs text-slate-400">
              Track executed signals, R-multiples, psychological notes, and execution consistency.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>Log New Trade</span>
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Logged Trades</span>
          <div className="text-xl font-black text-slate-100 font-mono mt-0.5">{totalTrades}</div>
        </div>
        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Realized Win Rate</span>
          <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">{winRate}%</div>
        </div>
        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Cumulative R Return</span>
          <div className="text-xl font-black text-cyan-400 font-mono mt-0.5">+{totalR} R</div>
        </div>
      </div>

      {/* Journal Entries List */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="p-8 text-center bg-[#0b0f19] rounded-xl border border-slate-800 text-slate-500 text-xs font-mono">
            No journal entries yet. When inspecting signals, click &quot;Log Trade to Journal&quot; or tap &quot;Log New Trade&quot; above.
          </div>
        ) : (
          entries.map((entry) => {
            const isWin = (entry.rOutcome || 0) > 0;
            return (
              <div
                key={entry.id}
                className="bg-[#0b0f19] border border-slate-800 rounded-xl p-4 shadow-xl space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-black uppercase font-mono ${
                      entry.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {entry.direction}
                    </span>
                    <span className="font-bold text-slate-100 text-sm">{entry.symbol}</span>
                    <span className="text-xs text-slate-400 font-mono">{entry.strategy}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                      isWin
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-950 text-rose-300 border-rose-500/30'
                    }`}>
                      {entry.rOutcome && entry.rOutcome > 0 ? `+${entry.rOutcome}R` : `${entry.rOutcome || 0}R`}
                    </span>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Trade details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">ENTRY</span>
                    <span className="text-cyan-400 font-bold">{formatPrice(entry.entryPrice, entry.symbol)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">EXIT</span>
                    <span className="text-slate-200 font-bold">{entry.exitPrice ? formatPrice(entry.exitPrice, entry.symbol) : 'OPEN'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">LOT SIZE</span>
                    <span className="text-amber-400 font-bold">{entry.lotSize} Lots</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">EXECUTION RATING</span>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${s <= entry.executionRating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notes & Tags */}
                <div className="text-xs text-slate-300 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                  <p>{entry.notes}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {entry.tags.map((t, idx) => (
                      <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Manual Trade Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-[#0b0f19] border border-slate-700 shadow-2xl p-6 text-xs text-slate-300 space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Log Executed Trade to Journal
            </h3>

            <form onSubmit={handleAddTrade} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Symbol</label>
                  <select
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  >
                    <option value="XAU/USD">XAU/USD</option>
                    <option value="EUR/USD">EUR/USD</option>
                    <option value="GBP/USD">GBP/USD</option>
                    <option value="US30">US30</option>
                    <option value="NAS100">NAS100</option>
                    <option value="BTC/USD">BTC/USD</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Direction</label>
                  <select
                    value={newDirection}
                    onChange={(e) => setNewDirection(e.target.value as 'BUY' | 'SELL')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="any"
                    value={newEntryPrice}
                    onChange={(e) => setNewEntryPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Exit Price</label>
                  <input
                    type="number"
                    step="any"
                    value={newExitPrice}
                    onChange={(e) => setNewExitPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Lot Size</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newLotSize}
                    onChange={(e) => setNewLotSize(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">R Outcome (e.g. 2.0 or -1.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newROutcome}
                    onChange={(e) => setNewROutcome(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Trade Notes &amp; Psychology</label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
