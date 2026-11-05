import { 
  Candle, 
  Timeframe, 
  BinanceConnectionState, 
  BinanceMarketType 
} from '../types';
import { isNewYorkRegularHours } from '../engine/sessions';

export type OnBinanceCandlesCallback = (
  displaySymbol: string, // e.g. "BTC/USDT"
  closedCandles: Candle[],
  formingCandle: Candle | null,
  isClosedUpdate: boolean // true only when candle "x" closed
) => void;

export type OnBinanceStatusCallback = (state: BinanceConnectionState) => void;

/**
 * Mapping from GREVIN Timeframe to Binance kline interval strings
 */
export function getBinanceInterval(tf: Timeframe): string {
  switch (tf) {
    case 'M1': return '1m';
    case 'M5': return '5m';
    case '10m': return '15m';
    case 'M15': return '15m';
    case '45m': return '1h';
    case '1H':
    case 'H1': return '1h';
    case 'H4': return '4h';
    case 'D1': return '1d';
    default: return '15m';
  }
}

/**
 * Normalizes symbol between display ("BTC/USDT") and Binance format ("BTCUSDT")
 */
export function toBinanceSymbol(sym: string): string {
  return sym.replace('/', '').toUpperCase();
}

export function toDisplaySymbol(binanceSym: string): string {
  const upper = binanceSym.toUpperCase();
  if (upper.endsWith('USDT')) {
    return `${upper.slice(0, -4)}/USDT`;
  }
  return upper;
}

/**
 * Production-grade Binance Market Data Provider
 *
 * Implements:
 * 1. Spot REST & WS: https://data-api.binance.vision/api/v3/klines and wss://stream.binance.com:9443
 * 2. Futures REST & WS: https://fapi.binance.com/fapi/v1/klines and wss://fstream.binance.com
 * 3. Spot / Futures switching with exact symbol labeling and REAL volume type.
 * 4. Customizable symbols (BTCUSDT, SPYUSDT, QQQUSDT).
 * 5. Signals evaluated ONLY on closed candles (kline "x" flag), forming candle tracked separately.
 * 6. Proactive reconnect before 24h limit, auto-reconnect with exponential backoff on drop, missed candle backfill.
 * 7. Rate limit throttling & ping/pong handling.
 * 8. 15-second staleness watchdog, HTTP 451 regional block detection (honest status, no faked data).
 * 9. Pure UTC session alignment.
 */
export class BinanceMarketDataProvider {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private proactiveReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private staleWatchdogInterval: ReturnType<typeof setInterval> | null = null;
  private manualDisconnect = false;
  private reconnectAttempts = 0;

  // Configuration
  private marketType: BinanceMarketType = 'SPOT';
  private symbols: string[] = ['BTCUSDT', 'SPYUSDT', 'QQQUSDT'];
  private activeTimeframe: Timeframe = 'M15';

  // State
  private state: BinanceConnectionState = {
    connected: false,
    status: 'DISCONNECTED',
    latencyMs: null,
    lastUpdate: null,
    isStale: false,
    marketType: 'SPOT',
    activeSymbols: ['BTCUSDT', 'SPYUSDT', 'QQQUSDT'],
    restEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    wsEndpoint: 'wss://stream.binance.com:9443',
    errorMessage: null,
    isBlockedRegion: false
  };

  // Candle Stores per symbol
  private closedCandlesMap: Record<string, Candle[]> = {};
  private formingCandlesMap: Record<string, Candle | null> = {};

  // Callbacks
  private onCandlesCallback: OnBinanceCandlesCallback | null = null;
  private onStatusCallback: OnBinanceStatusCallback | null = null;

  constructor(onStatus?: OnBinanceStatusCallback, onCandles?: OnBinanceCandlesCallback) {
    if (onStatus) this.onStatusCallback = onStatus;
    if (onCandles) this.onCandlesCallback = onCandles;
  }

  public getState(): BinanceConnectionState {
    return { ...this.state };
  }

  public getMarketType(): BinanceMarketType {
    return this.marketType;
  }

  public getSymbols(): string[] {
    return [...this.symbols];
  }

  /**
   * Set market type: 'SPOT' or 'FUTURES'
   */
  public setMarketType(type: BinanceMarketType): void {
    if (this.marketType === type) return;
    this.marketType = type;
    this.updateEndpoints();
    this.state.marketType = type;
    this.notifyStatus();

    // Reconnect socket and reload history for new market type
    this.reconnect();
  }

  /**
   * Set active symbols list (e.g. BTCUSDT, ETHUSDT, SOLUSDT, editable)
   */
  public setSymbols(symbols: string[]): void {
    const cleaned = symbols.map(s => toBinanceSymbol(s)).filter(Boolean);
    if (cleaned.length === 0) return;
    this.symbols = cleaned;
    this.state.activeSymbols = cleaned;
    this.notifyStatus();
    this.reconnect();
  }

  /**
   * Set active timeframe
   */
  public setTimeframe(tf: Timeframe): void {
    if (this.activeTimeframe === tf) return;
    this.activeTimeframe = tf;
    this.reconnect();
  }

  /**
   * Updates REST and WS endpoints based on SPOT vs FUTURES
   */
  private updateEndpoints(): void {
    if (this.marketType === 'SPOT') {
      this.state.restEndpoint = 'https://data-api.binance.vision/api/v3/klines';
      this.state.wsEndpoint = 'wss://stream.binance.com:9443';
    } else {
      this.state.restEndpoint = 'https://fapi.binance.com/fapi/v1/klines';
      this.state.wsEndpoint = 'wss://fstream.binance.com';
    }
  }

  private notifyStatus(): void {
    if (this.onStatusCallback) {
      this.onStatusCallback({ ...this.state });
    }
  }

  /**
   * Connects to Binance live WebSocket stream and loads initial historical candles
   */
  public async connect(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.manualDisconnect = false;
    this.updateEndpoints();

    this.state.status = this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING';
    this.notifyStatus();

    // Start 15-second staleness watchdog
    this.startStaleWatchdog();

    // Load initial historical candles for all active symbols via REST
    await this.loadAllHistoricalCandles();

    // Open WebSocket stream
    this.openWebSocket();
  }

  /**
   * Closes connection cleanly
   */
  public disconnect(): void {
    this.manualDisconnect = true;
    this.cleanupTimers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.state.connected = false;
    this.state.status = 'DISCONNECTED';
    this.notifyStatus();
  }

  /**
   * Reconnects cleanly
   */
  public reconnect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.cleanupTimers();
    this.connect();
  }

  private cleanupTimers(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.proactiveReconnectTimeout) clearTimeout(this.proactiveReconnectTimeout);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.staleWatchdogInterval) clearInterval(this.staleWatchdogInterval);
  }

  /**
   * Loads historical candles with pagination (minimum 1000 candles + previous day)
   */
  public async loadAllHistoricalCandles(): Promise<void> {
    for (const sym of this.symbols) {
      try {
        await this.loadSymbolHistory(sym, this.activeTimeframe);
      } catch (err: any) {
        console.warn(`[Binance] Failed to load history for ${sym}:`, err?.message);
      }
    }
  }

  /**
   * Fetches historical klines via REST with pagination to load at least 1000 candles
   * and cover the full previous calendar day in UTC.
   */
  public async loadSymbolHistory(symbol: string, tf: Timeframe, targetCount = 1000): Promise<Candle[]> {
    const interval = getBinanceInterval(tf);
    const baseUrl = this.marketType === 'SPOT'
      ? 'https://data-api.binance.vision/api/v3/klines'
      : 'https://fapi.binance.com/fapi/v1/klines';

    let allCandles: Candle[] = [];

    // Calculate full previous day start UTC
    const now = new Date();
    const utcMidnightToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const fullPreviousDayStartUtc = (utcMidnightToday - 86400000) / 1000;

    try {
      // 1. Fetch initial batch (up to 1000)
      const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=1000`;
      const response = await fetch(url);

      if (response.status === 451) {
        this.state.isBlockedRegion = true;
        this.state.errorMessage = 'Binance blocked in this server region (HTTP 451)';
        this.state.status = 'ERROR';
        this.notifyStatus();
        return [];
      }

      if (response.status === 429) {
        console.warn('[Binance] Rate limit 429 hit. Waiting backoff...');
        await new Promise(r => setTimeout(r, 2000));
        return [];
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check weight header if available
      const usedWeight = response.headers.get('x-mbx-used-weight-1m');
      if (usedWeight) {
        this.state.rateLimitWeight1m = parseInt(usedWeight, 10);
      }

      const rawKlines = await response.json();
      if (!Array.isArray(rawKlines)) return [];

      allCandles = this.parseRawKlines(rawKlines, symbol);

      // 2. Paginate backwards if needed to reach targetCount or cover previous day
      let attempts = 0;
      while (
        allCandles.length < targetCount &&
        allCandles.length > 0 &&
        allCandles[0].time > fullPreviousDayStartUtc &&
        attempts < 2
      ) {
        attempts++;
        const oldestEpochMs = allCandles[0].time * 1000;
        const pageUrl = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${oldestEpochMs - 1}`;
        
        // Small throttle (100ms) to respect rate limits
        await new Promise(r => setTimeout(r, 100));

        const pageRes = await fetch(pageUrl);
        if (!pageRes.ok) break;

        const pageData = await pageRes.json();
        if (!Array.isArray(pageData) || pageData.length === 0) break;

        const olderCandles = this.parseRawKlines(pageData, symbol);
        allCandles = [...olderCandles, ...allCandles];
      }

      // Deduplicate and sort ascending
      const map = new Map<number, Candle>();
      for (const c of allCandles) {
        map.set(c.time, c);
      }
      const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);

      // Store in closedCandlesMap
      this.closedCandlesMap[symbol] = sorted;
      const displaySym = toDisplaySymbol(symbol);

      if (this.onCandlesCallback) {
        this.onCandlesCallback(displaySym, sorted, this.formingCandlesMap[symbol] || null, false);
      }

      return sorted;
    } catch (err: any) {
      if (err?.message?.includes('451')) {
        this.state.isBlockedRegion = true;
        this.state.errorMessage = 'Binance blocked in this server region (HTTP 451)';
        this.state.status = 'ERROR';
        this.notifyStatus();
      }
      return [];
    }
  }

  /**
   * Backfill missed candles after reconnect
   */
  private async backfillMissedCandles(): Promise<void> {
    const interval = getBinanceInterval(this.activeTimeframe);
    const baseUrl = this.marketType === 'SPOT'
      ? 'https://data-api.binance.vision/api/v3/klines'
      : 'https://fapi.binance.com/fapi/v1/klines';

    for (const sym of this.symbols) {
      const existing = this.closedCandlesMap[sym] || [];
      if (existing.length === 0) continue;

      const lastClosedSec = existing[existing.length - 1].time;
      const startTimeMs = (lastClosedSec + 1) * 1000;

      try {
        const url = `${baseUrl}?symbol=${sym}&interval=${interval}&startTime=${startTimeMs}&limit=1000`;
        const res = await fetch(url);
        if (!res.ok) continue;

        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const missed = this.parseRawKlines(raw, sym);
          const map = new Map<number, Candle>();
          for (const c of [...existing, ...missed]) {
            map.set(c.time, c);
          }
          const merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
          this.closedCandlesMap[sym] = merged;

          const displaySym = toDisplaySymbol(sym);
          if (this.onCandlesCallback) {
            this.onCandlesCallback(displaySym, merged, this.formingCandlesMap[sym] || null, false);
          }
        }
      } catch {}
    }
  }

  /**
   * Parses raw Binance kline JSON array into GREVIN Candle models.
   * If symbol is SPYUSDT or QQQUSDT, candles outside 09:30-16:00 New York
   * are tagged with isOffHours = true.
   */
  private parseRawKlines(rawList: any[], symbol?: string): Candle[] {
    const isEquityPerp = symbol ? (symbol.toUpperCase().includes('SPY') || symbol.toUpperCase().includes('QQQ')) : false;

    return rawList.map((item: any) => {
      const openTimeMs = item[0];
      const open = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const low = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const totalVolume = parseFloat(item[5]); // Genuine trade volume in base asset
      const takerBuyVolume = parseFloat(item[9] || (totalVolume * 0.5));
      const sellVolume = Math.max(0, totalVolume - takerBuyVolume);
      const timeSec = Math.floor(openTimeMs / 1000);
      const isOffHours = isEquityPerp ? !isNewYorkRegularHours(timeSec) : false;

      return {
        time: timeSec, // Unix timestamp in seconds (UTC)
        open,
        high,
        low,
        close,
        volume: totalVolume,
        buyVolume: takerBuyVolume,
        sellVolume,
        isForming: false,
        isOffHours
      };
    });
  }

  /**
   * Opens combined WebSocket stream for all active symbols
   */
  private openWebSocket(): void {
    if (this.manualDisconnect) return;

    const interval = getBinanceInterval(this.activeTimeframe);
    const streamNames = this.symbols
      .map(s => `${s.toLowerCase()}@kline_${interval}`)
      .join('/');

    const wsUrl = this.marketType === 'SPOT'
      ? `wss://stream.binance.com:9443/stream?streams=${streamNames}`
      : `wss://fstream.binance.com/stream?streams=${streamNames}`;

    const startTimestamp = Date.now();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.state.connected = true;
        this.state.status = 'CONNECTED';
        this.state.latencyMs = Math.max(1, Date.now() - startTimestamp);
        this.state.lastUpdate = Date.now();
        this.state.isStale = false;
        this.state.errorMessage = null;
        this.state.lastReconnectTime = Date.now();
        this.reconnectAttempts = 0;
        this.notifyStatus();

        // 1. Proactive reconnect before 24-hour limit (23h 30m)
        this.scheduleProactiveReconnect();

        // 2. Start periodic ping keepalive (every 3 minutes)
        this.startPingKeepalive();

        // 3. Backfill missed candles
        this.backfillMissedCandles();
      };

      this.ws.onmessage = (event) => {
        this.handleWsMessage(event.data);
      };

      this.ws.onerror = (_err) => {
        this.state.connected = false;
        this.state.status = 'ERROR';
        this.notifyStatus();
      };

      this.ws.onclose = (event) => {
        this.state.connected = false;
        this.state.status = 'DISCONNECTED';
        this.notifyStatus();

        if (!this.manualDisconnect) {
          // If close code is 451 or unexpected, handle exponential backoff
          const backoff = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts));
          this.reconnectAttempts++;
          console.log(`[Binance] Connection dropped (code ${event.code}). Reconnecting in ${backoff}ms...`);
          this.reconnectTimeout = setTimeout(() => {
            this.openWebSocket();
          }, backoff);
        }
      };
    } catch (err: any) {
      this.state.status = 'ERROR';
      this.state.errorMessage = err?.message || 'WebSocket connection error';
      this.notifyStatus();
    }
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleWsMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw);

      // Handle server ping frame payload if sent as JSON
      if (payload.ping) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ pong: payload.ping }));
        }
        return;
      }

      // Binance combined stream payload: { stream: "btcusdt@kline_15m", data: { ... } }
      // Or single stream payload: { e: "kline", s: "BTCUSDT", k: { ... } }
      const data = payload.data || payload;
      if (data.e === 'kline' && data.k) {
        this.processKlineEvent(data.s, data.k);
      }
    } catch {
      // ignore malformed payloads
    }
  }

  /**
   * Processes a live kline message
   */
  private processKlineEvent(symbol: string, k: any): void {
    this.state.lastUpdate = Date.now();
    this.state.isStale = false;

    const openTimeSec = Math.floor(k.t / 1000);
    const open = parseFloat(k.o);
    const high = parseFloat(k.h);
    const low = parseFloat(k.l);
    const close = parseFloat(k.c);
    const totalVolume = parseFloat(k.v);
    const takerBuyVolume = parseFloat(k.V || (totalVolume * 0.5));
    const isClosed = Boolean(k.x); // Kline "x" closed flag

    const upperSym = symbol.toUpperCase();
    const isEquityPerp = upperSym.includes('SPY') || upperSym.includes('QQQ');
    const isOffHours = isEquityPerp ? !isNewYorkRegularHours(openTimeSec) : false;

    const candle: Candle = {
      time: openTimeSec,
      open,
      high,
      low,
      close,
      volume: totalVolume,
      buyVolume: takerBuyVolume,
      sellVolume: Math.max(0, totalVolume - takerBuyVolume),
      isForming: !isClosed,
      isOffHours
    };

    const displaySym = toDisplaySymbol(upperSym);

    if (isClosed) {
      // 1. CANDLE CLOSED: Append to closed series, clear forming candle
      const existing = this.closedCandlesMap[upperSym] || [];
      const updated = existing.filter(c => c.time !== candle.time);
      updated.push(candle);
      // Keep last 1000 candles
      const trimmed = updated.slice(-1000);
      this.closedCandlesMap[upperSym] = trimmed;
      this.formingCandlesMap[upperSym] = null;

      // Trigger callback with isClosedUpdate = TRUE (signal engine runs on this)
      if (this.onCandlesCallback) {
        this.onCandlesCallback(displaySym, trimmed, null, true);
      }
    } else {
      // 2. CANDLE FORMING: Update forming candle separately
      this.formingCandlesMap[upperSym] = candle;
      const closedList = this.closedCandlesMap[upperSym] || [];

      // Trigger callback with isClosedUpdate = FALSE (chart updates, no new signals)
      if (this.onCandlesCallback) {
        this.onCandlesCallback(displaySym, closedList, candle, false);
      }
    }
  }

  /**
   * Proactive reconnect before the Binance 24-hour socket limit (23h 30m)
   */
  private scheduleProactiveReconnect(): void {
    if (this.proactiveReconnectTimeout) clearTimeout(this.proactiveReconnectTimeout);
    const twentyThreeHoursThirtyMinutes = 23.5 * 60 * 60 * 1000;
    this.proactiveReconnectTimeout = setTimeout(() => {
      console.log('[Binance] Proactive 24-hour reconnect triggered to refresh connection session.');
      this.reconnect();
    }, twentyThreeHoursThirtyMinutes);
  }

  /**
   * Ping keepalive every 3 minutes
   */
  private startPingKeepalive(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ method: 'ping', id: Date.now() }));
        } catch {}
      }
    }, 180000); // 3 minutes
  }

  /**
   * 15-second Staleness Watchdog
   * Blocks signals if no update received for over 15 seconds.
   */
  private startStaleWatchdog(): void {
    if (this.staleWatchdogInterval) clearInterval(this.staleWatchdogInterval);
    this.staleWatchdogInterval = setInterval(() => {
      if (this.state.connected && this.state.lastUpdate) {
        const elapsed = Date.now() - this.state.lastUpdate;
        if (elapsed > 15000) {
          if (!this.state.isStale) {
            this.state.isStale = true;
            this.notifyStatus();
          }
        }
      }
    }, 1000);
  }

  /**
   * Verifies Binance USDT-M perpetual contracts via /fapi/v1/exchangeInfo
   * Confirms TRADING status for SPYUSDT and QQQUSDT.
   */
  public async verifyFuturesExchangeInfo(symbols = ['SPYUSDT', 'QQQUSDT']): Promise<Record<string, { status: string; isTrading: boolean }>> {
    const results: Record<string, { status: string; isTrading: boolean }> = {};
    for (const sym of symbols) {
      results[sym] = { status: 'VERIFYING', isTrading: false };
    }

    try {
      const res = await fetch('/api/binance-futures/exchange-info');
      if (res.ok) {
        const data = await res.json();
        if (data?.symbols) {
          return data.symbols;
        }
      }
      
      // Fallback direct call if proxy is unavailable
      const directRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
      if (directRes.ok) {
        const info = await directRes.json();
        const infoSymbols = Array.isArray(info.symbols) ? info.symbols : [];
        for (const sym of symbols) {
          const match = infoSymbols.find((s: any) => s.symbol === sym);
          if (match) {
            results[sym] = {
              status: match.status,
              isTrading: match.status === 'TRADING'
            };
          } else {
            results[sym] = { status: 'UNAVAILABLE', isTrading: false };
          }
        }
      }
    } catch (err: any) {
      console.warn('[Binance] exchangeInfo check error:', err?.message);
    }

    return results;
  }
}

