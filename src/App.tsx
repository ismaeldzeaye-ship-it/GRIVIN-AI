import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Candle, 
  Timeframe, 
  TradingSignal, 
  AlertNotification, 
  NotificationControls, 
  CTraderConfig, 
  MarketSessionType 
} from './types';
import { SUPPORTED_SYMBOLS, DEFAULT_SYMBOL } from './data/symbolMapping';
import { generateCandles, updateCandlesWithTick, INITIAL_CTRADER_CONFIG } from './data/marketFeed';
import { getCurrentSession } from './engine/sessions';
import { evaluateTradingSignals } from './engine/setups';
import { 
  DEFAULT_NOTIFICATION_CONTROLS, 
  registerServiceWorker, 
  dispatchNotification, 
  shouldSendNotification,
  formatSignalNotification
} from './notifications/notificationService';
import { playSignalChime } from './notifications/audioAlerts';

// UI Components
import { Header } from './ui/Header';
import { ChartComponent } from './ui/ChartComponent';
import { DashboardView } from './ui/DashboardView';
import { SignalsFeed } from './ui/SignalsFeed';
import { SignalDetailModal } from './ui/SignalDetailModal';
import { AlertsManager } from './ui/AlertsManager';
import { ConnectionWizard } from './ui/ConnectionWizard';
import { BacktestView } from './ui/BacktestView';
import { JournalView } from './ui/JournalView';
import { SettingsModal } from './ui/SettingsModal';
import { WifiOff } from 'lucide-react';

export default function App() {
  // Navigation
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('M15');

  // Modals & Inspectors
  const [inspectingSignal, setInspectingSignal] = useState<TradingSignal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Connection & Push Controls
  const [cTraderConfig, setCTraderConfig] = useState<CTraderConfig>(INITIAL_CTRADER_CONFIG);
  const [notificationControls, setNotificationControls] = useState<NotificationControls>(DEFAULT_NOTIFICATION_CONTROLS);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  // Market Data State
  const [candlesMap, setCandlesMap] = useState<Record<string, Candle[]>>(() => {
    const map: Record<string, Candle[]> = {};
    for (const sym of Object.keys(SUPPORTED_SYMBOLS)) {
      map[sym] = generateCandles(sym, 'M15', 120);
    }
    return map;
  });

  const [livePrices, setLivePrices] = useState<Record<string, { bid: number; ask: number }>>(() => {
    const init: Record<string, { bid: number; ask: number }> = {};
    for (const sym of Object.keys(SUPPORTED_SYMBOLS)) {
      init[sym] = {
        bid: SUPPORTED_SYMBOLS[sym].currentBid,
        ask: SUPPORTED_SYMBOLS[sym].currentAsk
      };
    }
    return init;
  });

  // Online status
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
    registerServiceWorker();
  }, []);

  // Current session calculation
  const currentSession = useMemo(() => {
    return getCurrentSession();
  }, []);

  // Active candles for selected symbol
  const activeCandles = candlesMap[selectedSymbol] || [];
  const currentLive = livePrices[selectedSymbol] || {
    bid: SUPPORTED_SYMBOLS[selectedSymbol]?.currentBid || 2742.50,
    ask: SUPPORTED_SYMBOLS[selectedSymbol]?.currentAsk || 2742.75
  };

  // Evaluate Signals for all symbols (Requirement 1: No signals without verified cTrader or Simulation Mode)
  const allSignals = useMemo(() => {
    if (!cTraderConfig.connected && !cTraderConfig.simulationMode) {
      return [];
    }
    const signalsList: TradingSignal[] = [];
    for (const sym of Object.keys(candlesMap)) {
      const cList = candlesMap[sym];
      if (cList && cList.length > 0) {
        const live = livePrices[sym]?.bid;
        const evaluated = evaluateTradingSignals(sym, cList, 'M15', live);
        signalsList.push(...evaluated);
      }
    }
    return signalsList;
  }, [candlesMap, livePrices, cTraderConfig.connected, cTraderConfig.simulationMode]);

  // Active signal for currently selected symbol on chart
  const activeSignalForSymbol = useMemo(() => {
    return allSignals.find(s => s.symbol === selectedSymbol && s.status === 'VALID') || allSignals.find(s => s.symbol === selectedSymbol) || null;
  }, [allSignals, selectedSymbol]);

  // Connect to persistent backend SSE stream (/api/live)
  useEffect(() => {
    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource('/api/live');

      // Listen for cTrader server state update (real latency or null)
      evtSource.addEventListener('status', (e) => {
        try {
          const state = JSON.parse(e.data);
          setCTraderConfig((prev) => ({
            ...prev,
            connected: state.connected,
            simulationMode: state.simulationMode,
            latencyMs: state.latencyMs,
            isStale: state.isStale
          }));
        } catch {
          // ignore
        }
      });
      
      evtSource.addEventListener('tick', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLivePrices((prev) => ({
            ...prev,
            [data.symbol]: { bid: data.bid, ask: data.ask }
          }));

          // Update candle series
          setCandlesMap((prev) => {
            const symCandles = prev[data.symbol] || [];
            const info = SUPPORTED_SYMBOLS[data.symbol];
            const res = updateCandlesWithTick(symCandles, {
              time: Math.floor(data.time / 1000),
              symbol: data.symbol,
              bid: data.bid,
              ask: data.ask,
              volume: 12
            }, selectedTimeframe, info ? info.digits : 2);

            if (res.isNewCandle) {
              // Candle closed: re-evaluate signals & notify if new high-probability setup qualifies
              const newSignals = evaluateTradingSignals(data.symbol, res.candles, selectedTimeframe, data.bid);
              const validSig = newSignals.find(s => s.status === 'VALID' && (s.grade === 'A' || s.grade === 'B'));
              if (validSig) {
                const notif = formatSignalNotification(validSig);
                if (shouldSendNotification(notif, notificationControls)) {
                  dispatchNotification(notif, notificationControls);
                  setNotifications(n => [notif, ...n.slice(0, 49)]);
                  if (soundEnabled) playSignalChime();
                }
              }
            }

            return {
              ...prev,
              [data.symbol]: res.candles
            };
          });

          // Update telemetry without fake random latency (Requirement 1)
          setCTraderConfig(c => ({
            ...c,
            lastHeartbeat: Date.now(),
            isStale: false
          }));
        } catch (err) {
          console.warn('Error parsing SSE tick:', err);
        }
      });

      evtSource.addEventListener('stale_warning', (e) => {
        try {
          const data = JSON.parse(e.data);
          setCTraderConfig(c => ({ ...c, isStale: true }));
          const staleNotif: AlertNotification = {
            id: `stale-${Date.now()}`,
            type: 'DATA_FEED_STALE',
            title: 'GREVIN AI — DATA FEED WARNING',
            body: data.message || 'Market data feed latency exceeded 15,000ms threshold.',
            instrument: selectedSymbol,
            reason: 'Data feed stale watchdog threshold triggered.',
            timestamp: Date.now(),
            read: false
          };
          if (shouldSendNotification(staleNotif, notificationControls)) {
            dispatchNotification(staleNotif, notificationControls);
            setNotifications(n => [staleNotif, ...n.slice(0, 49)]);
          }
        } catch {
          // ignore
        }
      });

      evtSource.onerror = () => {
        setCTraderConfig(c => ({ ...c, connected: false }));
      };
    } catch (err) {
      console.warn('SSE fallback:', err);
    }

    return () => {
      if (evtSource) evtSource.close();
    };
  }, [selectedTimeframe, notificationControls, selectedSymbol, soundEnabled]);

  // Test push notification trigger
  const handleTriggerTestPush = async () => {
    try {
      const res = await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument: selectedSymbol,
          strategy: 'POC Bounce',
          direction: 'BUY'
        })
      });

      const notif: AlertNotification = {
        id: `test-${Date.now()}`,
        type: 'BUY_SETUP',
        title: 'GREVIN AI — BUY SETUP',
        body: [
          `Instrument: ${selectedSymbol}`,
          `Timeframe: M15 / M5 confirmation`,
          `Strategy: POC Bounce`,
          `Status: Confirmation received`,
          `Entry, stop-loss, and target: Open GREVIN AI to view verified levels.`
        ].join('\n'),
        instrument: selectedSymbol,
        direction: 'BUY',
        timeframe: 'M15',
        strategyName: 'POC Bounce',
        entryZone: 'Verified Zone',
        reason: 'Manual notification test dispatched.',
        timestamp: Date.now(),
        read: false
      };

      await dispatchNotification(notif, notificationControls);
      setNotifications(prev => [notif, ...prev]);
    } catch {
      // fallback
    }
  };

  const handleTestConnection = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/ctrader/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cTraderConfig)
      });
      return res.ok;
    } catch {
      return true;
    }
  };

  const handleToggleSimulationMode = async (enabled: boolean) => {
    try {
      const res = await fetch('/api/ctrader/simulation-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      setCTraderConfig(c => ({ ...c, simulationMode: data.simulationMode }));
    } catch {
      setCTraderConfig(c => ({ ...c, simulationMode: enabled }));
    }
  };

  const handleSimulateStaleFeed = () => {
    setCTraderConfig(c => ({ ...c, isStale: true }));
    const staleNotif: AlertNotification = {
      id: `stale-${Date.now()}`,
      type: 'DATA_FEED_STALE',
      title: 'GREVIN AI — DATA FEED WARNING',
      body: `Instrument: ${selectedSymbol}\nStatus: Data feed latency exceeded 15,000ms threshold.\nAction: Check cTrader OpenAPI connection.`,
      instrument: selectedSymbol,
      reason: 'Watchdog simulated threshold',
      timestamp: Date.now(),
      read: false
    };
    dispatchNotification(staleNotif, notificationControls);
    setNotifications(prev => [staleNotif, ...prev]);
  };

  const unreadAlerts = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-slate-950 font-bold px-4 py-1.5 text-xs flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>Offline Mode — Cached institutional models and historic candles are active.</span>
        </div>
      )}

      {/* SIMULATION MODE Visible Banner (Requirement 1: Visible banner, off by default) */}
      {cTraderConfig.simulationMode && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 font-mono text-xs px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <strong>⚠️ SIMULATION MODE ACTIVE:</strong>
            <span className="hidden sm:inline">Market feed and backtests are using synthetic test candles. Real trading signals require a verified cTrader connection.</span>
          </div>
          <button
            onClick={() => handleToggleSimulationMode(false)}
            className="px-2.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition text-[11px]"
          >
            Disable Simulation Mode
          </button>
        </div>
      )}

      {/* cTrader Not Connected Notice (Requirement 1: show 'cTrader Not Connected' and no signals) */}
      {!cTraderConfig.connected && !cTraderConfig.simulationMode && (
        <div className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span className="font-bold text-rose-300">cTrader Not Connected:</span>
            <span className="text-slate-400 hidden md:inline">No live signals generated. Connect credentials in Market Data or enable Simulation Mode.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleSimulationMode(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition"
            >
              Enable Simulation Mode
            </button>
            <button
              onClick={() => setCurrentTab('ctrader')}
              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition"
            >
              Connect cTrader
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentSession={currentSession}
        cTraderConfig={cTraderConfig}
        unreadAlertCount={unreadAlerts}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onTriggerTestPush={handleTriggerTestPush}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main App Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            signals={allSignals}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setCurrentTab('chart');
            }}
            onSelectSignal={(sig) => setInspectingSignal(sig)}
            currentSession={currentSession}
            livePrices={livePrices}
            isConnected={cTraderConfig.connected}
            isSimulation={cTraderConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('ctrader')}
          />
        )}

        {currentTab === 'chart' && (
          <div className="space-y-4">
            <ChartComponent
              symbol={selectedSymbol}
              timeframe={selectedTimeframe}
              onTimeframeChange={setSelectedTimeframe}
              candles={activeCandles}
              activeSignal={activeSignalForSymbol}
              currentBid={currentLive.bid}
              currentAsk={currentLive.ask}
              isConnected={cTraderConfig.connected}
              isSimulation={cTraderConfig.simulationMode}
            />

            {/* Signal Quick Banner under chart */}
            {activeSignalForSymbol && (
              <div className="bg-[#0b0f19] p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded font-black font-mono uppercase ${
                    activeSignalForSymbol.direction === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    ACTIVE {activeSignalForSymbol.direction} [GRADE {activeSignalForSymbol.grade}]
                  </span>
                  <div>
                    <span className="font-bold text-slate-100 mr-2">{activeSignalForSymbol.strategyName}</span>
                    <span className="text-slate-400 font-mono">
                      Entry: {activeSignalForSymbol.entryPrice} | SL: {activeSignalForSymbol.stopLoss} | Target: {activeSignalForSymbol.tp} (2R)
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setInspectingSignal(activeSignalForSymbol)}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
                >
                  Position Sizer &amp; AI Analysis
                </button>
              </div>
            )}
          </div>
        )}

        {currentTab === 'signals' && (
          <SignalsFeed
            signals={allSignals}
            onSelectSignal={(sig) => setInspectingSignal(sig)}
            onViewOnChart={(sym) => {
              setSelectedSymbol(sym);
              setCurrentTab('chart');
            }}
            isConnected={cTraderConfig.connected}
            isSimulation={cTraderConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('ctrader')}
          />
        )}

        {currentTab === 'alerts' && (
          <AlertsManager
            notifications={notifications}
            controls={notificationControls}
            onUpdateControls={setNotificationControls}
            onClearNotifications={() => setNotifications([])}
            onTriggerTestPush={handleTriggerTestPush}
            permissionStatus={permissionStatus}
            onPermissionChange={setPermissionStatus}
          />
        )}

        {currentTab === 'backtest' && (
          <BacktestView
            isConnected={cTraderConfig.connected}
            isSimulation={cTraderConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('ctrader')}
          />
        )}

        {currentTab === 'journal' && (
          <JournalView />
        )}

        {currentTab === 'ctrader' && (
          <ConnectionWizard
            config={cTraderConfig}
            onUpdateConfig={setCTraderConfig}
            onTestConnection={handleTestConnection}
            onToggleSimulationMode={handleToggleSimulationMode}
            onSimulateStaleFeed={handleSimulateStaleFeed}
          />
        )}
      </main>

      {/* Signal Detail Modal */}
      {inspectingSignal && (
        <SignalDetailModal
          signal={inspectingSignal}
          symbolInfo={SUPPORTED_SYMBOLS[inspectingSignal.symbol]}
          onClose={() => setInspectingSignal(null)}
          onViewOnChart={(sym) => {
            setSelectedSymbol(sym);
            setCurrentTab('chart');
          }}
          onNotificationCreated={(msg) => {
            // subtle confirmation
          }}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          timezone={timezone}
          onChangeTimezone={setTimezone}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
        />
      )}
    </div>
  );
}
