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
  ArrowRight
} from 'lucide-react';

interface SignalDetailModalProps {
  signal: TradingSignal | null;
  symbolInfo?: SymbolInfo;
  onClose: () => void;
  onViewOnChart: (symbol: string) => void;
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

  // Requirement 4: Take pip/tick value and contract size from cTrader symbol data.
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
          {/* Key Signal Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Entry Price</span>
              <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                {formatPrice(signal.entryPrice, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">Zone: {signal.entryZone.min} - {signal.entryZone.max}</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-rose-400 uppercase font-mono">Stop Loss</span>
              <div className="text-base font-bold text-rose-400 font-mono mt-0.5">
                {formatPrice(signal.stopLoss, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">{signal.riskPips} pips risk</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-emerald-400 uppercase font-mono">Take Profit (2R)</span>
              <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                {formatPrice(signal.tp, signal.symbol)}
              </div>
              <span className="text-[10px] text-slate-400">+{signal.rewardPips} pips (2.0R)</span>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] text-amber-400 uppercase font-mono">Setup Grade</span>
              <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                GRADE {signal.grade}
              </div>
              <span className="text-[10px] text-slate-400">Documented Criteria</span>
            </div>
          </div>

          {/* Institutional Checklist */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                Documented Setup Checklist (Grade {signal.grade})
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {signal.checklist.filter(c => c.passed).length} / {signal.checklist.length} Conditions Met
              </span>
            </div>

            <div className="space-y-2">
              {signal.checklist.map((item) => (
                <div 
                  key={item.id} 
                  className={`flex items-start justify-between p-2 rounded-lg border text-xs ${
                    item.passed 
                      ? 'bg-emerald-950/20 border-emerald-500/20 text-slate-200' 
                      : 'bg-rose-950/20 border-rose-500/20 text-slate-400'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold">{item.label}</span>
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
                cTrader Dynamic Position Sizer
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
                    Connect cTrader with a verified account or enable Simulation Mode to load symbol specifications.
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
  );
};
