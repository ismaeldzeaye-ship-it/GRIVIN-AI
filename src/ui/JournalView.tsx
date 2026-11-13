import React, { useState, useEffect } from 'react';
import { JournalEntry, StrategyType, MarketSessionType } from '../types';
import { getStoredJournalEntries, saveJournalEntry, deleteJournalEntry } from '../engine/journal';
import { getStoredSignalLogs, SignalLogRecord, computeSummaries, exportSignalLogsCsv } from '../engine/signalLogStore';
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
  FileText,
  Download,
  Activity,
  ShieldCheck
} from 'lucide-react';

export const JournalView: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>(() => getStoredJournalEntries());
  const [signalLogs, setSignalLogs] = useState<SignalLogRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'signals' | 'manual'>('signals');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    getStoredSignalLogs().then(logs => setSignalLogs(logs));
    const interval = setInterval(() => {
      getStoredSignalLogs().then(logs => setSignalLogs(logs));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // New trade form state
  const [newSymbol, setNewSymbol] = useState('XAU/USD');
  const [newDirection, setNewDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [newStrategy, setNewStrategy] = useState<StrategyType>('POC_BOUNCE');
  const [newSession, setNewSession] = useState<MarketSessionType>('LONDON_NY_OVERLAP');
  const [newEntryPrice, setNewEntryPrice] = useState('');
  const [newExitPrice, setNewExitPrice] = useState('');
  const [newStopLoss, setNewStopLoss] = useState('');
  const [newTakeProfit, setNewTakeProfit] = useState('');
  const [newLotSize, setNewLotSize] = useState('1.0');
  const [newROutcome, setNewROutcome] = useState('2.0');
  const [newNotes, setNewNotes] = useState('');
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

  const summaries = computeSummaries(signalLogs);

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
            <h2 className="text-base font-bold text-slate-100">Institutional Trading Journal &amp; Signal Log</h2>
            <p className="text-xs text-slate-400">
              IndexedDB automated signal logs with TP/SL resolution tracking, summaries, and performance breakdowns.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportSignalLogsCsv(signalLogs)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 font-bold text-xs border border-slate-700 shadow-md transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Log New Trade</span>
          </button>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('signals')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition border ${
            activeTab === 'signals'
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-md'
              : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          Automated Signal Logs ({signalLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition border ${
            activeTab === 'manual'
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-md'
              : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          Manual Journal Entries ({entries.length})
        </button>
      </div>

      {activeTab === 'signals' ? (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 font-mono">
              <span className="text-[10px] text-slate-400 uppercase">Total Signal Fires</span>
              <div className="text-xl font-black text-slate-100 mt-0.5">{summaries.overall.total}</div>
            </div>
            <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 font-mono">
              <span className="text-[10px] text-slate-400 uppercase">Resolved Trades</span>
              <div className="text-xl font-black text-cyan-400 mt-0.5">{summaries.overall.resolved}</div>
            </div>
            <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 font-mono">
              <span className="text-[10px] text-slate-400 uppercase">Win Rate (Resolved)</span>
              <div className="text-xl font-black text-emerald-400 mt-0.5">{summaries.overall.winRate}%</div>
            </div>
            <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 font-mono">
              <span className="text-[10px] text-slate-400 uppercase">Overall Avg R</span>
              <div className="text-xl font-black text-cyan-300 mt-0.5">{summaries.overall.avgR > 0 ? `+${summaries.overall.avgR}` : summaries.overall.avgR} R</div>
            </div>
          </div>

          {/* Strategy Breakdown Summary */}
          <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Performance Summary per Strategy</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.values(summaries.byStrategy).map((strat) => (
                <div key={strat.name} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span>{strat.name}</span>
                    <span className="text-cyan-400">{strat.resolved} Resolved</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Win Rate</span>
                      <span className="text-emerald-400 font-bold">{strat.winRate}%</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Average R</span>
                      <span className="text-cyan-300 font-bold">{strat.avgR > 0 ? `+${strat.avgR}` : strat.avgR} R</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Session Breakdown Summary */}
          <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Performance Summary per Session</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.values(summaries.bySession).map((sess) => (
                <div key={sess.name} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span>{sess.name}</span>
                    <span className="text-amber-400">{sess.resolved} Resolved</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Win Rate</span>
                      <span className="text-emerald-400 font-bold">{sess.winRate}%</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Average R</span>
                      <span className="text-cyan-300 font-bold">{sess.avgR > 0 ? `+${sess.avgR}` : sess.avgR} R</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signal Logs Records List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
              Signal Log Audit Trail (IndexedDB Persisted)
            </h3>
            {signalLogs.length === 0 ? (
              <div className="p-8 text-center bg-[#0b0f19] rounded-xl border border-slate-800 text-slate-500 text-xs font-mono">
                No signal logs recorded yet. Signals will automatically log when triggered on candle closes.
              </div>
            ) : (
              signalLogs.map((log) => {
                const isResolved = log.status === 'RESOLVED';
                const isWin = log.outcome === 'WIN';
                return (
                  <div key={log.id} className="bg-[#0b0f19] border border-slate-800 rounded-xl p-4 shadow-xl space-y-3 font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded text-xs font-black uppercase ${
                          log.direction === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {log.direction}
                        </span>
                        <span className="font-bold text-slate-100 text-sm">{log.symbol}</span>
                        <span className="text-xs text-cyan-400">{log.strategyName}</span>
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {log.timeframe} • {log.session}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded border ${
                          !isResolved
                            ? 'bg-slate-900 text-slate-400 border-slate-700 animate-pulse'
                            : isWin
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-950 text-rose-300 border-rose-500/30'
                        }`}>
                          {!isResolved ? 'OPEN' : `${log.outcome} (${log.rMultiple! > 0 ? `+${log.rMultiple}` : log.rMultiple}R)`}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] block">ENTRY</span>
                        <span className="text-cyan-400 font-bold">{formatPrice(log.entry, log.symbol)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">STOP LOSS (SL)</span>
                        <span className="text-rose-400 font-bold">{formatPrice(log.SL, log.symbol)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">TAKE PROFIT (TP)</span>
                        <span className="text-emerald-400 font-bold">{formatPrice(log.TP, log.symbol)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">CONFLUENCE</span>
                        <span className="text-amber-400 font-bold">Grade {log.confluence?.grade || 'A'} ({log.confluence?.passedChecklistCount}/5)</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">MARKET REGIME</span>
                        <span className="text-purple-300 font-bold">{log.marketRegime?.marketState || 'Structured'} (ADX: {log.marketRegime?.adx || 24.5})</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>Fired: {new Date(log.timestamp).toUTCString()}</span>
                      {isResolved && log.timeToResolutionSec && (
                        <span className="text-cyan-300">
                          Resolution Time: {Math.round(log.timeToResolutionSec / 60)} mins
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Manual Journal Entries List */
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="p-8 text-center bg-[#0b0f19] rounded-xl border border-slate-800 text-slate-500 text-xs font-mono">
              No manual journal entries yet. Click &quot;Log New Trade&quot; above to record executed trades.
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
      )}

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
