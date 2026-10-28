import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Candle, Timeframe, TradingSignal } from '../types';
import { calculateVolumeProfile } from '../engine/volumeProfile';
import { analyzeMarketStructure } from '../engine/structure';
import { detectFairValueGaps, detectOrderBlocks } from '../engine/smc';
import { getActiveSessionSchedules } from '../engine/sessions';
import { SUPPORTED_SYMBOLS, formatPrice } from '../data/symbolMapping';
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
  Crosshair
} from 'lucide-react';

interface ChartComponentProps {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  candles: Candle[];
  activeSignal?: TradingSignal | null;
  currentBid: number;
  currentAsk: number;
  isConnected: boolean;
  isSimulation: boolean;
}

export const ChartComponent: React.FC<ChartComponentProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  candles,
  activeSignal,
  currentBid,
  currentAsk,
  isConnected,
  isSimulation
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 850, height: 500 });

  // Toggleable Overlays State
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showSMC, setShowSMC] = useState(true);
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

  // Compute sliced visible candles based on pan
  const visibleCandles = useMemo(() => {
    if (!candles.length) return [];
    const endIndex = Math.max(0, candles.length - panOffset);
    const startIndex = Math.max(0, endIndex - visibleCount);
    return candles.slice(startIndex, endIndex);
  }, [candles, visibleCount, panOffset]);

  // Derived Indicators
  const volumeProfile = useMemo(() => {
    return calculateVolumeProfile(visibleCandles, symInfo.digits, symInfo.pipSize);
  }, [visibleCandles, symInfo]);

  const structure = useMemo(() => {
    return analyzeMarketStructure(visibleCandles, timeframe);
  }, [visibleCandles, timeframe]);

  const fvgs = useMemo(() => {
    return detectFairValueGaps(visibleCandles, timeframe);
  }, [visibleCandles, timeframe]);

  const orderBlocks = useMemo(() => {
    return detectOrderBlocks(visibleCandles, timeframe);
  }, [visibleCandles, timeframe]);

  // Chart coordinate math
  const paddingRight = 95; // Dedicated right edge space for Entry/SL/TP labels & price scale
  const paddingLeft = 15;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = Math.max(200, dimensions.width - paddingLeft - paddingRight);
  const chartHeight = Math.max(200, dimensions.height - paddingTop - paddingBottom);

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (!visibleCandles.length) return { minPrice: 0, maxPrice: 100, priceRange: 100 };
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
    const margin = (max - min) * 0.08 || 1;
    return {
      minPrice: min - margin,
      maxPrice: max + margin,
      priceRange: (max + margin) - (min - margin)
    };
  }, [visibleCandles, showEntrySLTP, activeSignal]);

  const priceToY = (price: number): number => {
    if (priceRange <= 0) return chartHeight / 2 + paddingTop;
    return paddingTop + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  const yToPrice = (y: number): number => {
    const fraction = (chartHeight - (y - paddingTop)) / chartHeight;
    return minPrice + fraction * priceRange;
  };

  const candleSpacing = visibleCandles.length > 0 ? chartWidth / visibleCandles.length : 10;
  const candleBodyWidth = Math.max(2, candleSpacing * 0.7);

  const candleToX = (index: number): number => {
    return paddingLeft + index * candleSpacing + candleSpacing / 2;
  };

  // Price Grid Lines
  const gridTicks = 6;
  const gridPrices = useMemo(() => {
    const ticks: number[] = [];
    const step = priceRange / gridTicks;
    for (let i = 0; i <= gridTicks; i++) {
      ticks.push(minPrice + i * step);
    }
    return ticks;
  }, [minPrice, priceRange]);

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
          </div>

          <div className="flex items-center bg-[#070a12] p-0.5 rounded-lg border border-slate-800 text-xs font-semibold">
            {(['M1', 'M5', 'M15', 'H1', 'H4', 'D1'] as Timeframe[]).map((tf) => (
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

        {/* Live Spread & Bid/Ask Pill */}
        <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
            <span>BID</span>
            <span className="text-emerald-400 font-bold">{formatPrice(currentBid, symbol)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
            <span>ASK</span>
            <span className="text-rose-400 font-bold">{formatPrice(currentAsk, symbol)}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Spread: <span className="text-amber-300 font-bold">{symInfo.spreadPips} pips</span>
          </div>
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
            return (
              <g key={fvg.id}>
                <rect
                  x={x}
                  y={Math.min(yTop, yBottom)}
                  width={chartWidth + paddingLeft - x}
                  height={Math.max(2, height)}
                  fill={fvg.direction === 'BULLISH' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'}
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
            return (
              <g key={ob.id}>
                <rect
                  x={x}
                  y={Math.min(yTop, yBottom)}
                  width={chartWidth + paddingLeft - x}
                  height={Math.max(3, height)}
                  fill={ob.direction === 'BULLISH' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(234, 179, 8, 0.14)'}
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

          {/* Active Signal: ENTRY, SL, TP LINES with RIGHT-EDGE LABELS */}
          {showEntrySLTP && activeSignal && (
            <g>
              {/* Entry Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(activeSignal.entryPrice)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(activeSignal.entryPrice)}
                stroke="#06b6d4"
                strokeWidth="1.8"
              />
              {/* Stop Loss Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(activeSignal.stopLoss)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(activeSignal.stopLoss)}
                stroke="#ef4444"
                strokeWidth="1.8"
                strokeDasharray="4 2"
              />
              {/* Single Take Profit (2R) Line */}
              <line
                x1={paddingLeft}
                y1={priceToY(activeSignal.tp)}
                x2={paddingLeft + chartWidth}
                y2={priceToY(activeSignal.tp)}
                stroke="#10b981"
                strokeWidth="1.8"
                strokeDasharray="4 2"
              />
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
        </svg>

        {/* RIGHT EDGE PRICE SCALE & LABELS (MANDATORY REQUIREMENT) */}
        <div 
          className="absolute right-0 top-0 bottom-0 bg-[#070b14] border-l border-slate-800 flex flex-col justify-between font-mono select-none"
          style={{ width: `${paddingRight}px` }}
        >
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
            className="absolute left-0 right-0 z-20 px-2 py-1 text-[11px] font-black text-slate-950 bg-cyan-400 shadow-lg flex items-center justify-between"
            style={{ top: `${priceToY(currentBid) - 12}px` }}
          >
            <span>LIVE</span>
            <span>{formatPrice(currentBid, symbol)}</span>
          </div>

          {/* ENTRY / SL / TP LABELS SITTING AT THE RIGHT EDGE */}
          {showEntrySLTP && activeSignal && (
            <>
              {/* ENTRY LABEL */}
              <div
                className="absolute left-0 z-30 px-1.5 py-1 text-[10.5px] font-bold text-cyan-200 bg-cyan-950/95 border-l-2 border-cyan-400 border-y border-r border-cyan-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                style={{ top: `${priceToY(activeSignal.entryPrice) - 11}px` }}
              >
                <span className="text-[9px] uppercase font-mono tracking-wider">ENTRY</span>
                <span>{formatPrice(activeSignal.entryPrice, symbol)}</span>
              </div>

              {/* STOP LOSS LABEL */}
              <div
                className="absolute left-0 z-30 px-1.5 py-1 text-[10.5px] font-bold text-rose-200 bg-rose-950/95 border-l-2 border-rose-500 border-y border-r border-rose-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                style={{ top: `${priceToY(activeSignal.stopLoss) - 11}px` }}
              >
                <span className="text-[9px] uppercase font-mono tracking-wider text-rose-400">SL</span>
                <span>{formatPrice(activeSignal.stopLoss, symbol)}</span>
              </div>

              {/* SINGLE TAKE PROFIT LABEL (2R) */}
              <div
                className="absolute left-0 z-30 px-1.5 py-1 text-[10px] font-bold text-emerald-200 bg-emerald-950/95 border-l-2 border-emerald-400 border-y border-r border-emerald-800/80 rounded-r shadow-md flex items-center justify-between w-full"
                style={{ top: `${priceToY(activeSignal.tp) - 10}px` }}
              >
                <span className="text-[9px] uppercase font-mono tracking-wider text-emerald-300">TP (2R)</span>
                <span>{formatPrice(activeSignal.tp, symbol)}</span>
              </div>
            </>
          )}

          {/* Mouse Crosshair Price Tag */}
          {showCrosshair && mousePos && (
            <div
              className="absolute left-0 right-0 z-40 px-2 py-0.5 text-[10.5px] font-mono text-slate-100 bg-slate-800 border-l-2 border-cyan-400 shadow"
              style={{ top: `${mousePos.y - 10}px` }}
            >
              {formatPrice(yToPrice(mousePos.y), symbol)}
            </div>
          )}
        </div>

        {/* Disconnected Overlay (Requirement 1) */}
        {!isConnected && !isSimulation && (
          <div className="absolute inset-0 z-30 bg-[#090d16]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-500 mb-2">
              <Activity className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">cTrader Not Connected</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Live chart feed and institutional signals require a verified cTrader connection. Configure credentials in Market Data or toggle Simulation Mode to inspect setups.
            </p>
          </div>
        )}

        {/* Hovered Candle Floating Inspector Badge */}
        {hoveredCandle && (
          <div className="absolute top-2 left-4 z-20 flex items-center gap-3 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 shadow-xl">
            <span className="text-slate-400">
              {new Date(hoveredCandle.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span>O: <strong className="text-slate-100">{formatPrice(hoveredCandle.open, symbol)}</strong></span>
            <span>H: <strong className="text-emerald-400">{formatPrice(hoveredCandle.high, symbol)}</strong></span>
            <span>L: <strong className="text-rose-400">{formatPrice(hoveredCandle.low, symbol)}</strong></span>
            <span>C: <strong className="text-slate-100">{formatPrice(hoveredCandle.close, symbol)}</strong></span>
            <span className="text-slate-400">Vol: <strong>{hoveredCandle.volume.toLocaleString()}</strong></span>
          </div>
        )}
      </div>

      {/* Bottom Chart Footer: Status & Time Coordinates */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#070b14] border-t border-slate-800 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : isSimulation ? 'bg-amber-400' : 'bg-rose-500'}`}></span>
            <span>{isConnected ? 'cTrader: LIVE STREAMING' : isSimulation ? 'SIMULATION MODE ACTIVE' : 'cTrader: NOT CONNECTED'}</span>
          </span>
          <span>VOLUME: APPROXIMATE (tick volume)</span>
        </div>
        <div className="flex items-center gap-2">
          <span>UTC {new Date().toISOString().substring(11, 19)}</span>
        </div>
      </div>
    </div>
  );
};
