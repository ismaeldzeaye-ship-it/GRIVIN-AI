import React from 'react';
import { SymbolInfo, TradingSignal, MarketSessionType } from '../types';
import { SUPPORTED_SYMBOLS, formatPrice } from '../data/symbolMapping';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Flame, 
  ChevronRight,
  Target,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface DashboardViewProps {
  signals: TradingSignal[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onSelectSignal: (signal: TradingSignal) => void;
  currentSession: {
    session: MarketSessionType;
    label: string;
    isOverlap: boolean;
    dstStatus: { usDST: boolean; ukDST: boolean };
  };
  livePrices: Record<string, { bid: number; ask: number }>;
  isConnected: boolean;
  isSimulation: boolean;
  onNavigateToConnection: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  signals,
  selectedSymbol,
  onSelectSymbol,
  onSelectSignal,
  currentSession,
  livePrices,
  isConnected,
  isSimulation,
  onNavigateToConnection
}) => {
  const symbols = Object.values(SUPPORTED_SYMBOLS);
  const isFeedActive = isConnected || isSimulation;

  return (
    <div className="space-y-6">
      {/* Top Session & Market Regime Banner */}
      <div className="bg-gradient-to-r from-[#0d1424] via-[#090d16] to-[#0d1424] p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs uppercase font-mono font-bold tracking-wider text-cyan-400">
                Institutional Regime: High Liquidity
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              GREVIN AI Institutional Terminal
            </h1>
            <p className="text-xs text-slate-400">
              Real-time Point of Control (POC), 70% Value Area auctions, and Smart Money order flow sweeps.
            </p>
          </div>

          {/* Session Timeline Visual */}
          <div className="flex flex-col gap-1.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs font-mono">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>ACTIVE SESSION</span>
              <span className="text-cyan-400 font-bold">{currentSession.label}</span>
            </div>
            {/* Visual Bar */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
              <div className="w-1/4 h-full bg-sky-500/60" title="Asia 00-08 UTC"></div>
              <div className="w-1/3 h-full bg-purple-500/80" title="London 07-15:30 UTC"></div>
              <div className="w-1/4 h-full bg-rose-500 animate-pulse" title="London/NY Overlap 12-15:30 UTC"></div>
              <div className="w-1/6 h-full bg-amber-500/80" title="New York Close 15:30-21 UTC"></div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>00:00 UTC (Tokyo)</span>
              <span>12:00 (Overlap)</span>
              <span>21:00 (NY Close)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Market Watchlist Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Institutional Watchlist &amp; Live Feeds
          </h2>
          <span className="text-xs text-slate-500 font-mono">Updated tick-by-tick</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {symbols.map((sym) => {
            const isSelected = selectedSymbol === sym.symbol;
            const live = livePrices[sym.symbol] || { bid: sym.currentBid, ask: sym.currentAsk };
            const isPositive = sym.dayChangePercent >= 0;

            return (
              <div
                key={sym.symbol}
                onClick={() => onSelectSymbol(sym.symbol)}
                className={`cursor-pointer p-4 rounded-xl border transition group relative overflow-hidden ${
                  isSelected
                    ? 'bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                    : 'bg-[#0b0f19] border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-100 text-sm">{sym.symbol}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {sym.category}
                    </span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs font-mono font-bold ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>{isPositive ? '+' : ''}{sym.dayChangePercent}%</span>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline justify-between font-mono">
                  <div>
                    <span className="text-xs text-slate-500 block">BID</span>
                    <span className="text-base font-bold text-slate-100">{formatPrice(live.bid, sym.symbol)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">ASK</span>
                    <span className="text-sm font-semibold text-slate-300">{formatPrice(live.ask, sym.symbol)}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Spread: <strong className="text-amber-300">{sym.spreadPips} pips</strong></span>
                  <span className="group-hover:text-cyan-400 transition flex items-center gap-0.5">
                    Open Chart <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active High-Probability Signals Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Verified Institutional Setups
            </h2>
          </div>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/20">
            {signals.length} ACTIVE SETUPS
          </span>
        </div>

        {!isFeedActive ? (
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-rose-400 mx-auto flex items-center justify-center font-bold">
              !
            </div>
            <h3 className="text-sm font-bold text-slate-200">cTrader Not Connected</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No live signals are generated without a verified cTrader connection. Connect your credentials in Market Data or toggle Simulation Mode to preview institutional setups.
            </p>
            <button
              onClick={onNavigateToConnection}
              className="mt-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
            >
              Configure cTrader Connection
            </button>
          </div>
        ) : signals.length === 0 ? (
          <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
            No active setups currently meeting strict Grade A/B criteria. Monitoring candle closes...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.map((sig) => {
              const isBuy = sig.direction === 'BUY';
              return (
                <div
                  key={sig.id}
                  className="bg-[#0b0f19] border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-xl flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase font-mono ${
                          isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {sig.direction}
                        </span>
                        <span className="font-bold text-slate-100 text-sm">{sig.symbol}</span>
                      </div>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                        sig.grade === 'A' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                        sig.grade === 'B' ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' :
                        'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      }`}>
                        GRADE {sig.grade}
                      </span>
                    </div>

                    <div className="mt-2 text-xs font-medium text-slate-300">
                      {sig.strategyName}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                      {sig.reason}
                    </p>
                  </div>

                  {/* Price targets pill */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-center">
                    <div>
                      <span className="text-slate-500 block text-[9.5px]">ENTRY</span>
                      <span className="text-cyan-400 font-bold">{formatPrice(sig.entryPrice, sig.symbol)}</span>
                    </div>
                    <div>
                      <span className="text-rose-500 block text-[9.5px]">SL ({sig.riskPips}p)</span>
                      <span className="text-rose-400 font-bold">{formatPrice(sig.stopLoss, sig.symbol)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-500 block text-[9.5px]">TP (2R)</span>
                      <span className="text-emerald-400 font-bold">{formatPrice(sig.tp, sig.symbol)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Session: {sig.session}
                    </span>
                    <button
                      onClick={() => onSelectSignal(sig)}
                      className="flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition"
                    >
                      <span>Inspect Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
