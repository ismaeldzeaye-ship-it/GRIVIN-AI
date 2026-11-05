import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Candle, 
  Timeframe, 
  TradingSignal, 
  AlertNotification, 
  NotificationControls, 
  MarketDataConfig, 
  SymbolInfo,
  MarketSessionType,
  BinanceMarketType 
} from './types';
import { 
  SUPPORTED_SYMBOLS, 
  DEFAULT_SYMBOL, 
  DEFAULT_SYMBOL_REGISTRY,
  applyDerivActiveSymbols,
  getCustomBinanceSymbols,
  saveCustomBinanceSymbols
} from './data/symbolMapping';
import { generateCandles, INITIAL_MARKET_DATA_CONFIG } from './data/marketFeed';
import { DerivMarketDataProvider } from './data/derivProvider';
import { BinanceMarketDataProvider, toBinanceSymbol, toDisplaySymbol } from './data/binanceProvider';
import { getCurrentSession } from './engine/sessions';
import { evaluateTradingSignals } from './engine/setups';
import { onGeminiRateLimitChange } from './ai/geminiAnalysis';
import { ForwardTestTrade } from './types';
import { 
  loadTradesFromStorage, 
  saveTradesToStorage, 
  fetchTradesFromServer, 
  recordSignalToForwardTest, 
  resolveForwardTestTrades 
} from './engine/forwardTest';
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
import { MarketDataScreen } from './ui/MarketDataScreen';
import { BacktestView } from './ui/BacktestView';
import { JournalView } from './ui/JournalView';
import { SettingsModal } from './ui/SettingsModal';
import { WifiOff, Radio, AlertTriangle } from 'lucide-react';

export default function App() {
  // Navigation
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('10m');

  // Modals & Settings
  const [inspectingSignal, setInspectingSignal] = useState<TradingSignal | null>(null);
  const [auditedSignal, setAuditedSignal] = useState<TradingSignal | null>(null);
  const [forwardTestTrades, setForwardTestTrades] = useState<ForwardTestTrade[]>(() => loadTradesFromStorage());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Market Data Configuration & Provider State
  const [marketDataConfig, setMarketDataConfig] = useState<MarketDataConfig>(INITIAL_MARKET_DATA_CONFIG);
  const [symbolRegistry, setSymbolRegistry] = useState<Record<string, SymbolInfo>>(DEFAULT_SYMBOL_REGISTRY);

  // Candles State: Closed candles buffer per symbol
  const [closedCandlesMap, setClosedCandlesMap] = useState<Record<string, Candle[]>>({});
  // Forming candle (current incomplete candle rendered separately)
  const [formingCandlesMap, setFormingCandlesMap] = useState<Record<string, Candle | null>>({});

  // Real-time Live Prices
  const [livePrices, setLivePrices] = useState<Record<string, { bid: number; ask: number }>>(() => {
    const init: Record<string, { bid: number; ask: number }> = {};
    for (const sym of Object.keys(DEFAULT_SYMBOL_REGISTRY)) {
      init[sym] = {
        bid: DEFAULT_SYMBOL_REGISTRY[sym].currentBid,
        ask: DEFAULT_SYMBOL_REGISTRY[sym].currentAsk
      };
    }
    return init;
  });

  // Notifications
  const [notificationControls, setNotificationControls] = useState<NotificationControls>(DEFAULT_NOTIFICATION_CONTROLS);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  // Online status
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Binance configuration state
  const [binanceMarketType, setBinanceMarketType] = useState<BinanceMarketType>('SPOT');
  const [cryptoSymbols, setCryptoSymbols] = useState<string[]>(() => getCustomBinanceSymbols());

  // References to persistent provider instances
  const derivProviderRef = useRef<DerivMarketDataProvider | null>(null);
  const binanceProviderRef = useRef<BinanceMarketDataProvider | null>(null);

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

  // Initialize service worker and notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
    registerServiceWorker();
  }, []);

  // Load forward test trades from server persistent storage on mount
  useEffect(() => {
    fetchTradesFromServer().then((serverTrades) => {
      if (serverTrades && serverTrades.length > 0) {
        setForwardTestTrades((prev) => {
          const map = new Map<string, ForwardTestTrade>();
          for (const t of serverTrades) map.set(t.id, t);
          for (const t of prev) map.set(t.id, t);
          const merged = Array.from(map.values());
          saveTradesToStorage(merged);
          return merged;
        });
      }
    }).catch(() => {});
  }, []);

  // Initialize Deriv & Binance Market Data Providers
  useEffect(() => {
    // 1. Deriv Public WebSocket Provider
    const derivProvider = new DerivMarketDataProvider(
      // On Status Change
      (derivState) => {
        setMarketDataConfig((prev) => {
          const isConnected = derivState.connected || prev.binance.connected;
          return {
            ...prev,
            deriv: derivState,
            connected: isConnected,
            latencyMs: derivState.latencyMs,
            isStale: derivState.isStale,
            lastHeartbeat: derivState.lastHeartbeat
          };
        });

        // Trigger alert if feed becomes stale
        if (derivState.isStale) {
          const staleNotif: AlertNotification = {
            id: `stale-${Date.now()}`,
            type: 'DATA_FEED_STALE',
            title: 'GREVIN AI — MARKET FEED STALE',
            body: 'Deriv market data WebSocket latency exceeded 15,000ms. Signals blocked.',
            instrument: selectedSymbol,
            reason: 'Data feed staleness watchdog threshold (>15s) triggered.',
            timestamp: Date.now(),
            read: false
          };
          if (shouldSendNotification(staleNotif, notificationControls)) {
            dispatchNotification(staleNotif, notificationControls);
            setNotifications(n => [staleNotif, ...n.slice(0, 49)]);
          }
        }
      },
      // On Candle Updates (Historical & Streaming OHLC)
      (sym, closedCandles, formingCandle, isClosedUpdate) => {
        setClosedCandlesMap((prev) => ({
          ...prev,
          [sym]: closedCandles
        }));

        setFormingCandlesMap((prev) => ({
          ...prev,
          [sym]: formingCandle
        }));

        // Update live price from forming candle or last closed
        const currentPrice = formingCandle ? formingCandle.close : closedCandles[closedCandles.length - 1]?.close;
        if (currentPrice) {
          const pip = symbolRegistry[sym]?.pipSize || 0.0001;
          const spread = pip * 1.5;
          setLivePrices((prev) => ({
            ...prev,
            [sym]: {
              bid: currentPrice,
              ask: Number((currentPrice + spread).toFixed(symbolRegistry[sym]?.digits || 2))
            }
          }));
        }

        // On candle close: evaluate trading signals if not stale
        if (isClosedUpdate && closedCandles.length >= 20) {
          const symInfo = symbolRegistry[sym];
          const newSignals = evaluateTradingSignals(
            sym,
            closedCandles,
            selectedTimeframe,
            currentPrice,
            symInfo?.pipSize,
            symInfo?.digits,
            {
              volumeType: symInfo?.volumeType || 'NONE',
              isStale: derivProviderRef.current?.getState().isStale,
              allowQuietHoursSignals: marketDataConfig.allowQuietHoursSignals ?? true
            }
          );

          const validSig = newSignals.find(s => s.status === 'VALID' && (s.grade === 'A' || s.grade === 'B'));
          if (validSig) {
            const notif = formatSignalNotification(validSig);
            if (shouldSendNotification(notif, notificationControls)) {
              dispatchNotification(notif, notificationControls);
              setNotifications(n => [notif, ...n.slice(0, 49)]);
              if (soundEnabled) {
                playSignalChime(validSig.direction === 'BUY' ? 'BUY' : validSig.direction === 'SELL' ? 'SELL' : 'ALERT');
              }
            }
          }
        }
      },
      // On Active Symbols Discovered
      (symbols) => {
        setSymbolRegistry((prev) => {
          const updated = applyDerivActiveSymbols(prev, symbols);
          // Subscribe to all available Deriv symbols
          for (const [k, v] of Object.entries(updated)) {
            if (v.provider === 'DERIV' && v.isAvailable && v.exactBrokerSymbol && v.exactBrokerSymbol !== 'unavailable') {
              derivProvider.subscribeCandles(k, v.exactBrokerSymbol, selectedTimeframe);
            }
          }
          return updated;
        });
      },
      // On Data Proof Updated (Requirement 6)
      (proofs) => {
        setMarketDataConfig((prev) => ({
          ...prev,
          dataProofMap: {
            ...(prev.dataProofMap || {}),
            ...proofs
          }
        }));
      },
      // On Rate Limit Changed (Requirement 3: stay at half of documented rate limits)
      (rateLimit) => {
        setMarketDataConfig((prev) => ({
          ...prev,
          rateLimitState: rateLimit
        }));
      }
    );

    // Listen for Gemini API rate limits (quota exhaustion)
    const unsubscribeGemini = onGeminiRateLimitChange((geminiRateLimit) => {
      setMarketDataConfig((prev) => ({
        ...prev,
        rateLimitState: geminiRateLimit
      }));
    });

    derivProviderRef.current = derivProvider;
    derivProvider.connect();

    // 2. Binance Crypto Provider (Spot & USDT-M Perpetuals)
    const binanceProvider = new BinanceMarketDataProvider(
      (binanceState) => {
        setMarketDataConfig((prev) => ({
          ...prev,
          binance: binanceState,
          connected: prev.deriv.connected || binanceState.connected
        }));

        // Alert if Binance feed exceeds 15 seconds staleness (Requirement 7)
        if (binanceState.isStale && binanceState.connected) {
          const staleNotif: AlertNotification = {
            id: `binance-stale-${Date.now()}`,
            type: 'DATA_FEED_STALE',
            title: 'GREVIN AI — BINANCE FEED STALE',
            body: 'Binance market data stream exceeded 15s staleness watchdog. Real volume signals blocked.',
            instrument: selectedSymbol,
            reason: 'Data feed staleness threshold (>15s) triggered on Binance.',
            timestamp: Date.now(),
            read: false
          };
          if (shouldSendNotification(staleNotif, notificationControls)) {
            dispatchNotification(staleNotif, notificationControls);
            setNotifications((n) => [staleNotif, ...n.slice(0, 49)]);
          }
        }
      },
      (sym, closedCandles, formingCandle, isClosedUpdate) => {
        setClosedCandlesMap((prev) => ({ ...prev, [sym]: closedCandles }));
        setFormingCandlesMap((prev) => ({ ...prev, [sym]: formingCandle }));
        const price = formingCandle ? formingCandle.close : closedCandles[closedCandles.length - 1]?.close;
        if (price) {
          const pip = symbolRegistry[sym]?.pipSize || 0.01;
          const spread = pip * 2.0;
          setLivePrices((prev) => ({
            ...prev,
            [sym]: {
              bid: price,
              ask: Number((price + spread).toFixed(symbolRegistry[sym]?.digits || 2))
            }
          }));

          // Track DATA PROOF for Binance symbol (Requirement 6)
          const lastCandleIso = closedCandles.length > 0 
            ? new Date(closedCandles[closedCandles.length - 1].time * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC' 
            : null;
          setMarketDataConfig((prev) => {
            const currentMap = prev.dataProofMap || {};
            const existingProof = currentMap[sym] || {
              symbol: sym,
              underlyingSymbol: toBinanceSymbol(sym),
              provider: 'BINANCE' as const,
              lastTickPrice: null,
              lastTickTimeUtc: null,
              lastTickEpoch: null,
              ageSeconds: null,
              ticksReceivedSinceLoad: 0,
              lastCandleTimePerTimeframe: {},
              dataSourceType: 'LIVE_PROVEN' as const
            };

            return {
              ...prev,
              dataProofMap: {
                ...currentMap,
                [sym]: {
                  ...existingProof,
                  lastTickPrice: price,
                  lastTickEpoch: Date.now(),
                  lastTickTimeUtc: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
                  ticksReceivedSinceLoad: existingProof.ticksReceivedSinceLoad + 1,
                  lastCandleTimePerTimeframe: {
                    ...existingProof.lastCandleTimePerTimeframe,
                    [selectedTimeframe]: lastCandleIso
                  },
                  dataSourceType: 'LIVE_PROVEN' as const
                }
              }
            };
          });
        }

        // Requirement 5: Signals ONLY on closed candles (kline "x" flag), forming candle kept separate
        if (isClosedUpdate && closedCandles.length >= 20) {
          const symInfo = symbolRegistry[sym];
          const newSignals = evaluateTradingSignals(
            sym,
            closedCandles,
            selectedTimeframe,
            price,
            symInfo?.pipSize || 0.01,
            symInfo?.digits || 2,
            {
              volumeType: 'REAL_VOLUME',
              isStale: binanceProviderRef.current?.getState().isStale,
              allowQuietHoursSignals: marketDataConfig.allowQuietHoursSignals ?? true
            }
          ).map((s) => ({
            ...s,
            marketType: binanceMarketType,
            exactSymbol: symInfo?.brokerSymbol || toBinanceSymbol(sym),
            volumeType: 'REAL_VOLUME' as const
          }));

          const validSig = newSignals.find((s) => s.status === 'VALID' && (s.grade === 'A' || s.grade === 'B'));
          if (validSig) {
            const notif = formatSignalNotification(validSig);
            if (shouldSendNotification(notif, notificationControls)) {
              dispatchNotification(notif, notificationControls);
              setNotifications((n) => [notif, ...n.slice(0, 49)]);
              if (soundEnabled) {
                playSignalChime(validSig.direction === 'BUY' ? 'BUY' : validSig.direction === 'SELL' ? 'SELL' : 'ALERT');
              }
            }
          }
        }
      }
    );

    binanceProvider.setMarketType(binanceMarketType);
    binanceProvider.setSymbols(cryptoSymbols);
    binanceProvider.setTimeframe(selectedTimeframe);
    binanceProviderRef.current = binanceProvider;
    binanceProvider.connect();

    return () => {
      derivProvider.disconnect();
      binanceProvider.disconnect();
      unsubscribeGemini();
    };
  }, [selectedTimeframe, selectedSymbol, notificationControls, soundEnabled, binanceMarketType, cryptoSymbols]);

  // Current session calculation - updated every 30 seconds server-side and client-side (Requirement 8)
  const [currentSession, setCurrentSession] = useState(() => getCurrentSession());

  useEffect(() => {
    let mounted = true;
    const updateSessionState = async () => {
      try {
        const res = await fetch('/api/session-state');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data && data.sessionKey) {
            let session: MarketSessionType = 'ASIAN';
            if (data.sessionKey === 'CLOSED') session = 'CLOSED';
            else if (data.sessionKey === 'LONDON_KILLZONE' || data.sessionKey === 'LONDON_MID') session = 'LONDON';
            else if (data.sessionKey === 'LONDON_NY_OVERLAP') session = 'LONDON_NY_OVERLAP';
            else if (data.sessionKey === 'NY_AFTERNOON') session = 'NEW_YORK';
            else session = 'ASIAN';

            setCurrentSession({
              session,
              label: data.label,
              isOverlap: data.sessionKey === 'LONDON_NY_OVERLAP',
              dstStatus: getCurrentSession().dstStatus
            });
            return;
          }
        }
      } catch {
        // fallback
      }
      if (mounted) {
        setCurrentSession(getCurrentSession());
      }
    };

    updateSessionState();
    const timer = setInterval(updateSessionState, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Selected symbol info
  const currentSymbolInfo = symbolRegistry[selectedSymbol] || symbolRegistry['XAU/USD'];

  // Active candles for selected symbol
  const activeClosedCandles = useMemo(() => {
    if (closedCandlesMap[selectedSymbol] && closedCandlesMap[selectedSymbol].length > 0) {
      return closedCandlesMap[selectedSymbol];
    }
    // Simulation fallback if simulation mode is enabled
    if (marketDataConfig.simulationMode) {
      return generateCandles(selectedSymbol, selectedTimeframe, 120);
    }
    return [];
  }, [closedCandlesMap, selectedSymbol, selectedTimeframe, marketDataConfig.simulationMode]);

  const activeFormingCandle = formingCandlesMap[selectedSymbol] || null;

  const currentLive = livePrices[selectedSymbol] || {
    bid: currentSymbolInfo?.currentBid || 2742.50,
    ask: currentSymbolInfo?.currentAsk || 2742.85
  };

  // Evaluate Signals for all symbols
  // Signals are evaluated on closed candles, disabled if stale or volume is NONE
  const allSignals = useMemo(() => {
    const isLive = marketDataConfig.connected && !marketDataConfig.isStale;
    const isSim = marketDataConfig.simulationMode;

    if (!isLive && !isSim) {
      return [];
    }

    const signalsList: TradingSignal[] = [];
    for (const sym of Object.keys(symbolRegistry)) {
      const symInfo = symbolRegistry[sym];
      const candles = closedCandlesMap[sym] || (isSim ? generateCandles(sym, selectedTimeframe, 120) : []);

      if (candles && candles.length >= 20) {
        const live = livePrices[sym]?.bid;
        const evaluated = evaluateTradingSignals(
          sym,
          candles,
          selectedTimeframe,
          live,
          symInfo.pipSize,
          symInfo.digits,
          {
            volumeType: symInfo.volumeType,
            isStale: symInfo.provider === 'BINANCE' ? marketDataConfig.binance.isStale : marketDataConfig.deriv.isStale,
            allowQuietHoursSignals: marketDataConfig.allowQuietHoursSignals ?? true
          }
        ).map(s => {
          const isUnverifiedOrSimulated = 
            marketDataConfig.simulationMode ||
            symInfo.status !== 'ACTIVE' ||
            symInfo.dataOrigin !== 'LIVE_PROVEN';
          const dataOrigin = marketDataConfig.simulationMode
            ? ('SIMULATED' as const)
            : symInfo.dataOrigin;

          return {
            ...s,
            marketType: symInfo.provider === 'BINANCE' ? binanceMarketType : undefined,
            exactSymbol: symInfo.provider === 'BINANCE' ? (symInfo.brokerSymbol || toBinanceSymbol(sym)) : (symInfo.exactBrokerSymbol || symInfo.brokerSymbol),
            volumeType: symInfo.volumeType,
            isUnverifiedOrSimulated,
            dataOrigin
          };
        });
        signalsList.push(...evaluated);
      }
    }
    return signalsList;
  }, [closedCandlesMap, livePrices, symbolRegistry, selectedTimeframe, marketDataConfig.connected, marketDataConfig.isStale, marketDataConfig.simulationMode, binanceMarketType, marketDataConfig.binance.isStale, marketDataConfig.deriv.isStale, marketDataConfig.allowQuietHoursSignals]);

  // Automatically record every signal in persistent storage (Forward Test Paper Execution)
  useEffect(() => {
    if (allSignals && allSignals.length > 0) {
      setForwardTestTrades((prev) => {
        let current = prev;
        for (const sig of allSignals) {
          const { updatedTrades } = recordSignalToForwardTest(sig, current);
          current = updatedTrades;
        }
        return current;
      });
    }
  }, [allSignals]);

  // Automatically resolve open forward test trades on closed candles
  useEffect(() => {
    for (const sym of Object.keys(closedCandlesMap)) {
      const candles = closedCandlesMap[sym];
      if (candles && candles.length > 0) {
        setForwardTestTrades((prev) => {
          const { updatedTrades, resolvedTrades } = resolveForwardTestTrades(prev, candles, sym);
          if (resolvedTrades.length > 0) {
            return updatedTrades;
          }
          return prev;
        });
      }
    }
  }, [closedCandlesMap]);

  // Active signal for currently selected symbol on chart
  const activeSignalForSymbol = useMemo(() => {
    return allSignals.find(s => s.symbol === selectedSymbol && s.status === 'VALID') || 
           allSignals.find(s => s.symbol === selectedSymbol) || 
           null;
  }, [allSignals, selectedSymbol]);

  // Reconnect Deriv trigger
  const handleReconnectDeriv = useCallback(() => {
    if (derivProviderRef.current) {
      derivProviderRef.current.disconnect();
      derivProviderRef.current.connect();
    }
  }, []);

  // Refresh active symbols trigger
  const handleRefreshSymbols = useCallback(() => {
    if (derivProviderRef.current) {
      derivProviderRef.current.discoverActiveSymbols();
    }
  }, []);

  // Binance Market Type switcher (Requirement 3: Spot vs Futures)
  const handleBinanceMarketTypeChange = useCallback((type: BinanceMarketType) => {
    setBinanceMarketType(type);
    binanceProviderRef.current?.setMarketType(type);
    setSymbolRegistry((prev) => {
      const updated = { ...prev };
      for (const [k, v] of Object.entries(updated)) {
        if (v.provider === 'BINANCE') {
          updated[k] = { ...v, marketType: type };
        }
      }
      return updated;
    });
  }, []);

  // Binance Symbols custom editor (Requirement 4: BTCUSDT, ETHUSDT, SOLUSDT, editable)
  const handleBinanceSymbolsChange = useCallback((symbols: string[]) => {
    setCryptoSymbols(symbols);
    saveCustomBinanceSymbols(symbols);
    binanceProviderRef.current?.setSymbols(symbols);
    setSymbolRegistry((prev) => {
      const updated = { ...prev };
      for (const s of symbols) {
        const display = toDisplaySymbol(s);
        if (!updated[display]) {
          updated[display] = {
            symbol: display,
            name: `${s.replace('USDT', '')} / Tether USDT`,
            category: 'CRYPTO',
            brokerSymbol: s,
            exactBrokerSymbol: s,
            digits: 2,
            pipSize: 0.01,
            volumeType: 'REAL_VOLUME',
            provider: 'BINANCE',
            pipValuePerStandardLot: 1.0,
            lotSize: 1,
            minLot: 0.01,
            maxLot: 100.0,
            lotStep: 0.01,
            currentBid: 100.0,
            currentAsk: 100.1,
            spreadPips: 1.0,
            dayChangePercent: 0,
            dayHigh: 105.0,
            dayLow: 95.0,
            isAvailable: true,
            exchangeIsOpen: true,
            isTradingSuspended: false,
            isMarketOpen: true,
            marketType: binanceMarketType,
            status: 'ACTIVE',
            dataOrigin: 'LIVE_PROVEN'
          };
        }
      }
      return updated;
    });
  }, [binanceMarketType]);

  // Reconnect Binance trigger
  const handleReconnectBinance = useCallback(() => {
    if (binanceProviderRef.current) {
      binanceProviderRef.current.reconnect();
    }
  }, []);

  // Toggle Simulation Mode
  const handleToggleSimulationMode = (enabled: boolean) => {
    setMarketDataConfig(prev => ({
      ...prev,
      simulationMode: enabled
    }));
  };

  // Test push notification trigger
  const handleTriggerTestPush = async () => {
    try {
      await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument: selectedSymbol,
          strategy: 'POC Bounce',
          direction: 'BUY',
          grade: 'A'
        })
      });

      const notif: AlertNotification = {
        id: `test-${Date.now()}`,
        type: 'BUY_SETUP',
        title: 'GREVIN AI — BUY SETUP [GRADE A]',
        body: [
          `Instrument: ${selectedSymbol}`,
          `Timeframe: ${selectedTimeframe} / M5 confirmation`,
          `Strategy: POC Bounce`,
          `Grade: A`,
          `Status: Confirmation received`,
          `Target: 2R verified level: Open GREVIN AI.`
        ].join('\n'),
        instrument: selectedSymbol,
        direction: 'BUY',
        timeframe: selectedTimeframe,
        strategyName: 'POC Bounce',
        entryZone: 'Verified Zone',
        grade: 'A',
        reason: 'Manual push verification dispatched.',
        timestamp: Date.now(),
        read: false
      };

      await dispatchNotification(notif, notificationControls);
      setNotifications(prev => [notif, ...prev]);
    } catch {
      // fallback
    }
  };

  const unreadAlerts = notifications.filter(n => !n.read).length;
  const isFeedActive = marketDataConfig.connected || marketDataConfig.simulationMode;

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-slate-950 font-bold px-4 py-1.5 text-xs flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>Offline Mode — Cached institutional models and historical candles are active.</span>
        </div>
      )}

      {/* SIMULATION MODE Visible Banner (Off by default, clearly labelled) */}
      {marketDataConfig.simulationMode && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 font-mono text-xs px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <strong>⚠️ SIMULATION MODE ACTIVE:</strong>
            <span className="hidden sm:inline">Offline synthetic candles are active. Live market analysis requires Deriv or Binance live stream.</span>
          </div>
          <button
            onClick={() => handleToggleSimulationMode(false)}
            className="px-2.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition text-[11px]"
          >
            Disable Simulation Mode
          </button>
        </div>
      )}

      {/* Stale Feed Warning Banner */}
      {marketDataConfig.isStale && marketDataConfig.connected && (
        <div className="bg-rose-950/80 border-b border-rose-500/50 text-rose-300 font-mono text-xs px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <strong>DATA FEED STALE (&gt;15s):</strong>
            <span>No ticks received from Deriv WebSocket in over 15 seconds. Signal generation has been blocked.</span>
          </div>
          <button
            onClick={handleReconnectDeriv}
            className="px-2.5 py-0.5 rounded bg-rose-500 text-white font-bold hover:bg-rose-400 transition text-[11px]"
          >
            Reconnect Deriv
          </button>
        </div>
      )}

      {/* Market Data Disconnected Notice */}
      {!marketDataConfig.connected && !marketDataConfig.simulationMode && (
        <div className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span className="font-bold text-rose-300">Market Data Not Connected:</span>
            <span className="text-slate-400 hidden md:inline">Connecting to Deriv WebSocket public feed (wss://api.derivws.com). No live signals generated while disconnected.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleSimulationMode(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition"
            >
              Enable Simulation Mode
            </button>
            <button
              onClick={() => setCurrentTab('market-data')}
              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition"
            >
              View Market Data Feeds
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentSession={currentSession}
        marketDataConfig={marketDataConfig}
        unreadAlertCount={unreadAlerts}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onTriggerTestPush={handleTriggerTestPush}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Permanent Forward-Test Uncertainty & Risk Banner (Requirement 6) */}
      <div className="bg-[#0b101d] border-b border-cyan-500/30 text-cyan-300 font-mono text-xs px-4 py-2 flex items-center justify-center gap-2 text-center shadow-sm">
        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
        <span className="font-semibold tracking-wide">
          Signals are unproven until at least 30 forward-test results per setup. Not financial advice.
        </span>
      </div>

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
            isConnected={marketDataConfig.connected}
            isSimulation={marketDataConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('market-data')}
          />
        )}

        {currentTab === 'chart' && (
          <div className="space-y-4">
            <ChartComponent
              symbol={selectedSymbol}
              timeframe={selectedTimeframe}
              onTimeframeChange={(tf) => {
                setSelectedTimeframe(tf);
                if (currentSymbolInfo?.exactBrokerSymbol && derivProviderRef.current) {
                  derivProviderRef.current.subscribeCandles(selectedSymbol, currentSymbolInfo.exactBrokerSymbol, tf);
                }
              }}
              candles={activeClosedCandles}
              formingCandle={activeFormingCandle}
              activeSignal={activeSignalForSymbol}
              auditedSignal={auditedSignal}
              onClearAuditedSignal={() => setAuditedSignal(null)}
              currentBid={currentLive.bid}
              currentAsk={currentLive.ask}
              isConnected={marketDataConfig.connected}
              isSimulation={marketDataConfig.simulationMode}
              dataSource={currentSymbolInfo.provider}
              exactBrokerSymbol={currentSymbolInfo.exactBrokerSymbol}
              volumeType={currentSymbolInfo.volumeType}
              isStale={currentSymbolInfo?.provider === 'BINANCE' ? marketDataConfig.binance.isStale : marketDataConfig.isStale}
              isMarketOpen={currentSymbolInfo?.isMarketOpen ?? true}
              binanceMarketType={binanceMarketType}
              onBinanceMarketTypeChange={handleBinanceMarketTypeChange}
              isBlockedRegion={currentSymbolInfo?.provider === 'BINANCE' && marketDataConfig.binance.isBlockedRegion}
              provider={currentSymbolInfo?.provider || 'DERIV'}
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
            onViewOnChart={(sym, sig) => {
              setSelectedSymbol(sym);
              if (sig) setAuditedSignal(sig);
              setCurrentTab('chart');
            }}
            isConnected={marketDataConfig.connected}
            isSimulation={marketDataConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('market-data')}
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
            forwardTestTrades={forwardTestTrades}
            onClearForwardTestTrades={() => {
              setForwardTestTrades([]);
              saveTradesToStorage([]);
            }}
            isConnected={marketDataConfig.connected}
            isSimulation={marketDataConfig.simulationMode}
            onNavigateToConnection={() => setCurrentTab('market-data')}
          />
        )}

        {currentTab === 'journal' && (
          <JournalView />
        )}

        {currentTab === 'market-data' && (
          <MarketDataScreen
            config={marketDataConfig}
            symbolRegistry={symbolRegistry}
            onReconnectDeriv={handleReconnectDeriv}
            onRefreshSymbols={handleRefreshSymbols}
            onRetryActiveSymbols={() => derivProviderRef.current?.retryActiveSymbols()}
            onToggleSimulationMode={handleToggleSimulationMode}
            onBinanceMarketTypeChange={handleBinanceMarketTypeChange}
            onBinanceSymbolsChange={handleBinanceSymbolsChange}
            onReconnectBinance={handleReconnectBinance}
          />
        )}
      </main>

      {/* Signal Detail Modal */}
      {inspectingSignal && (
        <SignalDetailModal
          signal={inspectingSignal}
          symbolInfo={symbolRegistry[inspectingSignal.symbol]}
          onClose={() => setInspectingSignal(null)}
          onViewOnChart={(sym, sig) => {
            setSelectedSymbol(sym);
            if (sig) setAuditedSignal(sig);
            setCurrentTab('chart');
          }}
          onNotificationCreated={(msg) => {
            // notification created
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
          allowQuietHoursSignals={marketDataConfig.allowQuietHoursSignals ?? true}
          onToggleQuietHoursSignals={() => {
            setMarketDataConfig((prev) => ({
              ...prev,
              allowQuietHoursSignals: !(prev.allowQuietHoursSignals ?? true)
            }));
          }}
        />
      )}
    </div>
  );
}
