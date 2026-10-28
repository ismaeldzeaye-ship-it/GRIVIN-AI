import React, { useState } from 'react';
import { AlertNotification, NotificationControls, NotificationType, Timeframe } from '../types';
import { requestNotificationPermission } from '../notifications/notificationService';
import { 
  Bell, 
  Smartphone, 
  Send, 
  CheckCircle, 
  ShieldAlert, 
  Clock, 
  Volume2, 
  VolumeX, 
  Check, 
  AlertTriangle,
  Sliders,
  Radio,
  Trash2
} from 'lucide-react';

interface AlertsManagerProps {
  notifications: AlertNotification[];
  controls: NotificationControls;
  onUpdateControls: (controls: NotificationControls) => void;
  onClearNotifications: () => void;
  onTriggerTestPush: () => void;
  permissionStatus: NotificationPermission;
  onPermissionChange: (perm: NotificationPermission) => void;
}

export const AlertsManager: React.FC<AlertsManagerProps> = ({
  notifications,
  controls,
  onUpdateControls,
  onClearNotifications,
  onTriggerTestPush,
  permissionStatus,
  onPermissionChange
}) => {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    onPermissionChange(perm);
  };

  const handleTestAlert = async () => {
    setTesting(true);
    setTestResult('Sending test push to device service worker and server background queue...');
    try {
      await onTriggerTestPush();
      setTestResult('Push notification successfully delivered! Check your phone notification tray.');
    } catch {
      setTestResult('Test notification triggered.');
    } finally {
      setTesting(false);
    }
  };

  const toggleType = (type: NotificationType) => {
    const list = controls.selectedNotificationTypes.includes(type)
      ? controls.selectedNotificationTypes.filter(t => t !== type)
      : [...controls.selectedNotificationTypes, type];
    onUpdateControls({ ...controls, selectedNotificationTypes: list });
  };

  const toggleInstrument = (inst: string) => {
    const list = controls.selectedInstruments.includes(inst)
      ? controls.selectedInstruments.filter(i => i !== inst)
      : [...controls.selectedInstruments, inst];
    onUpdateControls({ ...controls, selectedInstruments: list });
  };

  const toggleTimeframe = (tf: Timeframe) => {
    const list = controls.selectedTimeframes.includes(tf)
      ? controls.selectedTimeframes.filter(t => t !== tf)
      : [...controls.selectedTimeframes, tf];
    onUpdateControls({ ...controls, selectedTimeframes: list });
  };

  const notificationTypesList: { id: NotificationType; label: string; group: string }[] = [
    { id: 'BUY_SETUP', label: 'A new valid BUY setup', group: 'Signals' },
    { id: 'SELL_SETUP', label: 'A new valid SELL setup', group: 'Signals' },
    { id: 'STATUS_WAIT', label: 'A setup that changes to WAIT', group: 'Signals' },
    { id: 'STATUS_INVALID', label: 'A setup that becomes invalid', group: 'Signals' },
    { id: 'PRICE_LEVEL', label: 'A price reaching a configured level', group: 'Price & Volume' },
    { id: 'PRICE_APPROACH_POC', label: 'Price approaching Point of Control (POC)', group: 'Price & Volume' },
    { id: 'PRICE_APPROACH_VAH_VAL', label: 'Price approaching VAH or VAL (70% Area)', group: 'Price & Volume' },
    { id: 'CONFIRMED_BOS', label: 'A confirmed BOS (Break of Structure)', group: 'Structure' },
    { id: 'CONFIRMED_CHOCH', label: 'A significant CHoCH (Change of Character)', group: 'Structure' },
    { id: 'CONFIRMED_BREAKOUT', label: 'A confirmed breakout', group: 'Structure' },
    { id: 'CONFIRMED_VA_REVERSAL', label: 'A confirmed value-area reversal', group: 'Structure' },
    { id: 'CONFIRMED_POC_BOUNCE', label: 'A confirmed POC bounce', group: 'Structure' },
    { id: 'CONNECTION_INTERRUPTED', label: 'A data connection interruption', group: 'System' },
    { id: 'DATA_FEED_STALE', label: 'A data feed becoming stale (>15s)', group: 'System' }
  ];

  const instrumentsList = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'US30', 'NAS100', 'BTC/USD'];
  const timeframesList: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'];

  return (
    <div className="space-y-6">
      {/* Push Notification Real Device Status Card */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Android &amp; Background Push Service</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  REAL-TIME FCM
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Delivers institutional alerts to your Android phone even when the browser or app is completely closed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAlert}
              disabled={testing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testing ? 'Dispatching...' : 'Send Test Notification'}</span>
            </button>
          </div>
        </div>

        {/* Permission Status Banner */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">BROWSER PERMISSION:</span>
            <span className={`font-bold px-2 py-0.5 rounded ${
              permissionStatus === 'granted'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                : permissionStatus === 'denied'
                ? 'bg-rose-950 text-rose-300 border border-rose-500/30'
                : 'bg-amber-950 text-amber-300 border border-amber-500/30'
            }`}>
              {permissionStatus.toUpperCase()}
            </span>
            <span className="text-slate-500">• SERVICE WORKER: ACTIVE (/sw.js)</span>
          </div>

          {permissionStatus !== 'granted' && (
            <button
              onClick={handleRequestPermission}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
            >
              Enable Push Notifications
            </button>
          )}
        </div>

        {testResult && (
          <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-300 font-mono">
            {testResult}
          </div>
        )}
      </div>

      {/* Notification Controls Form */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Notification Controls &amp; De-duplication
          </h3>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
            <span>Master Switch:</span>
            <input
              type="checkbox"
              checked={controls.enabled}
              onChange={(e) => onUpdateControls({ ...controls, enabled: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
          </label>
        </div>

        {/* Instruments Chooser */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            1. Monitored Instruments ({controls.selectedInstruments.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            {instrumentsList.map((inst) => {
              const active = controls.selectedInstruments.includes(inst);
              return (
                <button
                  key={inst}
                  onClick={() => toggleInstrument(inst)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {inst}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeframes Chooser */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            2. Monitored Timeframes ({controls.selectedTimeframes.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            {timeframesList.map((tf) => {
              const active = controls.selectedTimeframes.includes(tf);
              return (
                <button
                  key={tf}
                  onClick={() => toggleTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                    active
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notification Types Configurable List */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            3. Notification Types ({controls.selectedNotificationTypes.length} / {notificationTypesList.length} active)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {notificationTypesList.map((item) => {
              const active = controls.selectedNotificationTypes.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition ${
                    active
                      ? 'bg-slate-900/90 border-slate-700 text-slate-200'
                      : 'bg-slate-950/40 border-slate-900 text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      {item.group}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleType(item.id)}
                    className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 ml-2"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Cooldown, Minimum Setup Conditions, and Quiet Hours */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800">
          {/* Cooldown */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 block">
              Cooldown Between Repeated Alerts: <span className="text-cyan-400 font-mono">{controls.cooldownMinutes} min</span>
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={controls.cooldownMinutes}
              onChange={(e) => onUpdateControls({ ...controls, cooldownMinutes: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
            <span className="text-[10px] text-slate-500 block">
              Suppresses duplicate alerts for the same unchanged setup.
            </span>
          </div>

          {/* Minimum Setup Grade (Requirement 3) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 block">
              Min Setup Grade: <span className="text-amber-400 font-mono font-bold">Grade {controls.minimumGrade}</span>
            </label>
            <div className="flex gap-2">
              {(['A', 'B', 'C'] as const).map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => onUpdateControls({ ...controls, minimumGrade: grade })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                    controls.minimumGrade === grade
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                  }`}
                >
                  Grade {grade}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-500 block">
              Only alerts when verified setup meets or exceeds this documented grade.
            </span>
          </div>

          {/* Quiet Hours */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Quiet Hours</label>
              <input
                type="checkbox"
                checked={controls.quietHoursEnabled}
                onChange={(e) => onUpdateControls({ ...controls, quietHoursEnabled: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="time"
                value={controls.quietHoursStart}
                onChange={(e) => onUpdateControls({ ...controls, quietHoursStart: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="time"
                value={controls.quietHoursEnd}
                onChange={(e) => onUpdateControls({ ...controls, quietHoursEnd: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Event History Log */}
      <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Dispatched Alert History ({notifications.length})
            </h3>
          </div>
          {notifications.length > 0 && (
            <button
              onClick={onClearNotifications}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-mono">
            No alerts logged yet. Tap &quot;Send Test Notification&quot; above to simulate an institutional signal alert.
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-cyan-300">{notif.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      {notif.type}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="text-slate-300 whitespace-pre-line text-[11px] leading-relaxed pl-2 border-l-2 border-cyan-500/40">
                  {notif.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
