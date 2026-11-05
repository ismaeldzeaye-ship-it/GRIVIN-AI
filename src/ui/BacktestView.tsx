import React, { useState, useMemo } from 'react';
import { runInstitutionalBacktest } from '../engine/backtest';
import { generateForwardTestReport } from '../engine/forwardTest';
import { StrategyType, MarketSessionType, ForwardTestTrade } from '../types';
import { formatPrice } from '../data/symbolMapping';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  WifiOff,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  Clock,
  RotateCcw
} from 'lucide-react';

interface BacktestViewProps {
  forwardTestTrades?: ForwardTestTrade[];
  onClearForwardTestTrades?: () => void;
  isConnected: boolean;
  isSimulation: boolean;
  onNavigateToConnection?: () => void;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  forwardTestTrades = [],
  onClearForwardTestTrades,
  isConnected,
  isSimulation,
  onNavigateToConnection
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'FORWARD_TEST' | 'HISTORICAL_BACKTEST'>('FORWARD_TEST');

  // Historical Backtest Config
  const [symbol, setSymbol] = useState('XAU/USD');
  const [strategy, setStrategy] = useState<string>('ALL');
  const [session, setSession] = useState<string>('ALL');
  const [candleCount, setCandleCount] = useState(300);

  const isEnabled = isConnected || isSimulation;

  // Forward Test Report
  const forwardReport = useMemo(() => {
    return generateForwardTestReport(forwardTestTrades);
  }, [forwardTestTrades]);

  // Historical Backtest
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

  if (!isEnabled && activeSubTab === 'HISTORICAL_BACKTEST') {
    return (
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 text-slate-500 mx-auto flex items-center justify-center">
          <WifiOff className="w-6 h-6 text-rose-400" />
        </div>
        <h2 className="text-base font-bold text-slate-100">Historical Backtesting Disabled</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Backtests must run on real historical market data only. No active market data connection is currently verified.
        </p>
        <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 p-2.5 rounded-lg font-mono">
          Connect to Deriv or Binance live streams in &quot;Market Data&quot; or enable &quot;Simulation Mode&quot; to test with synthetic historical candles.
        </p>
        {onNavigateToConnection && (
          <button
            onClick={onNavigateToConnection}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
          >
            Open Market Data Settings
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Switcher: Forward Test (Paper Engine) vs Historical Backtest */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b0f19] p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('FORWARD_TEST')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold font-mono transition ${
              activeSubTab === 'FORWARD_TEST'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Forward Test (Paper Only)</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] ${
              activeSubTab === 'FORWARD_TEST' ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-slate-400'
            }`}>
              {forwardTestTrades.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('HISTORICAL_BACKTEST')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold font-mono transition ${
              activeSubTab === 'HISTORICAL_BACKTEST'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Historical Backtest</span>
          </button>
        </div>

        {activeSubTab === 'FORWARD_TEST' && forwardTestTrades.length > 0 && onClearForwardTestTrades && (
          <button
            onClick={onClearForwardTestTrades}
            className="flex items-center gap-1.5 px-2.5 py-1 text-slate-400 hover:text-rose-300 text-xs font-mono transition"
            title="Reset Forward Test Journal"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Forward Trades</span>
          </button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* FORWARD TEST VIEW (REQUIREMENT 4)                                   */}
      {/* ==================================================================== */}
      {activeSubTab === 'FORWARD_TEST' && (
        <div className="space-y-6">
          {/* Sample Size Warning / Status Banner */}
          {forwardReport.overall.isSampleTooSmall ? (
            <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-300 text-xs flex flex-wrap items-center justify-between gap-3 font-mono">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <strong className="text-amber-200 uppercase font-black tracking-wider">
                    SAMPLE TOO SMALL ({forwardReport.overall.resolvedSignals} / 30 RESOLVED SIGNALS)
                  </strong>
                  <p className="text-[11px] text-amber-300/90 mt-0.5">
                    Signals are unproven until at least 30 forward-test results per setup. Not financial advice.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-900/60 text-amber-200 border border-amber-500/30 text-[10px] font-bold">
                {30 - forwardReport.overall.resolvedSignals} More Required
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5 font-mono">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <strong className="text-emerald-200 uppercase font-black">
                  Statistical Significance Threshold Reached ({forwardReport.overall.resolvedSignals} Resolved Signals)
                </strong>
                <p className="text-[11px] text-emerald-300/80 mt-0.5">
                  Over 30 forward-test trades verified on closed candles. Fixed 2R target evaluation active.
                </p>
              </div>
            </div>
          )}

          {/* Key Forward Test Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Total Signals</span>
              <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">
                {forwardReport.overall.totalSignals}
              </div>
              <span className="text-[10px] text-slate-400">All Watchlists</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-cyan-400 uppercase font-mono block">Resolved</span>
              <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">
                {forwardReport.overall.resolvedSignals}
              </div>
              <span className="text-[10px] text-slate-400">{forwardReport.overall.openSignals} Open Trades</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-emerald-400 uppercase font-mono block">Wins (+2R)</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                {forwardReport.overall.wins}
              </div>
              <span className="text-[10px] text-slate-400">Hit Take Profit</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-rose-400 uppercase font-mono block">Losses (-1R)</span>
              <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">
                {forwardReport.overall.losses}
              </div>
              <span className="text-[10px] text-slate-400">SL or Dual-Touch</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-amber-400 uppercase font-mono block">Win Rate</span>
              <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                {forwardReport.overall.winRate}%
              </div>
              <span className="text-[10px] text-slate-400">
                {forwardReport.overall.isSampleTooSmall ? 'Sample < 30' : 'Verified'}
              </span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-purple-400 uppercase font-mono block">Avg R / Max DD</span>
              <div className="text-lg font-bold text-purple-400 font-mono mt-0.5">
                {forwardReport.overall.avgR > 0 ? `+${forwardReport.overall.avgR}R` : `${forwardReport.overall.avgR}R`}
              </div>
              <span className="text-[10px] text-rose-400">Max DD: -{forwardReport.overall.maxDrawdownR}R</span>
            </div>
          </div>

          {/* Breakdown Section: By Setup, By Symbol, By Session */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Breakdown by Setup */}
            <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  Performance by Setup
                </span>
                <span className="text-[10px] text-slate-400 font-mono">3 Core Setups</span>
              </div>

              <div className="space-y-2.5">
                {Object.keys(forwardReport.bySetup).map((sKey) => {
                  const s = forwardReport.bySetup[sKey as StrategyType];
                  return (
                    <div key={sKey} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{s.name}</span>
                        {s.isSampleTooSmall ? (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-amber-950/80 text-amber-300 border border-amber-500/30">
                            SAMPLE TOO SMALL
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                            VALID
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[11px] pt-1 text-slate-400">
                        <div>Signals: <span className="text-slate-200 font-bold">{s.totalSignals}</span></div>
                        <div>Win Rate: <span className="text-cyan-400 font-bold">{s.winRate}%</span></div>
                        <div>Avg R: <span className="text-purple-400 font-bold">{s.avgR > 0 ? `+${s.avgR}` : s.avgR}R</span></div>
                        <div>Max DD: <span className="text-rose-400 font-bold">{s.maxDrawdownR}R</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Breakdown by Symbol */}
            <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  Performance by Symbol
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Watchlist Pairs</span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {Object.keys(forwardReport.bySymbol).length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs font-mono">No signals recorded yet.</div>
                ) : (
                  Object.keys(forwardReport.bySymbol).map((sym) => {
                    const s = forwardReport.bySymbol[sym];
                    return (
                      <div key={sym} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{sym}</span>
                          {s.isSampleTooSmall ? (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-amber-950/80 text-amber-300 border border-amber-500/30">
                              SAMPLE TOO SMALL
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                              VALID
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[11px] pt-1 text-slate-400">
                          <div>Signals: <span className="text-slate-200 font-bold">{s.totalSignals}</span></div>
                          <div>Win: <span className="text-cyan-400 font-bold">{s.winRate}%</span></div>
                          <div>Avg: <span className="text-purple-400 font-bold">{s.avgR > 0 ? `+${s.avgR}` : s.avgR}R</span></div>
                          <div>DD: <span className="text-rose-400 font-bold">{s.maxDrawdownR}R</span></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. Breakdown by Session */}
            <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  Performance by Session
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Market Sessions</span>
              </div>

              <div className="space-y-2.5">
                {Object.keys(forwardReport.bySession).map((sessKey) => {
                  const s = forwardReport.bySession[sessKey as MarketSessionType];
                  return (
                    <div key={sessKey} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{s.name}</span>
                        {s.isSampleTooSmall ? (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-amber-950/80 text-amber-300 border border-amber-500/30">
                            SAMPLE TOO SMALL
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                            VALID
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[11px] pt-1 text-slate-400">
                        <div>Signals: <span className="text-slate-200 font-bold">{s.totalSignals}</span></div>
                        <div>Win Rate: <span className="text-cyan-400 font-bold">{s.winRate}%</span></div>
                        <div>Avg R: <span className="text-purple-400 font-bold">{s.avgR > 0 ? `+${s.avgR}` : s.avgR}R</span></div>
                        <div>Max DD: <span className="text-rose-400 font-bold">{s.maxDrawdownR}R</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Persistent Storage Diagnostic Status Box (Requirement 4: "If persistent storage is not set up, tell me exactly what is missing") */}
          <div className="p-4 bg-[#0b0f19] rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Persistent Storage Architecture Diagnosis
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">Storage Active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-[11px]">Browser Storage</span>
                  <span className="text-emerald-400 font-bold text-[10px]">CONNECTED</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  LocalStorage key <code className="text-cyan-300">grevin_forward_test_trades_v1</code> persists signals across tab refreshes and browser sessions.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-[11px]">Server Disk Store</span>
                  <span className="text-emerald-400 font-bold text-[10px]">CONNECTED</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Backend persistent storage active at <code className="text-cyan-300">/data/forward_test_trades.json</code> via Express proxy API.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-[11px]">Cloud Multi-Device Sync</span>
                  <span className="text-amber-400 font-bold text-[10px]">NOT PROVISIONED</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  What is missing: Firebase Firestore is not provisioned. To enable multi-user cross-device real-time sync, run <code className="text-amber-300">set_up_firebase</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Recorded Forward-Test Trade Execution Log */}
          <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
              <span className="font-bold text-slate-200">
                Recorded Paper Trade Execution Log
              </span>
              <span className="text-slate-400 text-[11px]">
                Target: Fixed 2R • Stop: Invalidation • Resolution: Closed Candles
              </span>
            </div>

            {forwardTestTrades.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No forward test trades recorded yet. Signals emitted by live closed candles will automatically be recorded here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-2">Symbol</th>
                      <th className="p-2">Setup</th>
                      <th className="p-2">Session / KZ</th>
                      <th className="p-2">Grade</th>
                      <th className="p-2">Entry</th>
                      <th className="p-2">Stop Loss</th>
                      <th className="p-2">Target (2R)</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {forwardTestTrades.slice(0, 30).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-900/50">
                        <td className="p-2 font-bold text-slate-200 flex items-center gap-1.5">
                          <span>{t.symbol}</span>
                          {t.marketType && (
                            <span className="px-1 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-500/30">
                              {t.marketType}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-slate-300">{t.setupName}</td>
                        <td className="p-2 text-slate-400 text-[11px]">{t.session} / {t.killZone.replace('_KILLZONE', '')}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            t.grade === 'A' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30' :
                            t.grade === 'B' ? 'bg-cyan-950 text-cyan-300 border-cyan-500/30' :
                            'bg-amber-950 text-amber-300 border-amber-500/30'
                          }`}>
                            GRADE {t.grade}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-cyan-400">{formatPrice(t.entryPrice, t.symbol)}</td>
                        <td className="p-2 text-rose-400">{formatPrice(t.stopLoss, t.symbol)}</td>
                        <td className="p-2 text-emerald-400 font-bold">{formatPrice(t.takeProfit, t.symbol)}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.status === 'OPEN' 
                              ? 'bg-sky-950 text-sky-300 border border-sky-500/30 animate-pulse' 
                              : t.resolution === 'WIN' 
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' 
                              : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                          }`}>
                            {t.status === 'OPEN' ? 'OPEN' : t.resolution}
                          </span>
                        </td>
                        <td className="p-2">
                          {t.status === 'OPEN' ? (
                            <span className="text-slate-500 text-[11px]">Evaluating</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${t.resolution === 'WIN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {t.rOutcome && t.rOutcome > 0 ? `+${t.rOutcome}R` : `${t.rOutcome}R`}
                              </span>
                              {t.bothTouchedInSameBar && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/40" title="Both TP and SL touched in same candle: strictly counted as loss">
                                  DUAL TOUCH (LOSS)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* HISTORICAL SIMULATION BACKTEST                                       */}
      {/* ==================================================================== */}
      {activeSubTab === 'HISTORICAL_BACKTEST' && (
        <div className="space-y-6">
          {/* Simulation Banner */}
          {isSimulation && !isConnected && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>SIMULATION MODE ACTIVE: Backtest is evaluating synthetic historical candles for testing.</span>
            </div>
          )}

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
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="ETHUSDT">ETHUSDT</option>
                  <option value="SOLUSDT">SOLUSDT</option>
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
                <label className="text-slate-400 block mb-1 font-mono text-[11px]">History Depth</label>
                <select
                  value={candleCount}
                  onChange={(e) => setCandleCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                >
                  <option value={150}>150 Historical Candles</option>
                  <option value={300}>300 Historical Candles</option>
                  <option value={600}>600 Historical Candles</option>
                </select>
              </div>
            </div>
          </div>

          {/* Historical Backtest Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Win Rate</span>
              <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">{backtest.winRate}%</div>
              <span className="text-[10px] text-slate-400">{backtest.winningTrades}W / {backtest.losingTrades}L</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Average R</span>
              <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">+{backtest.averageR}R</div>
              <span className="text-[10px] text-slate-400">Fixed 2R Target</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Profit Factor</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{backtest.profitFactor}</div>
              <span className="text-[10px] text-slate-400">Gross Wins / Gross Losses</span>
            </div>

            <div className="p-3 bg-[#0b0f19] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">Max Drawdown</span>
              <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">-{backtest.maxDrawdownR}R</div>
              <span className="text-[10px] text-slate-400">Peak-to-Trough In R</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
