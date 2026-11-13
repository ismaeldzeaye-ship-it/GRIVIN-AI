import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Candle, Timeframe, TradingSignal } from '../types';
import { calculateVolumeProfile, calculateTimeAtPriceProfile } from '../engine/volumeProfile';
import { analyzeMarketStructure } from '../engine/structure';
import { detectFairValueGaps, detectOrderBlocks } from '../engine/smc';
import { getActiveSessionSchedules } from '../engine/sessions';
import { SUPPORTED_SYMBOLS, formatPrice, formatSpread, getTruthfulStatus, getTruthfulProfileLabel } from '../data/symbolMapping';
import { 
  Layers, 
  Eye, 
  EyeOff, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Activity,
  Crosshair,
  ShieldCheck,
  X,
  AlertTriangle,
  RefreshCw,
  Clock,
  Terminal,
  Radio
} from 'lucide-react';

interface ChartComponentProps {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  candles: Candle[];
  formingCandle?: Candle | null;
  activeSignal?: TradingSignal | null;
  auditedSignal?: TradingSignal | null;
  onClearAuditedSignal?: () => void;
  currentBid: number;
  currentAsk: number;
  quoteTimestamp?: number;
  quoteLastChanged?: number;
  isConnected: boolean;
  isSimulation: boolean;
  dataSource?: string;
  exactBrokerSymbol?: string;
  volumeType?: 'NONE' | 'APPROXIMATE_TICK' | 'REAL_VOLUME';
  isStale?: boolean;
  isMarketOpen?: boolean;
  binanceMarketType?: 'SPOT' | 'FUTURES';
  onBinanceMarketTypeChange?: (type: 'SPOT' | 'FUTURES') => void;
  isBlockedRegion?: boolean;
  provider?: 'DERIV' | 'BINANCE' | 'SIMULATION';
  symbolDebugInfo?: {
    lastRequestSent?: string;
    lastResponseType?: string;
    candleCount?: number;
    lastCandleTime?: string | null;
    errorMessage?: string | null;
  };
  binanceErrorMessage?: string | null;
  derivErrorMessage?: string | null;
  onRetryNow?: () => void;
}

export const ChartComponent: React.FC<ChartComponentProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  candles,
  formingCandle,
  activeSignal,
  auditedSignal,
  onClearAuditedSignal,
  currentBid,
  currentAsk,
  quoteTimestamp,
  quoteLastChanged,
  isConnected,
  isSimulation,
  dataSource = 'Deriv',
  exactBrokerSymbol,
  volumeType = 'NONE',
  isStale = false,
  isMarketOpen = true,
  binanceMarketType = 'SPOT',
  onBinanceMarketTypeChange,
  isBlockedRegion = false,
  provider = 'DERIV',
  symbolDebugInfo,
  binanceErrorMessage,
  derivErrorMessage,
  onRetryNow
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 850, height: 500 });

  // Toggleable Overlays State
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showSMC, setShowSMC] = useState(true);
  const [showMitigatedZones, setShowMitigatedZones] = useState(false);
  const [showEntrySLTP, setShowEntrySLTP] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);

  // Zoom / Viewport window (number of visible candles)
  const [visibleCount, setVisibleCount] = useState(60);
  const [panOffset, setPanOffset] = useState(0); // 0 means latest candle at right
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const symInfo = SUPPORTED_SYMBOLS[symbol] || SUPPORTED_SYMBOLS['XAU/USD'];

  // Handle Resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(450, containerRef.current.clientHeight)
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Combined list of closed candles + real-time forming candle
  const allCandles = useMemo(() => {
    if (!formingCandle) return candles;
    const lastClosed = candles[candles.length - 1];
    if (!lastClosed || formingCandle.time > lastClosed.time) {
      return [...candles, formingCandle];
    } else {
      // Updates the last forming candle
      const copy = [...candles];
      copy[copy.length - 1] = formingCandle;
      return copy;
    }
  }, [candles, formingCandle]);

  // Compute sliced visible candles based on pan
  const visibleCandles = useMemo(() => {
    if (!allCandles.length) return [];
    const endIndex = Math.max(0, allCandles.length - panOffset);
    const startIndex = Math.max(0, endIndex - visibleCount);
    return allCandles.slice(startIndex, endIndex);
  }, [allCandles, visibleCount, panOffset]);

  const isBinance = provider === 'BINANCE' || symbol.includes('USDT');

  // Derived Indicators: Real Volume for Binance vs 60-row Time-At-Price for Deriv
  const volumeProfile = useMemo(() => {
    if (!visibleCandles.length) {
      return {
        poc: 0,
        vah: 0,
        val: 0,
        totalVolume: 0,
        valueAreaVolume: 0,
        levels: [],
        session: 'LONDON' as any,
        stepSize: symInfo.pipSize,
        profileType: (isBinance ? 'REAL_VOLUME' : 'TIME_AT_PRICE') as any,
        label: isBinance ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)',
        isApproximateTickVolume: !isBinance
      };
    }
    if (isBinance) {
      return calculateVolumeProfile(visibleCandles, symInfo.digits, symInfo.pipSize);
    }
    // Deriv: 60-row time-at-price profile
    return calculateTimeAtPriceProfile(visibleCandles, symInfo.digits, symInfo.pipSize);
  }, [visibleCandles, symInfo, isBinance]);

  const structure = useMemo(() => {
    return analyzeMarketStructure(visibleCandles, timeframe);
  }, [visibleCandles, timeframe]);

  const currentPrice = visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1].close : 0;
  const latestCandleIdx = visibleCandles.length - 1;

  const fvgs = useMemo(() => {
    let list = detectFairValueGaps(visibleCandles, timeframe);
    if (!showMitigatedZones) {
      list = list.filter(f => f.mitigationStatus !== 'MITIGATED');
      const scored = list.map(f => {
        const mid = (f.top + f.bottom) / 2;
        const dist = Math.abs(mid - currentPrice);
        return { fvg: f, dist };
      });
      scored.sort((a, b) => a.dist - b.dist);
      list = scored.slice(0, 3).map(s => s.fvg);
    }
    return list;
  }, [visibleCandles, timeframe, showMitigatedZones, currentPrice]);

  const orderBlocks = useMemo(() => {
    let list = detectOrderBlocks(visibleCandles, timeframe);
    if (!showMitigatedZones) {
      list = list.filter(ob => ob.mitigationStatus !== 'MITIGATED');
      const scored = list.map(ob => {
        const mid = (ob.top + ob.bottom) / 2;
        const dist = Math.abs(mid - currentPrice);
        return { ob, dist };
      });
      scored.sort((a, b) => a.dist - b.dist);
      list = scored.slice(0, 3).map(s => s.ob);
    }
    return list;
  }, [visibleCandles, timeframe, showMitigatedZones, currentPrice]);

  // Chart coordinate math
  const paddingRight = 95; // Dedicated right edge space for Entry/SL/TP labels & price scale
  const paddingLeft = 15;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = Math.max(200, dimensions.width - paddingLeft - paddingRight);
  const chartHeight = Math.max(200, dimensions.height - paddingTop - paddingBottom);
  const hasCandles = visibleCandles.length > 0;

  // Real-time quote freshness & staleness tracking (Requirement 1)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const hasLiveQuote = currentBid > 0 && currentAsk > 0 && Boolean(quoteTimestamp && quoteTimestamp > 0);
  const quoteAgeSec = hasLiveQuote && quoteTimestamp ? Math.max(0, Math.floor((now - quoteTimestamp) / 1000)) : null;
  const isQuoteGreyedOut = quoteAgeSec !== null && quoteAgeSec > 15;
  const quoteUnchangedSec = hasLiveQuote && (quoteLastChanged || quoteTimestamp)
    ? Math.max(0, Math.floor((now - (quoteLastChanged || quoteTimestamp!)) / 1000))
    : 0;
  const isQuoteStale = isMarketOpen && quoteUnchangedSec >= 60;
  const liveSpreadFormatted = hasLiveQuote
    ? formatSpread(Math.max(0, currentAsk - currentBid), symbol, false, symInfo?.pipSize || 0.0001)
    : 'N/A';

  // Empty chart backoff retry countdown (Requirement 3)
  const [retryCountdown, setRetryCountdown] = useState(10);
  useEffect(() => {
    if (hasCandles || isSimulation) return;
    const t = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          if (onRetryNow) onRetryNow();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [hasCandles, isSimulation, onRetryNow]);

  // M10 / M45 synthesis status tracking (Requirement 5)
  const isSynthesizedTimeframe = timeframe === '10m' || timeframe === '45m';
  const synthesisLabel = useMemo(() => {
    if (timeframe === '10m') {
      return hasCandles
        ? `M10 Synthesis: ACTIVE (Built from 2 closed M5 candles) • Complete bars: ${candles.length}`
        : `M10 Synthesis: BLOCKED — Source M5 candles missing or incomplete`;
    }
    if (timeframe === '45m') {
      return hasCandles
        ? `M45 Synthesis: ACTIVE (Built from 3 closed M15 candles) • Complete bars: ${candles.length}`
        : `M45 Synthesis: BLOCKED — Source M15 candles missing or incomplete`;
    }
    return null;
  }, [timeframe, hasCandles, candles.length]);

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (!hasCandles) return { minPrice: 0, maxPrice: 0, priceRange: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    // Also include active signal levels if toggle is on
    if (showEntrySLTP && activeSignal) {
      min = Math.min(min, activeSignal.stopLoss, activeSignal.entryPrice);
      max = Math.max(max, activeSignal.stopLoss, activeSignal.entryPrice, activeSignal.tp);
    }
    const margin = (max - min) * 0.08 || (min * 0.001) || 1;
    return {
      minPrice: min - margin,
      maxPrice: max + margin,
      priceRange: (max + margin) - (min - margin)
    };
  }, [visibleCandles, hasCandles, showEntrySLTP, activeSignal]);

  const priceToY = (price: number): number => {
    if (priceRange <= 0) return chartHeight / 2 + paddingTop;
    return paddingTop + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  const yToPrice = (y: number): number => {
    if (priceRange <= 0) return minPrice;
    const fraction = (chartHeight - (y - paddingTop)) / chartHeight;
    return minPrice + fraction * priceRange;
  };

  const candleSpacing = visibleCandles.length > 0 ? chartWidth / visibleCandles.length : 10;
  const candleBodyWidth = Math.max(2, candleSpacing * 0.7);

  const candleToX = (index: number): number => {
    return paddingLeft + index * candleSpacing + candleSpacing / 2;
  };

  // Price Grid Lines (Requirement 6: No fake grid ticks when no candles)
  const gridTicks = 6;
  const gridPrices = useMemo(() => {
    if (!hasCandles || priceRange <= 0) return [];
    const ticks: number[] = [];
    const step = priceRange / gridTicks;
    for (let i = 0; i <= gridTicks; i++) {
      ticks.push(minPrice + i * step);
    }
    return ticks;
  }, [minPrice, priceRange, hasCandles]);

  // Session boxes calculation
  const sessionBoxes = useMemo(() => {
    if (!showSessions || visibleCandles.length === 0) return [];
    const schedules = getActiveSessionSchedules();
    const boxes: { name: string; xStart: number; xEnd: number; color: string; label: string }[] = [];

    // Group adjacent candles by session
    let curSession: string | null = null;
    let curStartIndex = 0;

    visibleCandles.forEach((c, idx) => {
      const d = new Date(c.time * 1000);
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      
      let matched = 'OTHER';
      for (const s of schedules) {
        const start = s.startHourUTC * 60 + s.startMinuteUTC;
        const end = s.endHourUTC * 60 + s.endMinuteUTC;
        if (mins >= start && mins < end) {
          matched = s.name;
          break;
        }
      }

      if (matched !== curSession) {
        if (curSession && curSession !== 'OTHER') {
          const sched = schedules.find(s => s.name === curSession);
          if (sched) {
            boxes.push({
              name: curSession,
              label: sched.label.split(' ')[0],
              xStart: candleToX(curStartIndex) - candleSpacing / 2,
              xEnd: candleToX(idx) - candleSpacing / 2,
              color: sched.color
            });
          }
        }
        curSession = matched;
        curStartIndex = idx;
      }
    });

    if (curSession && curSession !== 'OTHER') {
      const sched = schedules.find(s => s.name === curSession);
      if (sched) {
        boxes.push({
          name: curSession,
          label: sched.label.split(' ')[0],
          xStart: candleToX(curStartIndex) - candleSpacing / 2,
          xEnd: chartWidth + paddingLeft,
          color: sched.color
        });
      }
    }

    return boxes;
  }, [showSessions, visibleCandles, chartWidth, candleSpacing]);

  // Mouse interaction for crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (x >= paddingLeft && x <= paddingLeft + chartWidth) {
      const idx = Math.floor((x - paddingLeft) / candleSpacing);
      if (idx >= 0 && idx < visibleCandles.length) {
        setHoverIndex(idx);
      }
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverIndex(null);
  };

  const hoveredCandle = hoverIndex !== null ? visibleCandles[hoverIndex] : null;

  return (
    <div className="flex flex-col bg-[#0b0f19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#0e1424] border-b border-slate-800 gap-3">
        {/* Symbol & Timeframe Selectors */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-sm font-black tracking-wider text-slate-100">{symbol}</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {symInfo.category}
            </span>

            {/* Spot / Futures Selector for Binance */}
            {provider === 'BINANCE' && onBinanceMarketTypeChange && (
              <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-md p-0.5 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => onBinanceMarketTypeChange('SPOT')}
                  className={`px-2 py-0.5 rounded transition font-bold ${
                    binanceMarketType === 'SPOT'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Binance Spot Market (https://data-api.binance.vision)"
                >
                  SPOT
                </button>
                <button
                  type="button"
                  onClick={() => onBinanceMarketTypeChange('FUTURES')}
                  className={`px-2 py-0.5 rounded transition font-bold ${
                    binanceMarketType === 'FUTURES'
                      ? 'bg-cyan-400 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Binance USDT-M Perpetuals (https://fapi.binance.com)"
                >
                  FUTURES
                </button>
              </div>
            )}

            {/* Exact symbol, market type & REAL Volume badge */}
            {provider === 'BINANCE' && (
              <span 
                className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                title="USDT is a USD-pegged stablecoin, not fiat USD. Real exchange trade volume."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {binanceMarketType} • {exactBrokerSymbol || symbol.replace('/', '')} • REAL VOL
              </span>
            )}

            {/* Perpetual proxy label for SPY/QQQ */}
            {(symbol === 'SPYUSDT' || symbol === 'QQQUSDT' || exactBrokerSymbol?.includes('SPY') || exactBrokerSymbol?.includes('QQQ')) && (
              <span 
                className="hidden xl:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/30 font-bold"
                title="Binance USDT-M Perpetual contract proxy — Not an index or CME futures"
              >
                PERPETUAL (PROXY)
              </span>
            )}

            {!isMarketOpen && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                MARKET CLOSED
              </span>
            )}
          </div>

          <div className="flex items-center bg-[#070a12] p-0.5 rounded-lg border border-slate-800 text-xs font-semibold">
            {(['10m', '45m', '1H', 'M5', 'M15', 'H4', 'D1'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 rounded-md transition ${
                  timeframe === tf
                    ? 'bg-cyan-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Live Spread & Bid/Ask Pill (Requirement 1 & 2: Real live quote, 15s grey-out, 60s stale, crypto in price units, N/A when no live quote) */}
        <div className={`hidden sm:flex items-center gap-2.5 text-xs font-mono transition-opacity ${
          isQuoteGreyedOut ? 'opacity-40' : ''
        }`}>
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
            <span>BID</span>
            <span className={hasLiveQuote ? (isQuoteGreyedOut ? 'text-slate-400 font-bold' : 'text-emerald-400 font-bold') : 'text-slate-500 font-bold'}>
              {hasLiveQuote ? formatPrice(currentBid, symbol) : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
            <span>ASK</span>
            <span className={hasLiveQuote ? (isQuoteGreyedOut ? 'text-slate-400 font-bold' : 'text-rose-400 font-bold') : 'text-slate-500 font-bold'}>
              {hasLiveQuote ? formatPrice(currentAsk, symbol) : 'N/A'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Spread: <span className="text-amber-300 font-bold">{liveSpreadFormatted}</span>
          </div>
          {hasLiveQuote && quoteAgeSec !== null && (
            <div className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {quoteAgeSec}s ago
            </div>
          )}
          {isQuoteStale && (
            <div className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold animate-pulse">
              STALE QUOTE (&gt;60s)
            </div>
          )}
        </div>

        {/* Overlay Controls & Zoom */}
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => setShowOverlayMenu(!showOverlayMenu)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
              showOverlayMenu
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium">Overlays</span>
          </button>

          {/* Zoom In / Out / Reset */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setVisibleCount(c => Math.max(25, c - 15))}
              title="Zoom In"
              className="p-1 text-slate-400 hover:text-cyan-400 transition"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setVisibleCount(c => Math.min(180, c + 15))}
              title="Zoom Out"
              className="p-1 text-slate-400 hover:text-cyan-400 transition"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setVisibleCount(60); setPanOffset(0); }}
              title="Reset View"
              className="p-1 text-slate-400 hover:text-slate-200 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Overlay Dropdown Menu */}
          {showOverlayMenu && (
            <div className="absolute right-0 top-10 w-64 bg-[#0d1322] border border-slate-700/80 rounded-xl shadow-2xl p-3 z-30 text-xs flex flex-col gap-2">
              <div className="font-bold text-slate-200 pb-1 border-b border-slate-800 flex justify-between items-center">
                <span>Chart Overlays</span>
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono">100% Toggleable</span>
              </div>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                  Volume Profile — APPROXIMATE (tick volume)
                </span>
                <input
                  type="checkbox"
                  checked={showVolumeProfile}
                  onChange={(e) => setShowVolumeProfile(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span>
                  Market Sessions (London / NY / Asia)
                </span>
                <input
                  type="checkbox"
                  checked={showSessions}
                  onChange={(e) => setShowSessions(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                  Structure (BOS & CHoCH)
                </span>
                <input
                  type="checkbox"
                  checked={showStructure}
                  onChange={(e) => setShowStructure(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span>
                  SMC (Order Blocks & FVG)
                </span>
                <input
                  type="checkbox"
                  checked={showSMC}
                  onChange={(e) => setShowSMC(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer pl-6">
                <span className="text-slate-400 flex items-center gap-2 text-[11px]">
                  <span>Show mitigated / historical zones</span>
                </span>
                <input
                  type="checkbox"
                  checked={showMitigatedZones}
                  onChange={(e) => setShowMitigatedZones(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                  Entry / SL / TP Labels (Right Edge)
                </span>
                <input
                  type="checkbox"
                  checked={showEntrySLTP}
                  onChange={(e) => setShowEntrySLTP(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-1.5 hover:bg-slate-800/50 rounded cursor-pointer">
                <span className="text-slate-300 flex items-center gap-2">
                  <Crosshair className="w-3.5 h-3.5 text-slate-400" />
                  Interactive Crosshair
                </span>
                <input
                  type="checkbox"
                  checked={showCrosshair}
                  onChange={(e) => setShowCrosshair(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Visual Signal Audit Banner (Requirement 3) */}
      {auditedSignal && (
        <div className="bg-cyan-950/90 border border-cyan-500/40 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-lg">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold text-cyan-300 mr-2">AUDIT VISUALIZATION:</span>
              <span className="text-slate-100 font-bold">{auditedSignal.symbol} • {auditedSignal.strategyName}</span>
              <span className="text-amber-300 ml-2 font-bold">[Grade {auditedSignal.grade}]</span>
            </div>
            {auditedSignal.auditLevels && (
              <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-300 ml-3">
                <span className="text-amber-400">POC: {formatPrice(auditedSignal.auditLevels.poc, auditedSignal.symbol)}</span>
                <span>|</span>
                <span className="text-cyan-400">VAH: {formatPrice(auditedSignal.auditLevels.vah, auditedSignal.symbol)}</span>
                <span>|</span>
                <span className="text-cyan-400">VAL: {formatPrice(auditedSignal.auditLevels.val, auditedSignal.symbol)}</span>
                {auditedSignal.auditLevels.bosPrice && (
                  <>
                    <span>|</span>
                    <span className="text-purple-400">BOS: {formatPrice(auditedSignal.auditLevels.bosPrice, auditedSignal.symbol)}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
              {auditedSignal.auditLevels?.profileLabel || (isBinance ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')}
            </span>
            {onClearAuditedSignal && (
              <button
                onClick={onClearAuditedSignal}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-600"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Audit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Requirement 5: M10 and M45 Synthesis Status Banner */}
      {isSynthesizedTimeframe && (
        <div className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs font-mono shadow-sm ${
          hasCandles
            ? 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300'
            : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${hasCandles ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="font-bold">{synthesisLabel}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {timeframe === '10m' ? '2 contiguous closed M5 candles required per M10 bar' : '3 contiguous closed M15 candles required per M45 bar'} • UTC Aligned
          </div>
        </div>
      )}

      {/* Main Chart Canvas / SVG Container */}
      <div 
        ref={containerRef} 
        className="relative w-full h-[480px] bg-[#090d16] select-none cursor-crosshair overflow-hidden"
      >
        <svg
          width={dimensions.width}
          height={dimensions.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block"
        >
          {/* Background Grid Lines */}
          {gridPrices.map((p, idx) => {
            const y = priceToY(p);
            return (
              <g key={`grid-${idx}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={paddingLeft + chartWidth}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              </g>
            );
          })}

          {/* Market Session Shaded Blocks */}
          {sessionBoxes.map((box, idx) => (
            <g key={`session-box-${idx}`}>
              <rect
                x={box.xStart}
                y={paddingTop}
                width={Math.max(4, box.xEnd - box.xStart)}
                height={chartHeight}
                fill={box.color}
              />
              <text
                x={box.xStart + 6}
                y={paddingTop + 14}
                fill="#94a3b8"
                fontSize="10"
                fontWeight="700"
                letterSpacing="1"
                opacity="0.75"
              >
                {box.label}
              </text>
            </g>
          ))}

          {/* Volume Profile Histogram (Anchored to Left or Session) */}
          {showVolumeProfile && volumeProfile.levels.length > 0 && (
            <g opacity="0.65">
              {volumeProfile.levels.map((lvl, idx) => {
                const yCenter = priceToY(lvl.price);
                const barHeight = Math.max(2, (chartHeight / volumeProfile.levels.length) * 0.85);
                const maxVol = Math.max(...volumeProfile.levels.map(l => l.volume), 1);
                const barWidth = (lvl.volume / maxVol) * 110; // max 110px width
                const isPOC = Math.abs(lvl.price - volumeProfile.poc) <= volumeProfile.stepSize;

                return (
                  <rect
                    key={`vp-bar-${idx}`}
                    x={paddingLeft}
                    y={yCenter - barHeight / 2}
                    width={barWidth}
                    height={barHeight}
                    fill={isPOC ? '#ef4444' : '#0284c7'}
                    opacity={isPOC ? 0.85 : 0.4}
                    rx="1"
                  />
                );
              })}

              {/* Volume Profile Key Lines: POC, VAH, VAL */}
              {/* POC Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(volumeProfile.poc)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(volumeProfile.poc)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              {/* VAH Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(volumeProfile.vah)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(volumeProfile.vah)}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {/* VAL Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(volumeProfile.val)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(volumeProfile.val)}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </g>
          )}

          {/* SMC Zones: Fair Value Gaps (FVG) */}
          {showSMC && fvgs.map((fvg) => {
            const yTop = priceToY(fvg.top);
            const yBottom = priceToY(fvg.bottom);
            const height = Math.abs(yBottom - yTop);
            const x = candleToX(Math.max(0, fvg.candleIndex));
            const isOld = latestCandleIdx - fvg.candleIndex > 200;
            const fill = fvg.direction === 'BULLISH'
              ? (isOld ? 'rgba(16, 185, 129, 0.03)' : 'rgba(16, 185, 129, 0.12)')
              : (isOld ? 'rgba(244, 63, 94, 0.03)' : 'rgba(244, 63, 94, 0.12)');
            return (
              <g key={fvg.id} opacity={isOld ? 0.35 : 1.0}>
                <rect
                  x={x}
                  y={Math.min(yTop, yBottom)}
                  width={chartWidth + paddingLeft - x}
                  height={Math.max(2, height)}
                  fill={fill}
                  stroke={fvg.direction === 'BULLISH' ? '#10b981' : '#f43f5e'}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={x + 4}
                  y={Math.min(yTop, yBottom) + 10}
                  fill={fvg.direction === 'BULLISH' ? '#34d399' : '#fb7185'}
                  fontSize="9"
                  fontWeight="600"
                >
                  {fvg.direction === 'BULLISH' ? '+FVG' : '-FVG'} ({fvg.mitigationStatus})
                </text>
              </g>
            );
          })}

          {/* SMC Zones: Order Blocks (OB) */}
          {showSMC && orderBlocks.map((ob) => {
            const yTop = priceToY(ob.top);
            const yBottom = priceToY(ob.bottom);
            const height = Math.abs(yBottom - yTop);
            const x = candleToX(Math.max(0, ob.candleIndex));
            const isOld = latestCandleIdx - ob.candleIndex > 200;
            const fill = ob.direction === 'BULLISH'
              ? (isOld ? 'rgba(56, 189, 248, 0.04)' : 'rgba(56, 189, 248, 0.14)')
              : (isOld ? 'rgba(234, 179, 8, 0.04)' : 'rgba(234, 179, 8, 0.14)');
            return (
              <g key={ob.id} opacity={isOld ? 0.35 : 1.0}>
                <rect
                  x={x}
                  y={Math.min(yTop, yBottom)}
                  width={chartWidth + paddingLeft - x}
                  height={Math.max(3, height)}
                  fill={fill}
                  stroke={ob.direction === 'BULLISH' ? '#38bdf8' : '#eab308'}
                  strokeWidth="1"
                />
                <text
                  x={x + 4}
                  y={Math.min(yTop, yBottom) + 11}
                  fill={ob.direction === 'BULLISH' ? '#38bdf8' : '#eab308'}
                  fontSize="9"
                  fontWeight="bold"
                >
                  {ob.direction === 'BULLISH' ? 'BULL OB' : 'BEAR OB'}
                </text>
              </g>
            );
          })}

          {/* Structure Markers: BOS & CHoCH */}
          {showStructure && structure.events.map((ev) => {
            const x = candleToX(ev.candleIndex);
            const y = priceToY(ev.brokenLevel);
            const isBull = ev.direction === 'BULLISH';
            const color = ev.type === 'CHOCH' ? '#f59e0b' : '#38bdf8';

            return (
              <g key={ev.id}>
                <line
                  x1={Math.max(paddingLeft, x - 40)}
                  y1={y}
                  x2={x + 10}
                  y2={y}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray={ev.type === 'CHOCH' ? '4 2' : 'none'}
                />
                <rect
                  x={x - 22}
                  y={isBull ? y - 16 : y + 4}
                  width="44"
                  height="14"
                  rx="3"
                  fill="#090d16"
                  stroke={color}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={isBull ? y - 6 : y + 14}
                  fill={color}
                  fontSize="8.5"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {ev.type}
                </text>
              </g>
            );
          })}

          {/* Candlesticks Rendering */}
          {visibleCandles.map((c, idx) => {
            const xCenter = candleToX(idx);
            const isBull = c.close >= c.open;
            const candleColor = isBull ? '#10b981' : '#f43f5e';

            const yHigh = priceToY(c.high);
            const yLow = priceToY(c.low);
            const yOpen = priceToY(c.open);
            const yClose = priceToY(c.close);

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

            return (
              <g key={`candle-${c.time}-${idx}`}>
                {/* Wick */}
                <line
                  x1={xCenter}
                  y1={yHigh}
                  x2={xCenter}
                  y2={yLow}
                  stroke={candleColor}
                  strokeWidth="1.2"
                />
                {/* Body */}
                <rect
                  x={xCenter - candleBodyWidth / 2}
                  y={bodyTop}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  fill={candleColor}
                  rx="0.5"
                />
              </g>
            );
          })}

          {/* Current Live Price Line */}
          {visibleCandles.length > 0 && (
            <line
              x1={paddingLeft}
              y1={priceToY(currentBid)}
              x2={paddingLeft + chartWidth}
              y2={priceToY(currentBid)}
              stroke="#06b6d4"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Item 13: Entry, Stop, and TP1 Boxes spanning from signal candle to invalidation or expiry */}
          {showEntrySLTP && (auditedSignal || activeSignal) && (() => {
            const targetSignal = auditedSignal || activeSignal;
            if (!targetSignal) return null;

            // Determine signal candle X coordinate
            const signalTimeSec = targetSignal.signalCandleTime
              ? (targetSignal.signalCandleTime > 1e11 ? Math.floor(targetSignal.signalCandleTime / 1000) : targetSignal.signalCandleTime)
              : (targetSignal.timestamp ? Math.floor(targetSignal.timestamp / 1000) : null);

            let signalIdx = -1;
            if (signalTimeSec && visibleCandles.length > 0) {
              for (let i = 0; i < visibleCandles.length; i++) {
                const c = visibleCandles[i];
                const nextTime = i < visibleCandles.length - 1 ? visibleCandles[i + 1].time : c.time + 3600;
                if (signalTimeSec >= c.time && signalTimeSec < nextTime) {
                  signalIdx = i;
                  break;
                }
              }
              if (signalIdx === -1) {
                let minDiff = Infinity;
                visibleCandles.forEach((c, idx) => {
                  const d = Math.abs(c.time - signalTimeSec);
                  if (d < minDiff) {
                    minDiff = d;
                    signalIdx = idx;
                  }
                });
              }
            }
            if (signalIdx === -1) {
              signalIdx = Math.max(0, visibleCandles.length - 15);
            }

            const xStart = candleToX(signalIdx);

            // Determine expiry X coordinate
            let expiryIdx = -1;
            if (targetSignal.validUntilEpoch) {
              const expirySec = Math.floor(targetSignal.validUntilEpoch / 1000);
              for (let i = signalIdx; i < visibleCandles.length; i++) {
                if (visibleCandles[i].time >= expirySec) {
                  expiryIdx = i;
                  break;
                }
              }
            }

            const xEnd = (expiryIdx !== -1 && expiryIdx > signalIdx)
              ? candleToX(expiryIdx)
              : (paddingLeft + chartWidth);

            const boxWidth = Math.max(90, xEnd - xStart);

            const yEntry = priceToY(targetSignal.entryPrice);
            const ySL = priceToY(targetSignal.stopLoss);
            const yTP1 = priceToY(targetSignal.tp);

            // TP1 Box spans between yEntry and yTP1
            const tpBoxY = Math.min(yEntry, yTP1);
            const tpBoxH = Math.max(6, Math.abs(yTP1 - yEntry));

            // SL Box spans between yEntry and ySL
            const slBoxY = Math.min(yEntry, ySL);
            const slBoxH = Math.max(6, Math.abs(ySL - yEntry));

            const isBuy = targetSignal.direction === 'BUY';

            return (
              <g key="signal-target-boxes">
                {/* Full-width dashed reference guidelines */}
                <line
                  x1={paddingLeft}
                  y1={yEntry}
                  x2={paddingLeft + chartWidth}
                  y2={yEntry}
                  stroke="#06b6d4"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.6"
                />
                <line
                  x1={paddingLeft}
                  y1={ySL}
                  x2={paddingLeft + chartWidth}
                  y2={ySL}
                  stroke="#ef4444"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.6"
                />
                <line
                  x1={paddingLeft}
                  y1={yTP1}
                  x2={paddingLeft + chartWidth}
                  y2={yTP1}
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.6"
                />

                {/* TP1 Projection Box (Green) */}
                <rect
                  x={xStart}
                  y={tpBoxY}
                  width={boxWidth}
                  height={tpBoxH}
                  fill="rgba(16, 185, 129, 0.14)"
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  rx="3"
                />
                <text
                  x={xStart + 8}
                  y={isBuy ? tpBoxY + 14 : tpBoxY + tpBoxH - 8}
                  fill="#10b981"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  TP1: {formatPrice(targetSignal.tp, targetSignal.symbol)} (+{targetSignal.tp1DistanceFormatted || targetSignal.rewardPips + 'p'}) • {targetSignal.tp1OverRRatio || 'TP1 / R = 2.00 OK'}
                </text>

                {/* SL Projection Box (Red) */}
                <rect
                  x={xStart}
                  y={slBoxY}
                  width={boxWidth}
                  height={slBoxH}
                  fill="rgba(239, 68, 68, 0.14)"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  rx="3"
                />
                <text
                  x={xStart + 8}
                  y={isBuy ? slBoxY + slBoxH - 8 : slBoxY + 14}
                  fill="#ef4444"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  SL: {formatPrice(targetSignal.stopLoss, targetSignal.symbol)} (-{targetSignal.stopDistanceFormatted || targetSignal.riskPips + 'p'}) [1x ATR14]
                </text>

                {/* Entry Center Line & Label */}
                <line
                  x1={xStart}
                  y1={yEntry}
                  x2={xStart + boxWidth}
                  y2={yEntry}
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                />
                <text
                  x={xStart + 8}
                  y={yEntry - 5}
                  fill="#06b6d4"
                  fontSize="10.5"
                  fontWeight="800"
                  fontFamily="monospace"
                >
                  ENTRY: {formatPrice(targetSignal.entryPrice, targetSignal.symbol)} • R = {targetSignal.stopDistanceFormatted || targetSignal.riskPips + 'p'}
                </text>

                {/* Valid Until / Expiry Box Label */}
                <rect
                  x={xStart}
                  y={Math.max(paddingTop + 2, Math.min(tpBoxY, slBoxY) - 18)}
                  width={Math.min(boxWidth, 240)}
                  height="16"
                  rx="3"
                  fill="#090d16"
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
                <text
                  x={xStart + 6}
                  y={Math.max(paddingTop + 2, Math.min(tpBoxY, slBoxY) - 18) + 11}
                  fill="#38bdf8"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  VALID UNTIL: {targetSignal.validUntilTimeUtc || 'Active Session'}
                </text>
              </g>
            );
          })()}

          {/* AUDITED SIGNAL EXACT LEVELS (POC, VAH, VAL, SWINGS, BOS CANDLE TIME) */}
          {auditedSignal && auditedSignal.auditLevels && (
            <g key="audited-signal-levels">
              {/* Audited POC Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(auditedSignal.auditLevels.poc)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(auditedSignal.auditLevels.poc)}
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="6 3"
              />
              <text
                x={paddingLeft + 10}
                y={priceToY(auditedSignal.auditLevels.poc) - 5}
                fill="#f59e0b"
                fontSize="10"
                fontWeight="bold"
                letterSpacing="0.5"
              >
                AUDIT POC: {formatPrice(auditedSignal.auditLevels.poc, auditedSignal.symbol)} ({auditedSignal.auditLevels.profileLabel})
              </text>

              {/* Audited VAH Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(auditedSignal.auditLevels.vah)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(auditedSignal.auditLevels.vah)}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <text
                x={paddingLeft + 10}
                y={priceToY(auditedSignal.auditLevels.vah) - 5}
                fill="#38bdf8"
                fontSize="10"
                fontWeight="bold"
              >
                AUDIT VAH: {formatPrice(auditedSignal.auditLevels.vah, auditedSignal.symbol)}
              </text>

              {/* Audited VAL Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(auditedSignal.auditLevels.val)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(auditedSignal.auditLevels.val)}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <text
                x={paddingLeft + 10}
                y={priceToY(auditedSignal.auditLevels.val) + 14}
                fill="#38bdf8"
                fontSize="10"
                fontWeight="bold"
              >
                AUDIT VAL: {formatPrice(auditedSignal.auditLevels.val, auditedSignal.symbol)}
              </text>

              {/* Audited Swing High */}
              {auditedSignal.auditLevels.swingHigh && (
                <g>
                  <line
                    x1={paddingLeft}
                    y1={priceToY(auditedSignal.auditLevels.swingHigh)}
                    x2={paddingLeft + chartWidth}
                    y2={priceToY(auditedSignal.auditLevels.swingHigh)}
                    stroke="#c084fc"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft + chartWidth - 140}
                    y={priceToY(auditedSignal.auditLevels.swingHigh) - 4}
                    fill="#c084fc"
                    fontSize="9.5"
                    fontWeight="bold"
                  >
                    SWING HIGH: {formatPrice(auditedSignal.auditLevels.swingHigh, auditedSignal.symbol)}
                  </text>
                </g>
              )}

              {/* Audited Swing Low */}
              {auditedSignal.auditLevels.swingLow && (
                <g>
                  <line
                    x1={paddingLeft}
                    y1={priceToY(auditedSignal.auditLevels.swingLow)}
                    x2={paddingLeft + chartWidth}
                    y2={priceToY(auditedSignal.auditLevels.swingLow)}
                    stroke="#c084fc"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft + chartWidth - 140}
                    y={priceToY(auditedSignal.auditLevels.swingLow) + 13}
                    fill="#c084fc"
                    fontSize="9.5"
                    fontWeight="bold"
                  >
                    SWING LOW: {formatPrice(auditedSignal.auditLevels.swingLow, auditedSignal.symbol)}
                  </text>
                </g>
              )}

              {/* BOS Candle Time Marker */}
              {(() => {
                if (!auditedSignal.auditLevels.bosCandleTime) return null;
                const bosTime = auditedSignal.auditLevels.bosCandleTime;
                let closestIdx = -1;
                let minDiff = Infinity;
                visibleCandles.forEach((c, idx) => {
                  const diff = Math.abs(c.time - bosTime);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = idx;
                  }
                });
                if (closestIdx >= 0) {
                  const x = candleToX(closestIdx);
                  return (
                    <g key="audit-bos-marker">
                      <line
                        x1={x}
                        y1={paddingTop}
                        x2={x}
                        y2={paddingTop + chartHeight}
                        stroke="#eab308"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                      <rect
                        x={x - 45}
                        y={paddingTop + 5}
                        width="90"
                        height="18"
                        rx="3"
                        fill="#090d16"
                        stroke="#eab308"
                        strokeWidth="1.5"
                      />
                      <text
                        x={x}
                        y={paddingTop + 17}
                        fill="#eab308"
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        BOS CONFIRMED
                      </text>
                    </g>
                  );
                }
                return null;
              })()}
            </g>
          )}

          {/* Crosshair Lines */}
          {showCrosshair && mousePos && mousePos.x >= paddingLeft && mousePos.x <= paddingLeft + chartWidth && (
            <g>
              <line
                x1={mousePos.x}
                y1={paddingTop}
                x2={mousePos.x}
                y2={paddingTop + chartHeight}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={paddingLeft}
                y1={mousePos.y}
                x2={paddingLeft + chartWidth}
                y2={mousePos.y}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          )}

          {/* Empty Chart Canvas Background */}
          {!hasCandles && (
            <rect
              x={paddingLeft}
              y={paddingTop}
              width={chartWidth}
              height={chartHeight}
              fill="#070a12"
              fillOpacity="0.5"
            />
          )}
        </svg>

        {/* RIGHT EDGE PRICE SCALE & LABELS (MANDATORY REQUIREMENT) */}
        <div 
          className="absolute right-0 top-0 bottom-0 bg-[#070b14] border-l border-slate-800 flex flex-col font-mono select-none"
          style={{ width: `${paddingRight}px` }}
        >
          {!hasCandles ? (
            <div className="flex-1 flex flex-col items-center justify-center p-2 text-center">
              <span className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                No data
              </span>
            </div>
          ) : (
            <>
              {/* Grid Level Price Tags */}
              {gridPrices.map((p, idx) => {
                const y = priceToY(p);
                return (
                  <div
                    key={`scale-${idx}`}
                    className="absolute text-[11px] text-slate-400 font-mono pl-2"
                    style={{ top: `${y - 8}px` }}
                  >
                    {formatPrice(p, symbol)}
                  </div>
                );
              })}

              {/* Volume Profile POC/VAH/VAL Right Edge Badges */}
              {showVolumeProfile && (
                <>
                  <div
                    className="absolute left-1 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-500/50 shadow"
                    style={{ top: `${priceToY(volumeProfile.poc) - 10}px` }}
                  >
                    POC {formatPrice(volumeProfile.poc, symbol)}
                  </div>
                  <div
                    className="absolute left-1 z-10 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40"
                    style={{ top: `${priceToY(volumeProfile.vah) - 9}px` }}
                  >
                    VAH {formatPrice(volumeProfile.vah, symbol)}
                  </div>
                  <div
                    className="absolute left-1 z-10 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40"
                    style={{ top: `${priceToY(volumeProfile.val) - 9}px` }}
                  >
                    VAL {formatPrice(volumeProfile.val, symbol)}
                  </div>
                </>
              )}

              {/* Current Live Price Right Edge Pill */}
              <div
                className={`absolute left-0 right-0 z-20 px-2 py-1 text-[11px] font-black shadow-lg flex items-center justify-between ${
                  !isMarketOpen ? 'bg-slate-700 text-slate-200' : 'bg-cyan-400 text-slate-950'
                }`}
                style={{ top: `${priceToY(currentBid) - 12}px` }}
              >
                <span>{isMarketOpen ? 'LIVE' : 'CLOSED'}</span>
                <span>{formatPrice(currentBid, symbol)}</span>
              </div>

              {/* ENTRY / SL / TP LABELS SITTING AT THE RIGHT EDGE */}
              {showEntrySLTP && (auditedSignal || activeSignal) && (() => {
                const targetSignal = auditedSignal || activeSignal;
                if (!targetSignal) return null;
                return (
                  <>
                    {/* ENTRY LABEL */}
                    <div
                      className="absolute left-0 z-30 px-1.5 py-1 text-[10.5px] font-bold text-cyan-200 bg-cyan-950/95 border-l-2 border-cyan-400 border-y border-r border-cyan-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                      style={{ top: `${priceToY(targetSignal.entryPrice) - 11}px` }}
                    >
                      <span className="text-[9px] uppercase font-mono tracking-wider">ENTRY</span>
                      <span>{formatPrice(targetSignal.entryPrice, symbol)}</span>
                    </div>

                    {/* STOP LOSS LABEL */}
                    <div
                      className="absolute left-0 z-30 px-1.5 py-1 text-[10.5px] font-bold text-rose-200 bg-rose-950/95 border-l-2 border-rose-500 border-y border-r border-rose-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                      style={{ top: `${priceToY(targetSignal.stopLoss) - 11}px` }}
                    >
                      <span className="text-[9px] uppercase font-mono tracking-wider text-rose-400">SL</span>
                      <span>{formatPrice(targetSignal.stopLoss, symbol)}</span>
                    </div>

                    {/* SINGLE TAKE PROFIT LABEL (2R) */}
                    <div
                      className="absolute left-0 z-30 px-1.5 py-1 text-[10px] font-bold text-emerald-200 bg-emerald-950/95 border-l-2 border-emerald-400 border-y border-r border-emerald-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                      style={{ top: `${priceToY(targetSignal.tp) - 10}px` }}
                    >
                      <span className="text-[9px] uppercase font-mono tracking-wider text-emerald-300">TP (2R)</span>
                      <span>{formatPrice(targetSignal.tp, symbol)}</span>
                    </div>
                  </>
                );
              })()}

              {/* Mouse Crosshair Price Tag */}
              {showCrosshair && mousePos && (
                <div
                  className="absolute left-0 right-0 z-40 px-2 py-0.5 text-[10.5px] font-mono text-slate-100 bg-slate-800 border-l-2 border-cyan-400 shadow"
                  style={{ top: `${mousePos.y - 10}px` }}
                >
                  {formatPrice(yToPrice(mousePos.y), symbol)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Disconnected Overlay */}
        {/* Disconnected Overlay (When not connected and not simulation) */}
        {!isConnected && !isSimulation && !isBlockedRegion && hasCandles && (
          <div className="absolute inset-0 z-30 bg-[#090d16]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-500 mb-2">
              <Activity className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">Market Data Not Connected</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Live chart feed and institutional signals require an active connection to Deriv WebSocket or Binance. Open Market Data or toggle Simulation Mode to inspect setups.
            </p>
          </div>
        )}

        {/* Requirement 3 & 4: Truthful Empty Chart Diagnostics with Backoff, Errors, and Region Block Notice */}
        {!hasCandles && !isSimulation && (
          <div className="absolute inset-0 bg-[#070b14]/92 backdrop-blur-sm z-30 flex items-center justify-center p-4">
            <div className="max-w-xl w-full bg-[#0b0f19] border border-slate-700/80 rounded-2xl p-5 shadow-2xl font-mono space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Market Data Feed Diagnostics</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-bold">
                    {provider}
                  </span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30 font-bold">
                    {timeframe}
                  </span>
                </div>
              </div>

              {/* Real reason breakdown */}
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2 p-2 bg-[#050811] rounded-lg border border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Symbol:</span>
                    <span className="text-slate-200 font-bold">{symbol}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Broker Symbol:</span>
                    <span className="text-slate-300">{exactBrokerSymbol || symbol}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Market Status:</span>
                    <span className={isMarketOpen ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {isMarketOpen ? 'OPEN' : 'MARKET CLOSED'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#050811] rounded-lg border border-slate-800/80 space-y-1">
                  <div className="text-slate-500 text-[10.5px]">Last Request Sent:</div>
                  <div className="text-slate-300 font-mono text-[11px] break-all">
                    {symbolDebugInfo?.lastRequestSent || (provider === 'BINANCE' 
                      ? `${binanceMarketType === 'SPOT' ? 'https://data-api.binance.vision/api/v3/klines' : 'https://fapi.binance.com/fapi/v1/klines'}?symbol=${symbol.replace('/', '')}&interval=${timeframe}`
                      : `ticks_history: ${exactBrokerSymbol || symbol}, style: candles, count: 1000, granularity: ${timeframe}`)}
                  </div>
                </div>

                <div className="p-2.5 bg-[#050811] rounded-lg border border-slate-800/80 space-y-1">
                  <div className="text-slate-500 text-[10.5px]">Full Response / Error Details:</div>
                  <div className="text-rose-300 font-mono text-[11px] break-all">
                    {isBlockedRegion || binanceErrorMessage?.includes('451')
                      ? 'Binance Futures blocked in this server region (HTTP 451)'
                      : derivErrorMessage
                      ? derivErrorMessage
                      : symbolDebugInfo?.errorMessage
                      ? symbolDebugInfo.errorMessage
                      : !isMarketOpen
                      ? 'Market is currently closed for weekend or broker trading suspension. Closed session history pending.'
                      : isSynthesizedTimeframe && candles.length === 0
                      ? `${timeframe} requires complete contiguous closed source candles (${timeframe === '10m' ? 'M5' : 'M15'}). Source candles missing or awaiting completion.`
                      : 'Connecting to WebSocket stream and awaiting live candle delivery.'}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Last Attempt: {new Date(now).toISOString().substring(11, 19)} UTC</span>
                  </div>
                  <div className="text-cyan-400 font-bold">
                    Next retry in {retryCountdown}s
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                {(isBlockedRegion || binanceErrorMessage?.includes('451')) && onBinanceMarketTypeChange && (
                  <button
                    onClick={() => onBinanceMarketTypeChange('SPOT')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-900 transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Switch to Binance Spot for BTC</span>
                  </button>
                )}
                {onRetryNow && (
                  <button
                    onClick={onRetryNow}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Retry Now</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile specification badge: Binance Real Volume vs Deriv Time-At-Price */}
        {showVolumeProfile && (
          <div className="absolute top-12 left-4 z-20 flex items-center gap-1.5 bg-slate-950/90 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg shadow-lg font-mono">
            <span className={`w-2 h-2 rounded-full ${isBinance ? 'bg-emerald-400' : 'bg-cyan-400'}`}></span>
            <span>Profile: {getTruthfulProfileLabel(volumeProfile.label, hasCandles)}</span>
          </div>
        )}

        {/* Data Feed Stale Warning Badge (Requirement 7 & Fix 2: Open markets only) */}
        {isStale && isMarketOpen && (
          <div className="absolute top-2 right-4 z-20 flex items-center gap-1.5 bg-rose-950/90 border border-rose-500/50 text-rose-300 text-xs px-3 py-1.5 rounded-lg shadow-xl font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>FEED STALE (&gt;15s) — SIGNALS BLOCKED</span>
          </div>
        )}

        {/* Market Closed Badge (Requirement 2) */}
        {!isMarketOpen && (
          <div className="absolute top-2 right-4 z-20 flex items-center gap-1.5 bg-slate-950/90 border border-amber-500/40 text-amber-300 text-xs px-3 py-1.5 rounded-lg shadow-lg font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>MARKET CLOSED</span>
          </div>
        )}

        {/* Hovered Candle Floating Inspector Badge */}
        {hoveredCandle && (
          <div className="absolute top-2 left-4 z-20 flex flex-wrap items-center gap-3 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 shadow-xl">
            <span className="text-slate-400">
              {new Date(hoveredCandle.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span>O: <strong className="text-slate-100">{formatPrice(hoveredCandle.open, symbol)}</strong></span>
            <span>H: <strong className="text-emerald-400">{formatPrice(hoveredCandle.high, symbol)}</strong></span>
            <span>L: <strong className="text-rose-400">{formatPrice(hoveredCandle.low, symbol)}</strong></span>
            <span>C: <strong className="text-slate-100">{formatPrice(hoveredCandle.close, symbol)}</strong></span>
            <span className="text-slate-400">
              Vol: <strong>{hoveredCandle.volume ? hoveredCandle.volume.toLocaleString() : 'NONE'}</strong>
            </span>
            {hoveredCandle.sourceCandleTimes && hoveredCandle.sourceCandleTimes.length > 0 && (
              <span className="text-[10.5px] px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-500/30">
                Source: [{hoveredCandle.sourceCandleTimes.map(t => new Date(t * 1000).toISOString().substring(11, 16)).join(', ')} UTC]
              </span>
            )}
            {hoveredCandle.isOffHours && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[10px]">
                OFF-HOURS
              </span>
            )}
            {hoveredCandle.isForming && (
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30 text-[10px]">
                FORMING
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Chart Footer: Data Source & Volume Coordinates */}
      <div className="flex flex-wrap items-center justify-between px-4 py-1.5 bg-[#070b14] border-t border-slate-800 text-[11px] text-slate-400 font-mono gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              !isMarketOpen
                ? 'bg-amber-400'
                : isConnected
                ? (isStale ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse')
                : isSimulation
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}></span>
            <span className="font-bold text-slate-300">
              DATA SOURCE: {provider === 'BINANCE' ? `BINANCE ${binanceMarketType}` : dataSource.toUpperCase()} ({exactBrokerSymbol || symbol})
            </span>
          </span>
          <span className="text-slate-500">|</span>
          <span>
            VOLUME: <strong className={!hasCandles ? 'text-slate-500' : volumeType === 'NONE' ? 'text-amber-300' : 'text-emerald-400'}>
              {!hasCandles ? 'NO DATA' : volumeType === 'REAL_VOLUME' ? 'REAL (Binance trade execution)' : volumeType}
            </strong>
          </span>
          <span className="text-slate-500">|</span>
          <span>
            STATUS: <strong className={!hasCandles && currentBid === 0 ? 'text-slate-500' : isMarketOpen ? 'text-emerald-400' : 'text-amber-300'}>
              {getTruthfulStatus(isMarketOpen, hasCandles || currentBid > 0, !symInfo?.isAvailable)}
            </strong>
          </span>
          {formingCandle && isMarketOpen && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-400 font-semibold">
                FORMING CANDLE: ACTIVE
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>UTC {new Date().toISOString().substring(11, 19)}</span>
        </div>
      </div>
    </div>
  );
};
