import { Candle, Timeframe, Tick, MarketDataConfig, SymbolInfo } from '../types';

export function getTimeframeSeconds(tf: Timeframe): number {
  switch (tf) {
    case 'M1': return 60;
    case 'M5': return 300;
    case '10m': return 600;
    case 'M15': return 900;
    case '45m': return 2700;
    case '1H':
    case 'H1': return 3600;
    case 'H4': return 14400;
    case 'D1': return 86400;
    default: return 900;
  }
}

/**
 * Default Market Data Config (Deriv public WS + Binance crypto).
 * No token, read-only, honest statuses, no simulation shown as live.
 */
export const INITIAL_MARKET_DATA_CONFIG: MarketDataConfig = {
  deriv: {
    connected: false,
    status: 'DISCONNECTED',
    latencyMs: null,
    lastHeartbeat: null,
    isStale: false,
    lastMessageTime: null,
    activeSymbolsCount: 0,
    activeSymbolsLoading: false,
    activeSymbolsError: null,
    symbolDebugInfo: {},
    endpoint: 'wss://api.derivws.com/trading/v1/options/ws/public',
    errorMessage: null,
    simulationMode: false
  },
  binance: {
    connected: false,
    status: 'DISCONNECTED',
    latencyMs: null,
    lastUpdate: null,
    isStale: false,
    marketType: 'SPOT',
    activeSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    restEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    wsEndpoint: 'wss://stream.binance.com:9443',
    errorMessage: null,
    isBlockedRegion: false
  },
  simulationMode: false, // OFF by default
  connected: false,
  latencyMs: null,
  isStale: false,
  allowQuietHoursSignals: true // ON by default
};

/**
 * Simulation Mode candle generator:
 * Kept ONLY behind the clearly labelled "SIMULATION MODE" toggle.
 * Never called on live paths.
 */
export function generateSimulatedCandles(
  symbol: string,
  timeframe: Timeframe,
  count = 120,
  referencePrice?: number
): Candle[] {
  const basePrice = referencePrice || (symbol === 'XAU/USD' ? 2740.0 : symbol === 'US30' ? 42300 : symbol.includes('100') ? 20300 : 1.0850);
  const tfSeconds = getTimeframeSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const pip = symbol.includes('USD') && symbol.length === 7 ? 0.0001 : 0.1;
  const stepVol = pip * 10;

  const candles: Candle[] = [];
  let currentClose = basePrice - (count * stepVol * 0.1);

  for (let i = count - 1; i >= 0; i--) {
    const candleTime = now - (i * tfSeconds);
    const cyclePhase = Math.sin((count - i) / 10) + Math.cos((count - i) / 4) * 0.5;
    const delta = cyclePhase * stepVol * 0.4 + (Math.random() - 0.48) * stepVol;

    const open = currentClose;
    const close = open + delta;
    const upperWick = Math.random() * stepVol * 0.7;
    const lowerWick = Math.random() * stepVol * 0.7;
    const high = Math.max(open, close) + upperWick;
    const low = Math.min(open, close) - lowerWick;

    // Tick volume
    const volume = Math.round(500 + Math.random() * 800);
    const buyVolume = Math.round(volume * (close >= open ? 0.55 : 0.45));
    const sellVolume = volume - buyVolume;

    currentClose = close;

    candles.push({
      time: candleTime,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
      buyVolume,
      sellVolume
    });
  }

  return candles;
}

export const generateCandles = generateSimulatedCandles;

/**
 * Updates live candles from broker tick execution
 */
export function updateCandlesWithTick(
  candles: Candle[],
  tick: Tick,
  timeframe: Timeframe,
  digits: number
): { candles: Candle[]; isNewCandle: boolean } {
  if (!candles || candles.length === 0) {
    const newCandle: Candle = {
      time: Math.floor(tick.time / getTimeframeSeconds(timeframe)) * getTimeframeSeconds(timeframe),
      open: tick.bid,
      high: Math.max(tick.bid, tick.ask),
      low: Math.min(tick.bid, tick.ask),
      close: tick.bid,
      volume: tick.volume || 1,
      buyVolume: Math.round((tick.volume || 1) * 0.5),
      sellVolume: Math.round((tick.volume || 1) * 0.5)
    };
    return { candles: [newCandle], isNewCandle: true };
  }

  const tfSeconds = getTimeframeSeconds(timeframe);
  const currentCandleTime = Math.floor(tick.time / tfSeconds) * tfSeconds;
  const lastIndex = candles.length - 1;
  const lastCandle = candles[lastIndex];

  if (currentCandleTime > lastCandle.time) {
    const newCandle: Candle = {
      time: currentCandleTime,
      open: tick.bid,
      high: Math.max(tick.bid, tick.ask),
      low: Math.min(tick.bid, tick.ask),
      close: tick.bid,
      volume: tick.volume || 1,
      buyVolume: Math.round((tick.volume || 1) * 0.5),
      sellVolume: Math.round((tick.volume || 1) * 0.5)
    };
    return {
      candles: [...candles.slice(-299), newCandle],
      isNewCandle: true
    };
  } else {
    const updated = { ...lastCandle };
    updated.close = tick.bid;
    if (tick.bid > updated.high) updated.high = tick.bid;
    if (tick.bid < updated.low) updated.low = tick.bid;
    updated.volume += (tick.volume || 1);

    const nextList = [...candles];
    nextList[lastIndex] = updated;
    return { candles: nextList, isNewCandle: false };
  }
}
