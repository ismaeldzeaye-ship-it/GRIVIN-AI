import React, { useState, useMemo } from 'react';
import { TradingSignal, MarketSessionType, SignalDirection, StrategyType } from '../types';
import { formatPrice } from '../data/symbolMapping';
import { 
  Activity, 
  Filter, 
  Target, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Calculator, 
  Sparkles,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface SignalsFeedProps {
  signals: TradingSignal[];
  onSelectSignal: (signal: TradingSignal) => void;
  onViewOnChart: (symbol: string) => void;
  isConnected: boolean;
  isSimulation: boolean;
  onNavigateToConnection?: () => void;
}

export const SignalsFeed: React.FC<SignalsFeedProps> = ({
  signals,
  onSelectSignal,
  onViewOnChart,
  isConnected,
  isSimulation,
  onNavigateToConnection
}) => {
  const isFeedActive = isConnected || isSimulation;
  const [selectedSession, setSelectedSession] = useState<string>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<string>('ALL');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ALL');

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (selectedSession !== 'ALL' && s.session !== selectedSession) return false;
      if (selectedSymbol !== 'ALL' && s.symbol !== selectedSymbol) return false;
      if (selectedDirection !== 'ALL' && s.direction !== selectedDirection) return false;
      if (selectedStrategy !== 'ALL' && s.strategy !== selectedStrategy) return false;
      return true;
    });
  }, [signals, selectedSession, selectedSymbol, selectedDirection, selectedStrategy]);

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">Live Institutional Signals Stream</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              {filteredSignals.length} Matches
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Interactive Multi-Criteria Filter</span>
          </div>
        </div>

        {/* Filter Selectors Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* Session Filter */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Session Filter</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Sessions</option>
              <option value="LONDON_NY_OVERLAP">London / NY Overlap</option>
              <option value="LONDON">London Session</option>
              <option value="NEW_YORK">New York Session</option>
              <option value="ASIAN">Asian Session</option>
            </select>
          </div>

          {/* Symbol Filter */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Symbol</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Instruments</option>
              <option value="XAU/USD">XAU/USD (Gold)</option>
              <option value="EUR/USD">EUR/USD</option>
              <option value="GBP/USD">GBP/USD</option>
              <option value="US30">US30 (Dow Jones)</option>
              <option value="NAS100">NAS100 (Nasdaq)</option>
              <option value="US100">US100 (Nasdaq 100)</option>
            </select>
          </div>

          {/* Direction Filter */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Direction</label>
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Directions</option>
              <option value="BUY">BUY Only</option>
              <option value="SELL">SELL Only</option>
              <option value="WAIT">WAIT Only</option>
            </select>
          </div>

          {/* Strategy Filter (Strictly the 3 Core Setups) */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All 3 Core Strategies</option>
              <option value="POC_BOUNCE">Previous Session POC Bounce</option>
              <option value="VALUE_AREA_REVERSAL">70% Value Area Reversal</option>
              <option value="CONFIRMED_BREAKOUT">Value Area Breakout & BOS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Signals List Cards */}
      <div className="space-y-3">
        {!isFeedActive ? (
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <h3 className="text-sm font-bold text-slate-200">cTrader Not Connected</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Live signal stream requires a verified cTrader Open API connection. Connect credentials in Market Data or enable Simulation Mode.
            </p>
            {onNavigateToConnection && (
              <button
                onClick={onNavigateToConnection}
                className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
              >
                Configure cTrader Connection
              </button>
            )}
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="p-8 text-center bg-[#0b0f19] rounded-xl border border-slate-800 text-slate-400 text-xs">
            No signals match the current filter criteria. Try selecting &quot;All Sessions&quot; or &quot;All Instruments&quot;.
          </div>
        ) : (
          filteredSignals.map((signal) => {
            const isBuy = signal.direction === 'BUY';
            const passedChecklistCount = signal.checklist.filter(c => c.passed).length;

            return (
              <div
                key={signal.id}
                className="bg-[#0b0f19] border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-xl transition space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded text-xs font-black uppercase font-mono ${
                      isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {signal.direction}
                    </span>
                    <div>
                      <span className="font-bold text-slate-100 text-sm mr-2">{signal.symbol}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {signal.timeframe} • {signal.strategyName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                      signal.grade === 'A' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                      signal.grade === 'B' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' :
                      'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    }`}>
                      GRADE {signal.grade}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {signal.session}
                    </span>
                  </div>
                </div>

                {/* Reason sentence */}
                <p className="text-xs text-slate-300">
                  {signal.reason}
                </p>

                {/* Verified Levels Pill (Single 2R TP per Requirement 3) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">ENTRY ZONE</span>
                    <span className="text-cyan-400 font-bold">{signal.entryZone.min} - {signal.entryZone.max}</span>
                  </div>
                  <div>
                    <span className="text-rose-500 text-[10px] block">STOP LOSS ({signal.riskPips}p)</span>
                    <span className="text-rose-400 font-bold">{formatPrice(signal.stopLoss, signal.symbol)}</span>
                  </div>
                  <div>
                    <span className="text-emerald-500 text-[10px] block">TARGET (2R)</span>
                    <span className="text-emerald-400 font-bold">{formatPrice(signal.tp, signal.symbol)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between pt-1 gap-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Checklist: {passedChecklistCount} / {signal.checklist.length} Passed</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewOnChart(signal.symbol)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                    >
                      View on Chart
                    </button>
                    <button
                      onClick={() => onSelectSignal(signal)}
                      className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                    >
                      <span>Position Sizer &amp; AI</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
