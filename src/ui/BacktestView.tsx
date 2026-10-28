import React, { useState, useMemo } from 'react';
import { runInstitutionalBacktest } from '../engine/backtest';
import { StrategyType, MarketSessionType } from '../types';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  Lock,
  WifiOff,
  Activity
} from 'lucide-react';

interface BacktestViewProps {
  isConnected: boolean;
  isSimulation: boolean;
  onNavigateToConnection?: () => void;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  isConnected,
  isSimulation,
  onNavigateToConnection
}) => {
  const [symbol, setSymbol] = useState('XAU/USD');
  const [strategy, setStrategy] = useState<string>('ALL');
  const [session, setSession] = useState<string>('ALL');
  const [candleCount, setCandleCount] = useState(300);

  // Requirement 1: Backtests must run on real historical cTrader data only, and be disabled otherwise.
  const isEnabled = isConnected || isSimulation;

  const backtest = useMemo(() => {
    if (!isEnabled) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakEvenTrades: 0,
        winRate: 0,
        averageR: 0,
        profitFactor: 0,
        maxDrawdownR: 0,
        equityCurve: [],
        breakdownByStrategy: {} as any,
        breakdownBySession: {} as any,
        breakdownBySymbol: {} as any
      };
    }
    return runInstitutionalBacktest(
      symbol,
      strategy === 'ALL' ? undefined : (strategy as StrategyType),
      session === 'ALL' ? undefined : (session as MarketSessionType),
      candleCount
    );
  }, [isEnabled, symbol, strategy, session, candleCount]);

  if (!isEnabled) {
    return (
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 text-slate-500 mx-auto flex items-center justify-center">
          <WifiOff className="w-6 h-6 text-rose-400" />
        </div>
        <h2 className="text-base font-bold text-slate-100">Historical Backtesting Disabled</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Backtests must run on real historical cTrader data only. No active cTrader connection is currently verified.
        </p>
        <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 p-2.5 rounded-lg font-mono">
          To run backtests, connect your cTrader account credentials in &quot;Market Data&quot; or enable &quot;Simulation Mode&quot; to test with synthetic historical candles.
        </p>
        {onNavigateToConnection && (
          <button
            onClick={onNavigateToConnection}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
          >
            Configure cTrader Connection
          </button>
        )}
      </div>
    );
  }

  // Equity Curve SVG calculation
  const curvePoints = backtest.equityCurve;
  const maxR = Math.max(...curvePoints.map(p => p.equityR), 5);
  const minR = Math.min(...curvePoints.map(p => p.equityR), -2);
  const rangeR = maxR - minR || 1;

  const svgWidth = 800;
  const svgHeight = 220;
  const padX = 40;
  const padY = 25;

  const getX = (idx: number) => {
    if (curvePoints.length <= 1) return padX;
    return padX + (idx / (curvePoints.length - 1)) * (svgWidth - padX * 2);
  };

  const getY = (valR: number) => {
    return svgHeight - padY - ((valR - minR) / rangeR) * (svgHeight - padY * 2);
  };

  const pathD = curvePoints.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.equityR);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  return (
    <div className="space-y-6">
      {/* Simulation / Data Source Banner */}
      {isSimulation && !isConnected && (
        <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>SIMULATION MODE ACTIVE: Backtest is evaluating synthetic historical candles for testing.</span>
        </div>
      )}

      {/* Disclaimer Banner */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2.5">
        <ShieldAlert className="w-4 h-4 shrink-0 text-cyan-400" />
        <div>
          <strong className="font-bold text-slate-200">Historical Performance Simulation Disclaimer:</strong> Backtested results reflect quantitative rule evaluation over historical candles. Historical performance is strictly analytical and not predictive of future market results.
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">Institutional Strategy Backtester</h2>
          </div>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded border border-cyan-800">
            {backtest.totalTrades} Executed Trades Analyzed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-mono text-[11px]">Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="XAU/USD">XAU/USD (Gold)</option>
              <option value="EUR/USD">EUR/USD</option>
              <option value="GBP/USD">GBP/USD</option>
              <option value="US30">US30 (Dow Jones)</option>
              <option value="NAS100">NAS100 (Nasdaq)</option>
              <option value="US100">US100</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-mono text-[11px]">Strategy (3 Core Setups)</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All 3 Setups</option>
              <option value="POC_BOUNCE">Previous Session POC Bounce</option>
              <option value="VALUE_AREA_REVERSAL">70% Value Area Reversal</option>
              <option value="CONFIRMED_BREAKOUT">Value Area Breakout &amp; BOS</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-mono text-[11px]">Session</label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Sessions</option>
              <option value="LONDON_NY_OVERLAP">London / NY Overlap</option>
              <option value="LONDON">London Session</option>
              <option value="NEW_YORK">New York Session</option>
              <option value="ASIAN">Asian Session</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-mono text-[11px]">Historical Horizon</label>
            <select
              value={candleCount}
              onChange={(e) => setCandleCount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value={150}>150 Bars (M15)</option>
              <option value={300}>300 Bars (M15)</option>
              <option value={500}>500 Bars (M15)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 shadow">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Win Rate (2R Target)</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">
            {backtest.winRate}%
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {backtest.winningTrades}W - {backtest.losingTrades}L
          </span>
        </div>

        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 shadow">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Average R Outcome</span>
          <div className="text-xl sm:text-2xl font-black text-cyan-400 font-mono mt-1">
            +{backtest.averageR} R
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Per verified setup</span>
        </div>

        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 shadow">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Profit Factor</span>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-1">
            {backtest.profitFactor}x
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Gross Gain / Loss</span>
        </div>

        <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 shadow">
          <span className="text-[10px] text-slate-400 uppercase font-mono">Max Drawdown</span>
          <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono mt-1">
            -{backtest.maxDrawdownR} R
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Peak to valley</span>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Cumulative Equity Curve (R-Multiples)
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            Final Equity: +{curvePoints[curvePoints.length - 1]?.equityR || 0} R
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-52 bg-slate-950/80 rounded-xl border border-slate-800">
            <line
              x1={padX}
              y1={getY(0)}
              x2={svgWidth - padX}
              y2={getY(0)}
              stroke="#334155"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text x={padX - 8} y={getY(0) + 4} fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">0R</text>

            <path
              d={pathD}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {curvePoints.map((pt, i) => (
              <circle
                key={i}
                cx={getX(i)}
                cy={getY(pt.equityR)}
                r="3"
                fill={pt.equityR >= 0 ? '#10b981' : '#f43f5e'}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};
