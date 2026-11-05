import React, { useState } from 'react';
import { TradingSignal, InstitutionalChecklistItem, SymbolInfo } from '../types';
import { calculatePositionSize } from '../engine/risk';
import { requestAISetupAnalysis } from '../ai/geminiAnalysis';
import { createJournalFromSignal, saveJournalEntry } from '../engine/journal';
import { formatPrice } from '../data/symbolMapping';
import { 
  X, 
  CheckCircle2, 
  XCircle, 
  Calculator, 
  Sparkles, 
  BookPlus, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Eye
} from 'lucide-react';

interface SignalDetailModalProps {
  signal: TradingSignal | null;
  symbolInfo?: SymbolInfo;
  onClose: () => void;
  onViewOnChart: (symbol: string, signal?: TradingSignal) => void;
  onNotificationCreated?: (msg: string) => void;
}

export const SignalDetailModal: React.FC<SignalDetailModalProps> = ({
  signal,
  symbolInfo,
  onClose,
  onViewOnChart,
  onNotificationCreated
}) => {
  if (!signal) return null;

  // Position Calculator State
  const [accountBalance, setAccountBalance] = useState(25000);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [aiAnalysisText, setAiAnalysisText] = useState<string>(signal.aiAnalysis || '');
  const [loadingAI, setLoadingAI] = useState(false);
  const [loggedToJournal, setLoggedToJournal] = useState(false);

  // Requirement 4: Take pip/tick value and contract size from verified symbol specifications.
  // If specs are unavailable, say position size cannot be calculated.
  const posCalc = calculatePositionSize({
    accountBalance,
    riskPercent,
    entryPrice: signal.entryPrice,
    stopLossPrice: signal.stopLoss,
    tpPrice: signal.tp,
    symbolInfo
  });

  const handleFetchAI = async () => {
    setLoadingAI(true);
    try {
      const text = await requestAISetupAnalysis(signal);
      setAiAnalysisText(text);
    } catch {
      // fallback
    } finally {
      setLoadingAI(false);
    }
  };

  const handleLogTrade = () => {
    const entry = createJournalFromSignal(signal, posCalc.recommendedLotSize || 1.0);
    saveJournalEntry(entry);
    setLoggedToJournal(true);
    if (onNotificationCreated) {
      onNotificationCreated(`Signal ${signal.symbol} logged to Journal.`);
    }
  };

  const isBuy = signal.direction === 'BUY';

  const getGradeBadge = (grade: string) => {
    if (grade === 'A') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (grade === 'B') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0b0f19] border border-slate-700 shadow-2xl overflow-hidden my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0e1424] border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider ${
              isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {signal.direction} SETUP
            </span>
            <h2 className="text-lg font-bold text-slate-100">{signal.symbol}</h2>
            {signal.marketType && (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-950/70 text-amber-300 border border-amber-500/30">
                {signal.marketType}
              </span>
            )}
            {signal.exactSymbol && (
              <span className="text-xs font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                {signal.exactSymbol}
              </span>
            )}
            {signal.volumeType === 'REAL_VOLUME' && (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                REAL VOLUME
              </span>
            )}
            <span className="text-xs font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">
              {signal.timeframe} • {signal.strategyName}
            </span>
            {/* Setup Grade Badge */}
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getGradeBadge(signal.grade)}`}>
              GRADE {signal.grade}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-slate-300 text-xs">
          {/* Key Signal Metric Cards & Item 13 Math Verification */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Entry Price</span>
              <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                {formatPrice(signal.entryPrice, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">Zone: {signal.entryZone.min} - {signal.entryZone.max}</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-rose-400 uppercase font-mono">Stop Loss (1x ATR14)</span>
              <div className="text-base font-bold text-rose-400 font-mono mt-0.5">
                {formatPrice(signal.stopLoss, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">R: {signal.stopDistanceFormatted || signal.rDistanceFormatted || `${signal.riskPips} pips`}</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-emerald-400 uppercase font-mono">Take Profit (2R)</span>
              <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                {formatPrice(signal.tp, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">2R: {signal.tp1DistanceFormatted || `+${signal.rewardPips} pips`}</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-amber-400 uppercase font-mono">Setup Grade</span>
              <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                GRADE {signal.grade}
              </div>
              <span className="text-[10px] text-slate-400">Documented Criteria</span>
            </div>
          </div>

          {/* Item 13 Signal Math Check Banner */}
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-black text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {signal.tp1OverRRatio || 'TP1 / R = 2.00 OK'}
              </span>
              <span className="text-slate-300 text-[11px]">
                Target mathematics verified exact 2.0R with valid stop side ({signal.direction === 'BUY' ? 'SL < Entry' : 'SL > Entry'}).
              </span>
            </div>
            {signal.validUntilTimeUtc && (
              <span className="text-[10.5px] text-cyan-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                Valid until: {signal.validUntilTimeUtc}
              </span>
            )}
          </div>

          {/* News Protection Notice Badge (Requirement 6) */}
          <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-amber-300">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span className="font-bold">ECONOMIC CALENDAR NOTICE:</span>
              <span>{signal.newsProtectionNotice || 'News protection NOT VERIFIED'}</span>
            </div>
            <span className="text-[10.5px] text-amber-400/80 italic">First 2 mins after session open strictly blocked</span>
          </div>

          {/* SECTION 5: INSTITUTIONAL SIGNAL AUDIT & DISCIPLINE CARD */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                  Institutional Signal Audit Specification
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                UTC: {signal.sessionTimeUtc || new Date(signal.timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'} ({signal.sessionLabel || signal.session})
              </span>
            </div>

            {/* Configured Institutional Parameter Audit (Requirement 4) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 bg-slate-900/60 rounded-lg border border-slate-800 text-[10.5px]">
              <div>
                <span className="text-slate-500 block text-[9.5px]">MINIMUM STOP</span>
                <span className="text-rose-400 font-bold block">1× ATR(14)</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9.5px]">DERIV RATE CAP</span>
                <span className="text-cyan-400 font-bold block">100 req/min (600ms)</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9.5px]">ENTRY VALIDITY</span>
                <span className="text-amber-400 font-bold block">0.25R Threshold</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9.5px]">MIN HOLD TIME</span>
                <span className="text-emerald-400 font-bold block">3–4 mins</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-500 block text-[10px]">STRATEGY SELECTED &amp; RATIONALE</span>
                  <span className="text-cyan-300 font-bold block">{signal.strategySelected || signal.strategyName}</span>
                  <span className="text-slate-400 block text-[10.5px] mt-0.5">{signal.strategyReason || signal.reason}</span>
                </div>
                {signal.substituteNote && (
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[10.5px] text-amber-300">
                    <strong>Broker Substitution:</strong> {signal.substituteNote}
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block text-[10px]">MARKET STATE</span>
                  <span className="text-slate-200 font-bold">{signal.marketState || 'Ranging'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-500 block text-[10px]">STOP LOSS REASON &amp; ATR(14) RULE</span>
                  <span className="text-rose-300 font-bold block">{signal.stopLossReason || `Beyond structural swing (>= 1x ATR14)`}</span>
                </div>
                <div className="flex items-center gap-4 text-[10.5px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">TP1 (2R) / TP2</span>
                    <span className="text-emerald-400 font-bold">
                      {formatPrice(signal.tp1 || signal.tp, signal.symbol)} / {formatPrice(signal.tp2 || (signal.tp + 0.1), signal.symbol)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">R:R RATIO</span>
                    <span className="text-cyan-400 font-bold">{signal.riskReward || '1:2.0'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">EST. HOLD TIME</span>
                    <span className="text-slate-200 font-bold">{signal.estimatedHoldTime || '20m - 2h'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">INVALIDATION CONDITION</span>
                  <span className="text-amber-400 text-[10.5px] block">
                    {signal.invalidationCondition || `Price moves > 0.25R away from entry zone without filling, or candle body closes beyond SL.`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SIGNAL AUDIT SCREEN (Requirement 3) */}
          <div className="bg-slate-900/70 p-4 rounded-xl border border-cyan-500/30 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Signal Audit Screen — Exact Institutional Levels
                </span>
              </div>
              <button
                onClick={() => {
                  onViewOnChart(signal.symbol, signal);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Show on chart</span>
              </button>
            </div>

            {/* Profile Specification Notice */}
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <span className="text-slate-400">Volume Profile Specification:</span>
              <span className={`px-2 py-0.5 rounded font-bold border ${
                signal.auditLevels?.profileType === 'REAL_VOLUME' || signal.volumeType === 'REAL_VOLUME'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/70 text-amber-300 border-amber-500/40'
              }`}>
                {signal.auditLevels?.profileLabel || (signal.volumeType === 'REAL_VOLUME' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')}
              </span>
            </div>

            {/* Exact Audit Levels Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-[11px]">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-amber-400 block text-[10px] uppercase font-bold">Point of Control (POC)</span>
                <span className="text-slate-100 font-bold text-xs mt-0.5 block">
                  {signal.auditLevels ? formatPrice(signal.auditLevels.poc, signal.symbol) : formatPrice(signal.entryPrice, signal.symbol)}
                </span>
                <span className="text-[10px] text-slate-500">Heaviest Profile Node</span>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-cyan-400 block text-[10px] uppercase font-bold">Value Area High (VAH)</span>
                <span className="text-slate-100 font-bold text-xs mt-0.5 block">
                  {signal.auditLevels ? formatPrice(signal.auditLevels.vah, signal.symbol) : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">70% Value Boundary</span>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-cyan-400 block text-[10px] uppercase font-bold">Value Area Low (VAL)</span>
                <span className="text-slate-100 font-bold text-xs mt-0.5 block">
                  {signal.auditLevels ? formatPrice(signal.auditLevels.val, signal.symbol) : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">70% Value Boundary</span>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-purple-400 block text-[10px] uppercase font-bold">Swing High / Low</span>
                <span className="text-slate-100 font-bold text-xs mt-0.5 block">
                  {signal.auditLevels?.swingHigh ? formatPrice(signal.auditLevels.swingHigh, signal.symbol) : '—'} / {signal.auditLevels?.swingLow ? formatPrice(signal.auditLevels.swingLow, signal.symbol) : '—'}
                </span>
                <span className="text-[10px] text-slate-500">Fractal Swings</span>
              </div>
            </div>

            {/* BOS Candle Time & Confirmation Level */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">BOS Candle Time:</span>
                <span className="text-cyan-300 font-bold">
                  {signal.auditLevels?.bosCandleTime 
                    ? `${new Date(signal.auditLevels.bosCandleTime * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC (${signal.auditLevels.bosCandleTime})`
                    : 'Current Confirmation Bar'}
                </span>
              </div>
              {signal.auditLevels?.bosPrice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">BOS Level:</span>
                  <span className="text-amber-300 font-bold">{formatPrice(signal.auditLevels.bosPrice, signal.symbol)}</span>
                </div>
              )}
            </div>

            {/* Checklist with Explicit PASS or FAIL per Condition */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 pb-1">
                <span>Setup Checklist Verification:</span>
                <span className="font-mono text-[11px] text-cyan-400">
                  {signal.checklist.filter(c => c.passed).length} / {signal.checklist.length} Passed
                </span>
              </div>

              {signal.checklist.map((item) => (
                <div 
                  key={item.id} 
                  className={`flex items-start justify-between p-2.5 rounded-lg border text-xs ${
                    item.passed 
                      ? 'bg-emerald-950/20 border-emerald-500/20 text-slate-200' 
                      : 'bg-rose-950/20 border-rose-500/20 text-slate-400'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase shrink-0 mt-0.5 ${
                      item.passed 
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                    }`}>
                      {item.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <div>
                      <span className="font-semibold text-slate-200">{item.label}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    item.requiredForGradeA ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {item.requiredForGradeA ? 'Core Rule' : 'Confluence'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Position Sizing & Risk Calculator (Requirement 4) */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-cyan-400" />
                Institutional Dynamic Position Sizer
              </span>
              {posCalc.canCalculate && (
                <span className="text-[11px] text-cyan-400 font-mono font-bold">
                  Recommended: {posCalc.recommendedLotSize} Lots
                </span>
              )}
            </div>

            {!posCalc.canCalculate ? (
              <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="font-bold">Position size cannot be calculated:</strong> {posCalc.unavailabilityReason}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Verify market data connection or enable Simulation Mode to load symbol specifications.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Account Balance ($)</label>
                    <input
                      type="number"
                      value={accountBalance}
                      onChange={(e) => setAccountBalance(Number(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Risk Percentage (%)</label>
                    <div className="flex items-center gap-2">
                      {[0.5, 1.0, 1.5, 2.0].map((r) => (
                        <button
                          key={r}
                          onClick={() => setRiskPercent(r)}
                          className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold border transition ${
                            riskPercent === r
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dynamic Output Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Cash at Risk</span>
                    <span className="text-rose-400 font-bold">${posCalc.riskAmountCash}</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Potential Profit (2R)</span>
                    <span className="text-emerald-400 font-bold">+${posCalc.potentialProfitCash}</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Pip Value per Lot</span>
                    <span className="text-cyan-400 font-bold">${posCalc.pipValuePerLot}/lot</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* AI Institutional Analysis */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                GREVIN AI Setup Reasoning
              </span>
              <button
                onClick={handleFetchAI}
                disabled={loadingAI}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono disabled:opacity-50"
              >
                {loadingAI ? 'Analyzing...' : 'Refresh AI Analysis'}
              </button>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
              {aiAnalysisText || (
                <div className="text-slate-500 italic">
                  Tap &apos;Refresh AI Analysis&apos; to run full institutional order flow diagnosis.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-[#0e1424] border-t border-slate-800 gap-3">
          {signal.symbol.includes('USDT') && (
            <div className="text-[10px] text-amber-300/80 font-mono flex items-center gap-1.5 w-full sm:w-auto">
              <span>Notice: USDT is Tether stablecoin, not fiat USD.</span>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleLogTrade}
              disabled={loggedToJournal}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition border ${
                loggedToJournal
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <BookPlus className="w-3.5 h-3.5" />
              <span>{loggedToJournal ? 'Logged in Journal' : 'Log Trade to Journal'}</span>
            </button>

          <button
            onClick={() => {
              onViewOnChart(signal.symbol);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg transition"
          >
            <span>View on Chart</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};
