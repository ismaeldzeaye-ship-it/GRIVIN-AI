import React, { useState } from 'react';
import { runGREVINUnitTests, TestResult } from '../engine/__tests__/verification';
import { playSignalChime } from '../notifications/audioAlerts';
import { 
  X, 
  Clock, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Sliders, 
  Volume2, 
  TestTube, 
  Check, 
  AlertCircle
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  timezone: string;
  onChangeTimezone: (tz: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  timezone,
  onChangeTimezone,
  soundEnabled,
  onToggleSound
}) => {
  const [testResults, setTestResults] = useState<{ passed: boolean; results: TestResult[] } | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  const handleRunTests = () => {
    setRunningTests(true);
    setTimeout(() => {
      const res = runGREVINUnitTests();
      setTestResults(res);
      setRunningTests(false);
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0b0f19] border border-slate-700 shadow-2xl p-6 text-xs text-slate-300 space-y-5 my-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-bold text-slate-100">GREVIN AI System Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Timezone & Session Definitions */}
        <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            Timezone &amp; Market Session Hours
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Display Timezone</label>
              <select
                value={timezone}
                onChange={(e) => onChangeTimezone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
              >
                <option value="UTC">UTC (Institutional Standard)</option>
                <option value="America/New_York">New York (EST/EDT)</option>
                <option value="Europe/London">London (GMT/BST)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Europe/Paris">Frankfurt/Paris (CET)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Audio Feedback Chimes</label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onToggleSound}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    soundEnabled ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{soundEnabled ? 'Enabled' : 'Muted'}</span>
                </button>
                <button
                  onClick={() => playSignalChime('BUY')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Test Chime
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="font-semibold text-slate-300">Standard Institutional Session Windows:</div>
            <div>• Asian Session: 00:00 - 08:00 UTC (Tokyo/Sydney)</div>
            <div>• London Session: 07:00 - 15:30 UTC (UK BST) / 08:00 - 16:30 UTC (UK GMT)</div>
            <div>• New York Session: 12:00 - 20:30 UTC (US EDT) / 13:00 - 21:30 UTC (US EST)</div>
            <div className="text-cyan-400 font-bold">• Peak Overlap: 12:00 - 15:30 UTC (Maximum Institutional Flow)</div>
          </div>
        </div>

        {/* Built-in Unit Tests Runner (Section 18 Quality & Security) */}
        <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <TestTube className="w-3.5 h-3.5 text-purple-400" />
              Engine Unit Verification Suite (Quality &amp; Math)
            </h4>
            <button
              onClick={handleRunTests}
              disabled={runningTests}
              className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold transition flex items-center gap-1 disabled:opacity-50"
            >
              <span>{runningTests ? 'Executing...' : 'Run Unit Tests'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            Verifies volume-profile math (POC and 70% Value Area), market-session boundaries with daylight-saving changes, fractal swing detection, BOS/CHoCH detection, and risk position sizing.
          </p>

          {testResults && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className={`p-2 rounded font-mono font-bold flex items-center justify-between ${
                testResults.passed ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400'
              }`}>
                <span>TEST SUITE STATUS:</span>
                <span>{testResults.passed ? 'ALL 5 SUITES PASSED (100%)' : 'SOME TESTS FAILED'}</span>
              </div>

              {testResults.results.map((r, idx) => (
                <div key={idx} className="p-2 bg-slate-950 rounded border border-slate-800 flex items-start gap-2">
                  {r.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-200">{r.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{r.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
