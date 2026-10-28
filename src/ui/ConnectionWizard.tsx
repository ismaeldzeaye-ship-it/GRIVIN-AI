import React, { useState } from 'react';
import { CTraderConfig } from '../types';
import { 
  Wifi, 
  WifiOff,
  Key, 
  Activity, 
  RotateCcw, 
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sliders
} from 'lucide-react';

interface ConnectionWizardProps {
  config: CTraderConfig;
  onUpdateConfig: (newConfig: CTraderConfig) => void;
  onTestConnection: () => Promise<boolean>;
  onToggleSimulationMode: (enabled: boolean) => void;
  onSimulateStaleFeed: () => void;
}

export const ConnectionWizard: React.FC<ConnectionWizardProps> = ({
  config,
  onUpdateConfig,
  onTestConnection,
  onToggleSimulationMode,
  onSimulateStaleFeed
}) => {
  const [formData, setFormData] = useState<CTraderConfig>({ ...config });
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleTest = async () => {
    if (!formData.clientId || !formData.clientSecret || !formData.accessToken) {
      setStatusMessage('Please enter your cTrader Client ID, Client Secret, and Access Token first.');
      return;
    }
    setTesting(true);
    setStatusMessage('Initiating TLS handshake with cTrader Open API endpoint...');
    try {
      const ok = await onTestConnection();
      if (ok) {
        setStatusMessage(`Connection verified! Real measured latency: ${config.latencyMs !== null ? `${config.latencyMs}ms` : 'verified'}.`);
      } else {
        setStatusMessage('cTrader connection attempt failed. Verify your Client ID and Access Token.');
      }
    } catch (e: any) {
      setStatusMessage(`Connection error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onUpdateConfig(formData);
    setStatusMessage('cTrader configuration credentials saved.');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              config.connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {config.connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>cTrader Open API Setup Wizard</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  config.connected 
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                }`}>
                  {config.connected ? 'VERIFIED CONNECTED' : 'cTrader Not Connected'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Direct integration with Spotware cTrader Open API v2 for real-time tick execution and account symbol mapping.
              </p>
            </div>
          </div>

          {/* SIMULATION MODE TOGGLE (Requirement 1: Off by default, clearly labelled) */}
          <div className="p-3 bg-slate-950 rounded-xl border border-amber-500/30 flex items-center gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-amber-300 block">SIMULATION MODE</span>
              <span className="text-[10px] text-slate-400 block">Isolated synthetic market data</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.simulationMode}
                onChange={(e) => onToggleSimulationMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Connection Monitor Card */}
      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Connection Telemetry (Real Measured Values)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">ENVIRONMENT</span>
            <span className="text-cyan-400 font-bold text-sm">{formData.environment}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">MEASURED LATENCY</span>
            <span className="text-slate-200 font-bold text-sm">
              {config.connected && config.latencyMs !== null ? (
                <span className="text-emerald-400">{config.latencyMs} ms</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">HEARTBEAT WATCHDOG</span>
            <span className="text-slate-200 font-bold text-sm">
              {config.connected ? (
                config.isStale ? <span className="text-rose-400">STALE FEED</span> : <span className="text-emerald-400">ACTIVE</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">MODE</span>
            <span className="font-bold text-sm">
              {config.simulationMode ? (
                <span className="text-amber-400">SIMULATION</span>
              ) : config.connected ? (
                <span className="text-emerald-400">LIVE CTRADER</span>
              ) : (
                <span className="text-rose-400">DISCONNECTED</span>
              )}
            </span>
          </div>
        </div>

        {/* Stale Watchdog Test Trigger */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400">
            Test how GREVIN AI responds when data connection interrupts:
          </span>
          <button
            onClick={onSimulateStaleFeed}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simulate Stale Feed Alert</span>
          </button>
        </div>
      </div>

      {/* Connection Credentials Form (Empty by default per Requirement 1) */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4 text-cyan-400" />
          cTrader Open API Credentials (No Pre-filled Defaults)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Client ID (App Key)</label>
            <input
              type="text"
              placeholder="Enter your cTrader Client ID"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Client Secret</label>
            <input
              type="password"
              placeholder="Enter your cTrader Client Secret"
              value={formData.clientSecret}
              onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">cTrader Access Token</label>
            <input
              type="password"
              placeholder="Enter OAuth Access Token"
              value={formData.accessToken}
              onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Account ID</label>
            <input
              type="text"
              placeholder="e.g. 1234567"
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Environment</label>
            <select
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value as 'DEMO' | 'LIVE' })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            >
              <option value="DEMO">DEMO Server (demo.ctraderapi.com)</option>
              <option value="LIVE">LIVE Server (live.ctraderapi.com)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Host &amp; Port</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) || 5035 })}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-slate-200 font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-300 font-mono">
            {statusMessage}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-800 gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={formData.autoReconnect}
              onChange={(e) => setFormData({ ...formData, autoReconnect: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Auto-reconnect on connection interruption</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>{testing ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow"
            >
              Save Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
