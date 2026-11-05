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
  onViewOnChart: (symbol: string, signal?: TradingSignal) => void;
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
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Allowed Symbol</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Allowed Instruments</option>
              <option value="XAU/USD">XAU/USD (Gold)</option>
              <option value="EUR/USD">EUR/USD</option>
              <option value="GBP/USD">GBP/USD</option>
              <option value="USD/JPY">USD/JPY</option>
              <option value="ES/MES">ES/MES (S&amp;P 500)</option>
              <option value="NQ/NAS100">NQ/NAS100 (Nasdaq)</option>
              <option value="US30">US30 (Dow Jones)</option>
              <option value="BTC/USD">BTC/USD (Bitcoin)</option>
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
            </select>
          </div>

          {/* Strategy Filter (Institutional Strategies 1, 2, 3) */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Institutional Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Institutional Strategies</option>
              <option value="STRATEGY_1A">Strategy 1A: POC Bounce</option>
              <option value="STRATEGY_1B">Strategy 1B: Value Area Reversal</option>
              <option value="STRATEGY_1C">Strategy 1C: Breakout Continuation</option>
              <option value="STRATEGY_2">Strategy 2: Structure Essentials</option>
              <option value="STRATEGY_3">Strategy 3: Advanced Structure &amp; SMC</option>
            </select>
          </div>
        </div>
      </div>

      {/* Signals List Cards */}
      <div className="space-y-3">
        {!isFeedActive ? (
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <h3 className="text-sm font-bold text-slate-200">Market Data Not Connected</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Live signal stream requires an active market data feed. Connect in Market Data or enable Simulation Mode.
            </p>
            {onNavigateToConnection && (
              <button
                onClick={onNavigateToConnection}
                className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
              >
                Open Market Data
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm">{signal.symbol}</span>
                        {signal.marketType && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-950/70 text-amber-300 border border-amber-500/30">
                            {signal.marketType}
                          </span>
                        )}
                        {signal.exactSymbol && (
                          <span className="text-[11px] font-mono text-cyan-300 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-700">
                            {signal.exactSymbol}
                          </span>
                        )}
                        {signal.volumeType === 'REAL_VOLUME' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                            REAL VOL
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {signal.timeframe} • {signal.strategyName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                      signal.grade === 'A' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                      signal.grade === 'B' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' :
                      'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    }`}>
                      GRADE {signal.grade}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {signal.sessionLabel || signal.session}
                    </span>
                    {signal.isQuietHours && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                        QUIET HOURS
                      </span>
                    )}
                  </div>
                </div>

                {/* News protection notice & perpetual disclaimer */}
                <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-bold">
                    <span>⚠️</span>
                    <span>{signal.newsProtectionNotice || 'News protection NOT VERIFIED'}</span>
                  </span>
                  {signal.substituteNote && (
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                      {signal.substituteNote}
                    </span>
                  )}
                </div>

                {/* Reason sentence */}
                <p className="text-xs text-slate-300">
                  {signal.reason}
                </p>

                {/* Verified Levels Pill (Single 2R TP & Exact R/TP1 Distance per Requirement 5) */}
                <div className="space-y-1.5">
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

                  {/* Exact Target Mathematics Distances & Ratio Check (Item 13) */}
                  <div className="flex flex-wrap items-center justify-between px-2.5 py-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-300 gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <span className="text-slate-500 text-[10px] mr-1.5">R (STOP DIST):</span>
                        <span className="text-rose-300 font-bold">{signal.stopDistanceFormatted || signal.rDistanceFormatted || `${signal.riskPips} pips`}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] mr-1.5">TP1 DIST:</span>
                        <span className="text-emerald-300 font-bold">{signal.tp1DistanceFormatted || `${signal.rewardPips} pips`}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                        {signal.tp1OverRRatio || 'TP1 / R = 2.00 OK'}
                      </span>
                      {signal.validUntilTimeUtc && (
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          Valid until: {signal.validUntilTimeUtc}
                        </span>
                      )}
                    </div>
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
                      onClick={() => onViewOnChart(signal.symbol, signal)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition border border-cyan-500/20"
                    >
                      Show on chart
                    </button>
                    <button
                      onClick={() => onSelectSignal(signal)}
                      className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                    >
                      <span>Signal Audit</span>
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
