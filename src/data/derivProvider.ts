import { Candle, Timeframe, DerivConnectionState, SymbolDataProof, RateLimitState } from '../types';
import { getTimeframeSeconds } from './marketFeed';
import { isSyntheticIndex, isSymbolMarketOpen, DerivActiveSymbolItem, normalizeAllowedSymbol } from './symbolMapping';

export type OnCandlesCallback = (
  symbol: string,
  closedCandles: Candle[],
  formingCandle: Candle | null,
  isClosedUpdate: boolean
) => void;

export type OnStatusChangeCallback = (state: DerivConnectionState) => void;

export type OnActiveSymbolsCallback = (
  symbols: DerivActiveSymbolItem[]
) => void;

export type OnDataProofCallback = (
  proofs: Record<string, SymbolDataProof>
) => void;

export type OnRateLimitCallback = (rateLimit: RateLimitState) => void;

interface SubscriptionInfo {
  timeframe: Timeframe;
  granularity: number;
  derivSymbol: string;
  isMarketOpen: boolean;
  paginationCount: number;
}

interface QueuedRequest {
  id: number;
  payload: any;
  priority?: boolean;
}

export class DerivMarketDataProvider {
  // Public feed only: no token, no login, no extra query params
  private wsUrl = 'wss://api.derivws.com/trading/v1/options/ws/public';
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pingInterval: any = null;
  private watchdogInterval: any = null;
  private reconnectTimeout: any = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;
  private activeSymbolsTimeout: any = null;

  // Rate Limiting Queue Architecture (Requirement 3: stay at half of documented rate limits)
  // Deriv documented limit: 220 calls/min. Half: 110 calls/min.
  // We use 600ms minimum spacing between requests (100 calls/min max).
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private queueTimer: any = null;
  private lastRequestSentTime = 0;
  private readonly minRequestIntervalMs = 600; // Half of documented rate limits
  private backoffUntilMs = 0;
  private backoffDelayMs = 5000;

  // Rate limit tracking (Requirement 2 & 5)
  private rateLimitState: RateLimitState = {
    serviceName: 'Deriv WebSocket API',
    fullMessage: null,
    isRateLimited: false,
    status: 'OK',
    lastEventTime: null
  };

  // History Caching & Reconnect Backfill (Requirement 3: load history once per symbol/tf, backfill on reconnect)
  private candleCache: Map<string, Candle[]> = new Map();

  private state: DerivConnectionState = {
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
  };

  // Active subscriptions by target symbol (e.g. 'EURUSD')
  private activeSubscriptions: Map<string, SubscriptionInfo> = new Map();
  // Closed candles buffer per symbol
  private closedCandlesMap: Map<string, Candle[]> = new Map();
  // Forming candle per symbol
  private formingCandleMap: Map<string, Candle> = new Map();

  // Set of live verified active symbols from active_symbols response
  private verifiedActiveSymbols: Set<string> = new Set();

  // DATA PROOF: Live verification tracking per symbol
  private dataProofMap: Record<string, SymbolDataProof> = {};

  // Callbacks
  private onCandlesUpdated: OnCandlesCallback | null = null;
  private onStatusChanged: OnStatusChangeCallback | null = null;
  private onActiveSymbolsDiscovered: OnActiveSymbolsCallback | null = null;
  private onDataProofUpdated: OnDataProofCallback | null = null;
  private onRateLimitChanged: OnRateLimitCallback | null = null;

  constructor(
    onStatus?: OnStatusChangeCallback,
    onCandles?: OnCandlesCallback,
    onSymbols?: OnActiveSymbolsCallback,
    onDataProof?: OnDataProofCallback,
    onRateLimit?: OnRateLimitCallback
  ) {
    if (onStatus) this.onStatusChanged = onStatus;
    if (onCandles) this.onCandlesUpdated = onCandles;
    if (onSymbols) this.onActiveSymbolsDiscovered = onSymbols;
    if (onDataProof) this.onDataProofUpdated = onDataProof;
    if (onRateLimit) this.onRateLimitChanged = onRateLimit;
  }

  public getState(): DerivConnectionState {
    return { ...this.state };
  }

  public getRateLimitState(): RateLimitState {
    return { ...this.rateLimitState };
  }

  public getDataProofMap(): Record<string, SymbolDataProof> {
    return { ...this.dataProofMap };
  }

  public setDataProofCallback(cb: OnDataProofCallback): void {
    this.onDataProofUpdated = cb;
  }

  public setRateLimitCallback(cb: OnRateLimitCallback): void {
    this.onRateLimitChanged = cb;
  }

  public getClosedCandles(symbol: string): Candle[] {
    const norm = normalizeAllowedSymbol(symbol);
    return this.closedCandlesMap.get(norm) || this.closedCandlesMap.get(symbol) || [];
  }

  public getFormingCandle(symbol: string): Candle | null {
    const norm = normalizeAllowedSymbol(symbol);
    return this.formingCandleMap.get(norm) || this.formingCandleMap.get(symbol) || null;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    this.manualDisconnect = false;
    this.updateStatus('CONNECTING');

    try {
      this.ws = new WebSocket(this.wsUrl);
      const connStart = Date.now();

      this.ws.onopen = () => {
        const measuredLatency = Math.max(1, Date.now() - connStart);
        this.reconnectAttempts = 0;
        this.state.connected = true;
        this.state.latencyMs = measuredLatency;
        this.state.lastHeartbeat = Date.now();
        this.state.lastMessageTime = Date.now();
        this.state.isStale = false;
        this.state.errorMessage = null;
        this.state.activeSymbolsError = null;
        this.updateStatus('CONNECTED');

        // Start ping heartbeat every 30 seconds
        this.startHeartbeat();
        // Start stale watchdog monitor (15-second rule for OPEN markets only)
        this.startStaleWatchdog();

        // Discover active symbols through queue (read-only, no burst)
        // Subscriptions are dispatched only AFTER active symbols are verified in handleMessage
        this.discoverActiveSymbols();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (ev) => {
        console.warn('[Deriv WS] Error:', ev);
        this.state.errorMessage = 'Connection error on Deriv WebSocket public endpoint.';
        this.updateStatus('ERROR');
      };

      this.ws.onclose = () => {
        this.cleanupHeartbeats();
        this.state.connected = false;
        this.state.latencyMs = null;
        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        } else {
          this.updateStatus('DISCONNECTED');
        }
      };
    } catch (err: any) {
      this.state.errorMessage = `Failed to initialize WebSocket: ${err?.message || String(err)}`;
      this.updateStatus('ERROR');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.cleanupHeartbeats();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
      this.queueTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.state.connected = false;
    this.state.latencyMs = null;
    this.updateStatus('DISCONNECTED');
  }

  private updateStatus(status: DerivConnectionState['status']): void {
    this.state.status = status;
    if (this.onStatusChanged) {
      this.onStatusChanged({ ...this.state });
    }
  }

  // ---------------------------------------------------------------------------
  // RATE LIMIT QUEUE (FIFO with 600ms spacing and backoff retry)
  // ---------------------------------------------------------------------------

  /**
   * Item 1: Purges pending requests from the FIFO queue for a given symbol.
   */
  public removePendingRequestsForSymbol(brokerSymbol: string): void {
    const symUpper = (brokerSymbol || '').toUpperCase().trim();
    if (!symUpper) return;
    this.requestQueue = this.requestQueue.filter(req => {
      if (!req.payload?.ticks_history) return true;
      const h = String(req.payload.ticks_history).toUpperCase().trim();
      return h !== symUpper && h !== 'UNAVAILABLE';
    });
    for (const [key, sub] of Array.from(this.activeSubscriptions.entries())) {
      if (
        sub.derivSymbol.toUpperCase().trim() === symUpper ||
        key.toUpperCase().trim() === symUpper ||
        sub.derivSymbol.toLowerCase() === 'unavailable'
      ) {
        this.activeSubscriptions.delete(key);
      }
    }
  }

  private enqueueRequest(payload: any, priority = false): void {
    // Item 1: Never send any Deriv request for a symbol that is UNAVAILABLE, UNVERIFIED or not in live active_symbols
    if (payload.ticks_history) {
      const sym = String(payload.ticks_history).trim();
      if (!sym || sym.toLowerCase() === 'unavailable') {
        return; // Drop immediately
      }
      if (this.verifiedActiveSymbols.size > 0 && !this.verifiedActiveSymbols.has(sym.toUpperCase())) {
        return; // Drop immediately
      }
    }

    const item: QueuedRequest = {
      id: payload.req_id || ++this.reqId,
      payload,
      priority
    };

    if (priority) {
      this.requestQueue.unshift(item);
    } else {
      this.requestQueue.push(item);
    }

    this.processQueue();
  }

  private processQueue(): void {
    if (this.isProcessingQueue) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.requestQueue.length === 0) return;

    const now = Date.now();

    // Respect rate limit backoff delay if triggered
    if (now < this.backoffUntilMs) {
      const waitMs = this.backoffUntilMs - now;
      if (this.queueTimer) clearTimeout(this.queueTimer);
      this.queueTimer = setTimeout(() => {
        this.isProcessingQueue = false;
        this.processQueue();
      }, waitMs);
      return;
    }

    // Respect min spacing between calls (600ms = stay at half of documented 220/min limit)
    const elapsed = now - this.lastRequestSentTime;
    if (elapsed < this.minRequestIntervalMs) {
      const waitMs = this.minRequestIntervalMs - elapsed;
      if (this.queueTimer) clearTimeout(this.queueTimer);
      this.queueTimer = setTimeout(() => {
        this.isProcessingQueue = false;
        this.processQueue();
      }, waitMs);
      return;
    }

    this.isProcessingQueue = true;
    const req = this.requestQueue.shift();
    if (!req) {
      this.isProcessingQueue = false;
      return;
    }

    try {
      this.ws.send(JSON.stringify(req.payload));
      this.lastRequestSentTime = Date.now();
    } catch (err) {
      console.warn('[Deriv WS] Send failed, re-queueing:', err);
      this.requestQueue.unshift(req);
    }

    this.isProcessingQueue = false;

    // Schedule next item if queue still has pending items
    if (this.requestQueue.length > 0) {
      if (this.queueTimer) clearTimeout(this.queueTimer);
      this.queueTimer = setTimeout(() => {
        this.processQueue();
      }, this.minRequestIntervalMs);
    }
  }

  private startHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // Pings have their own high budget (up to 10/s) outside core budget
          this.ws.send(JSON.stringify({ ping: 1 }));
        } catch {
          // ignore
        }
      }
    }, 30000);
  }

  private startStaleWatchdog(): void {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      if (!this.state.connected) return;

      let hasAnyOpenMarket = false;
      for (const [sym, sub] of this.activeSubscriptions.entries()) {
        const isOpen = isSymbolMarketOpen(sym);
        sub.isMarketOpen = isOpen;
        if (isOpen) {
          hasAnyOpenMarket = true;
        }
      }

      if (!hasAnyOpenMarket) {
        if (this.state.isStale) {
          this.state.isStale = false;
          this.state.errorMessage = null;
          if (this.onStatusChanged) this.onStatusChanged({ ...this.state });
        }
        return;
      }

      const now = Date.now();
      const lastMsg = this.state.lastMessageTime;
      const staleThreshold = 15000;

      if (lastMsg && (now - lastMsg > staleThreshold)) {
        if (!this.state.isStale) {
          this.state.isStale = true;
          this.state.errorMessage = 'Active market data feed latency exceeded 15s. Signals blocked.';
          if (this.onStatusChanged) this.onStatusChanged({ ...this.state });
        }
      } else if (this.state.isStale) {
        this.state.isStale = false;
        this.state.errorMessage = null;
        if (this.onStatusChanged) this.onStatusChanged({ ...this.state });
      }
    }, 2000);
  }

  private cleanupHeartbeats(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this.activeSymbolsTimeout) clearTimeout(this.activeSymbolsTimeout);
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.pingInterval = null;
    this.watchdogInterval = null;
    this.activeSymbolsTimeout = null;
    this.queueTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect) return;
    this.reconnectAttempts++;
    this.updateStatus('RECONNECTING');

    const backoffMs = Math.min(30000, Math.pow(2, Math.min(this.reconnectAttempts, 5)) * 1000);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  /**
   * Requirement 1: Send active_symbols as {"active_symbols":"brief","req_id":N} only.
   */
  public discoverActiveSymbols(): void {
    if (this.activeSymbolsTimeout) {
      clearTimeout(this.activeSymbolsTimeout);
      this.activeSymbolsTimeout = null;
    }

    this.state.activeSymbolsLoading = true;
    this.state.activeSymbolsError = null;
    if (this.onStatusChanged) {
      this.onStatusChanged({ ...this.state });
    }

    this.activeSymbolsTimeout = setTimeout(() => {
      if (this.state.activeSymbolsLoading) {
        this.state.activeSymbolsLoading = false;
        this.state.activeSymbolsError = 'Deriv active_symbols request timed out after 10s. Click Retry.';
        if (this.onStatusChanged) {
          this.onStatusChanged({ ...this.state });
        }
      }
    }, 10000);

    // Queue request through rate-limit queue
    this.enqueueRequest({
      active_symbols: 'brief',
      req_id: ++this.reqId
    }, true);
  }

  public retryActiveSymbols(): void {
    this.discoverActiveSymbols();
  }

  public getDerivGranularity(timeframe: Timeframe): number {
    const tfSec = getTimeframeSeconds(timeframe);
    if (tfSec >= 86400) return 86400;
    if (tfSec >= 14400) return 14400; // H4
    if (tfSec >= 3600) return 3600;   // 1H
    if (tfSec >= 2700) return 900;    // 45m (composed from 900s)
    if (tfSec >= 600) return 600;     // 10m
    if (tfSec >= 900) return 900;     // 15m
    if (tfSec >= 300) return 300;     // 5m
    return 60;
  }

  /**
   * Subscribes to candles for a target symbol.
   * Requirement 3:
   * - Load history once per symbol and timeframe, cache it.
   * - After a reconnect, only backfill missing candles starting from last cached epoch.
   * - Use live subscriptions, never polling.
   * - Spread startup requests over time via queue.
   */
  public subscribeCandles(symbol: string, derivSymbol: string, timeframe: Timeframe): void {
    const norm = normalizeAllowedSymbol(symbol);
    const primaryGranularity = this.getDerivGranularity(timeframe);
    const cleanSym = (derivSymbol || '').trim();

    // Item 1: Never send any Deriv request for a symbol that is UNAVAILABLE, UNVERIFIED or not in live active_symbols
    if (!cleanSym || cleanSym.toLowerCase() === 'unavailable') {
      this.removePendingRequestsForSymbol(cleanSym);
      this.removePendingRequestsForSymbol(norm);
      this.state.symbolDebugInfo[norm] = {
        lastRequestSent: 'BLOCKED: Symbol is UNAVAILABLE (No request dispatched)',
        lastResponseType: 'empty',
        candleCount: 0,
        lastCandleTime: null,
        errorMessage: null
      };
      if (this.onStatusChanged) this.onStatusChanged({ ...this.state });
      return;
    }

    if (this.verifiedActiveSymbols.size > 0 && !this.verifiedActiveSymbols.has(cleanSym.toUpperCase())) {
      this.removePendingRequestsForSymbol(cleanSym);
      this.state.symbolDebugInfo[norm] = {
        lastRequestSent: `BLOCKED: '${cleanSym}' not found in live active_symbols response`,
        lastResponseType: 'empty',
        candleCount: 0,
        lastCandleTime: null,
        errorMessage: null
      };
      if (this.onStatusChanged) this.onStatusChanged({ ...this.state });
      return;
    }

    this.activeSubscriptions.set(norm, {
      timeframe,
      granularity: primaryGranularity,
      derivSymbol: cleanSym,
      isMarketOpen: isSymbolMarketOpen(norm),
      paginationCount: 0
    });

    // Initialize Data Proof entry if not yet populated
    if (!this.dataProofMap[norm]) {
      this.dataProofMap[norm] = {
        symbol: norm,
        underlyingSymbol: cleanSym,
        provider: 'DERIV',
        lastTickPrice: null,
        lastTickTimeUtc: null,
        lastTickEpoch: null,
        ageSeconds: null,
        ticksReceivedSinceLoad: 0,
        lastCandleTimePerTimeframe: {},
        dataSourceType: 'LIVE_PROVEN'
      };
    } else {
      this.dataProofMap[norm].underlyingSymbol = derivSymbol;
    }

    const cacheKey = `${norm}_${timeframe}`;
    const cachedCandles = this.candleCache.get(cacheKey);

    // If we already have cached history, emit it immediately and only backfill missing candles!
    if (cachedCandles && cachedCandles.length > 0) {
      this.closedCandlesMap.set(norm, cachedCandles);
      const lastCachedEpoch = cachedCandles[cachedCandles.length - 1].time;

      // Queue backfill request starting from lastCachedEpoch + 1
      this.enqueueRequest({
        ticks_history: derivSymbol,
        style: 'candles',
        start: lastCachedEpoch + 1,
        end: 'latest',
        granularity: primaryGranularity,
        adjust_start_time: 1,
        subscribe: 1,
        req_id: ++this.reqId
      });

      if (this.onCandlesUpdated) {
        this.onCandlesUpdated(norm, cachedCandles, this.formingCandleMap.get(norm) || null, false);
      }
      return;
    }

    // If not cached, queue initial 1000-candle history request with subscribe: 1
    const requestStr = `ticks_history: ${derivSymbol}, style: 'candles', count: 1000, end: 'latest', adjust_start_time: 1, subscribe: 1`;
    this.state.symbolDebugInfo[norm] = {
      lastRequestSent: requestStr,
      lastResponseType: 'pending',
      candleCount: this.closedCandlesMap.get(norm)?.length || 0,
      lastCandleTime: null,
      errorMessage: null
    };

    if (this.onStatusChanged) {
      this.onStatusChanged({ ...this.state });
    }

    // Queue subscription spaced out through rate limit queue
    this.enqueueRequest({
      ticks_history: derivSymbol,
      style: 'candles',
      end: 'latest',
      count: 1000,
      granularity: primaryGranularity,
      adjust_start_time: 1,
      subscribe: 1,
      req_id: ++this.reqId
    });
  }

  private reSubscribeAll(): void {
    for (const [sym, sub] of this.activeSubscriptions.entries()) {
      this.subscribeCandles(sym, sub.derivSymbol, sub.timeframe);
    }
  }

  private handleMessage(data: string): void {
    this.state.lastMessageTime = Date.now();
    this.state.isStale = false;

    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Ping response
    if (msg.msg_type === 'ping') {
      this.state.lastHeartbeat = Date.now();
      return;
    }

    // Any successful message clears active rate-limit status (Requirement 5)
    if (this.rateLimitState.isRateLimited && !msg.error) {
      this.rateLimitState.isRateLimited = false;
      this.rateLimitState.status = 'OK';
      this.rateLimitState.fullMessage = null;
      this.backoffDelayMs = 5000;
      if (this.onRateLimitChanged) {
        this.onRateLimitChanged({ ...this.rateLimitState });
      }
    }

    // Rate Limit Error from Deriv server (Requirement 2 & 3: detect source, message, backoff and retry)
    if (msg.error) {
      const fullErrorMsg = typeof msg.error === 'object' && msg.error !== null
        ? `${msg.error.code ? msg.error.code + ': ' : ''}${msg.error.message || JSON.stringify(msg.error)}`
        : String(msg.error);

      const isRateLimit = msg.error.code === 'RateLimit' || fullErrorMsg.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        console.warn('[Deriv WS Rate Limit Detected]:', fullErrorMsg);
        this.rateLimitState = {
          serviceName: 'Deriv WebSocket API',
          fullMessage: fullErrorMsg,
          isRateLimited: true,
          status: 'Rate-limited, retrying',
          lastEventTime: Date.now()
        };

        // Pause queue and backoff
        this.backoffUntilMs = Date.now() + this.backoffDelayMs;
        this.backoffDelayMs = Math.min(30000, this.backoffDelayMs * 2);

        // Re-queue the failed request with priority
        if (msg.echo_req) {
          this.enqueueRequest(msg.echo_req, true);
        }

        if (this.onRateLimitChanged) {
          this.onRateLimitChanged({ ...this.rateLimitState });
        }
        return;
      }

      // Other non-rate-limit errors
      console.warn('[Deriv WS Error]:', fullErrorMsg);
      this.state.errorMessage = fullErrorMsg;

      // Item 1: If Deriv returned an error for a symbol, remove it and STOP the re-send loop!
      if (msg.echo_req?.ticks_history) {
        const failedSym = String(msg.echo_req.ticks_history);
        this.removePendingRequestsForSymbol(failedSym);
        for (const [k, v] of Object.entries(this.state.symbolDebugInfo)) {
          if (v.lastRequestSent?.includes(failedSym) || k === failedSym) {
            this.state.symbolDebugInfo[k] = {
              ...v,
              lastResponseType: 'error',
              errorMessage: fullErrorMsg
            };
          }
        }
      }

      if (this.onStatusChanged) {
        this.onStatusChanged({ ...this.state });
      }
      return;
    }

    // Active symbols response
    if (msg.msg_type === 'active_symbols' && Array.isArray(msg.active_symbols)) {
      if (this.activeSymbolsTimeout) {
        clearTimeout(this.activeSymbolsTimeout);
        this.activeSymbolsTimeout = null;
      }
      this.state.activeSymbolsLoading = false;
      this.state.activeSymbolsError = null;

      const parsedItems: DerivActiveSymbolItem[] = msg.active_symbols
        .map((s: any) => ({
          underlying_symbol: String(s.underlying_symbol || ''),
          underlying_symbol_name: String(s.underlying_symbol_name || s.underlying_symbol || ''),
          underlying_symbol_type: String(s.underlying_symbol_type || ''),
          exchange_is_open: Number(s.exchange_is_open ?? 0),
          is_trading_suspended: Number(s.is_trading_suspended ?? 0),
          pip_size: typeof s.pip_size === 'number' ? s.pip_size : undefined
        }))
        .filter(
          (s: DerivActiveSymbolItem) =>
            s.underlying_symbol &&
            s.underlying_symbol_type !== 'synthetic_index' &&
            !isSyntheticIndex(s.underlying_symbol, s.underlying_symbol_type, s.underlying_symbol_name)
        );

      this.verifiedActiveSymbols = new Set(parsedItems.map(s => s.underlying_symbol.toUpperCase()));

      // Item 1: Purge any pending requests from the queue that are not verified in active_symbols or are unavailable
      this.requestQueue = this.requestQueue.filter(req => {
        if (!req.payload?.ticks_history) return true;
        const sym = String(req.payload.ticks_history).trim().toUpperCase();
        return sym !== 'UNAVAILABLE' && this.verifiedActiveSymbols.has(sym);
      });

      // Purge unverified active subscriptions
      for (const [key, sub] of Array.from(this.activeSubscriptions.entries())) {
        if (sub.derivSymbol.toLowerCase() === 'unavailable' || !this.verifiedActiveSymbols.has(sub.derivSymbol.toUpperCase())) {
          this.activeSubscriptions.delete(key);
        }
      }

      this.state.activeSymbolsCount = parsedItems.length;

      if (this.onActiveSymbolsDiscovered) {
        this.onActiveSymbolsDiscovered(parsedItems);
      }
      if (this.onStatusChanged) {
        this.onStatusChanged({ ...this.state });
      }

      // Re-subscribe ONLY verified available subscriptions
      this.reSubscribeAll();
      return;
    }

    // Historical candles response
    if (msg.msg_type === 'candles' && Array.isArray(msg.candles)) {
      const derivSym = msg.echo_req?.ticks_history;
      const targetSymbol = this.findTargetSymbolByDerivSymbol(derivSym);
      if (!targetSymbol) return;

      const rawCandles = msg.candles;
      const gran = Number(msg.echo_req?.granularity || 600);
      const tfName = gran === 600 ? '10m' : gran === 2700 || gran === 900 ? '45m' : gran === 3600 ? '1H' : '10m';

      // Parse incoming candles
      const parsedCandles: Candle[] = rawCandles.map((c: any) => ({
        time: Number(c.epoch),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        isForming: false
      }));

      // Cache candles and merge if backfilling
      const cacheKey = `${targetSymbol}_${tfName}`;
      const existing = this.candleCache.get(cacheKey) || [];

      const candleMap = new Map<number, Candle>();
      for (const c of existing) candleMap.set(c.time, c);
      for (const c of parsedCandles) candleMap.set(c.time, c);

      const merged = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
      this.candleCache.set(cacheKey, merged);

      const isOpen = isSymbolMarketOpen(targetSymbol);
      let mergedClosed: Candle[] = [];

      if (merged.length > 0) {
        if (isOpen) {
          const closed = merged.slice(0, -1);
          const lastRaw = merged[merged.length - 1];

          const forming: Candle = {
            time: lastRaw.time,
            open: lastRaw.open,
            high: lastRaw.high,
            low: lastRaw.low,
            close: lastRaw.close,
            volume: 0,
            buyVolume: 0,
            sellVolume: 0,
            isForming: true
          };
          this.formingCandleMap.set(targetSymbol, forming);
          mergedClosed = closed;
        } else {
          mergedClosed = merged;
          this.formingCandleMap.delete(targetSymbol);
        }
      }

      this.closedCandlesMap.set(targetSymbol, mergedClosed);

      // Update Data Proof entry
      if (!this.dataProofMap[targetSymbol]) {
        this.dataProofMap[targetSymbol] = {
          symbol: targetSymbol,
          underlyingSymbol: derivSym,
          provider: 'DERIV',
          lastTickPrice: null,
          lastTickTimeUtc: null,
          lastTickEpoch: null,
          ageSeconds: null,
          ticksReceivedSinceLoad: 0,
          lastCandleTimePerTimeframe: {},
          dataSourceType: 'LIVE_PROVEN'
        };
      }

      const proof = this.dataProofMap[targetSymbol];
      if (merged.length > 0) {
        const lastCandle = merged[merged.length - 1];
        const lastCandleIso = new Date(lastCandle.time * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        (proof.lastCandleTimePerTimeframe as Record<string, string | null | undefined>)[tfName] = lastCandleIso;
        if (proof.lastTickPrice === null) {
          proof.lastTickPrice = lastCandle.close;
          proof.lastTickEpoch = Date.now();
          proof.lastTickTimeUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        }
        proof.dataSourceType = 'LIVE_PROVEN';
      }

      const newestCandle = mergedClosed[mergedClosed.length - 1] || this.formingCandleMap.get(targetSymbol);
      const lastCandleIso = newestCandle
        ? new Date(newestCandle.time * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
        : null;

      this.state.symbolDebugInfo[targetSymbol] = {
        lastRequestSent: this.state.symbolDebugInfo[targetSymbol]?.lastRequestSent || `ticks_history: ${derivSym}`,
        lastResponseType: parsedCandles.length > 0 ? 'candles' : 'empty',
        candleCount: mergedClosed.length,
        lastCandleTime: lastCandleIso,
        errorMessage: null
      };

      if (this.onStatusChanged) {
        this.onStatusChanged({ ...this.state });
      }

      if (this.onDataProofUpdated) {
        this.onDataProofUpdated({ ...this.dataProofMap });
      }

      if (this.onCandlesUpdated) {
        this.onCandlesUpdated(
          targetSymbol,
          mergedClosed,
          this.formingCandleMap.get(targetSymbol) || null,
          true
        );
      }
      return;
    }

    // Live streaming candle update (ohlc)
    if (msg.msg_type === 'ohlc' && msg.ohlc) {
      const ohlc = msg.ohlc;
      const derivSym = ohlc.symbol;
      const targetSymbol = this.findTargetSymbolByDerivSymbol(derivSym);
      if (!targetSymbol) return;

      const candleOpenTime = Number(ohlc.open_time || ohlc.epoch);
      const existingClosed = this.closedCandlesMap.get(targetSymbol) || [];
      const currentForming = this.formingCandleMap.get(targetSymbol);
      const gran = Number(ohlc.granularity);
      const tfName = gran === 600 ? '10m' : gran === 2700 || gran === 900 ? '45m' : gran === 3600 ? '1H' : '10m';

      const closePrice = Number(ohlc.close);
      const updatedForming: Candle = {
        time: candleOpenTime,
        open: Number(ohlc.open),
        high: Number(ohlc.high),
        low: Number(ohlc.low),
        close: closePrice,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        isForming: true
      };

      let isNewClosedCandle = false;
      let nextClosed = existingClosed;

      if (currentForming && currentForming.time < candleOpenTime) {
        const finalized: Candle = {
          ...currentForming,
          isForming: false
        };
        nextClosed = [...existingClosed, finalized];
        this.closedCandlesMap.set(targetSymbol, nextClosed);

        // Update memory cache
        const cacheKey = `${targetSymbol}_${tfName}`;
        this.candleCache.set(cacheKey, nextClosed);
        isNewClosedCandle = true;
      }

      this.formingCandleMap.set(targetSymbol, updatedForming);

      const lastCandleIso = new Date(candleOpenTime * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      if (this.state.symbolDebugInfo[targetSymbol]) {
        this.state.symbolDebugInfo[targetSymbol] = {
          ...this.state.symbolDebugInfo[targetSymbol],
          candleCount: nextClosed.length,
          lastCandleTime: lastCandleIso
        };
      }

      // Update Data Proof entry
      if (!this.dataProofMap[targetSymbol]) {
        this.dataProofMap[targetSymbol] = {
          symbol: targetSymbol,
          underlyingSymbol: derivSym,
          provider: 'DERIV',
          lastTickPrice: closePrice,
          lastTickTimeUtc: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
          lastTickEpoch: Date.now(),
          ageSeconds: 0,
          ticksReceivedSinceLoad: 1,
          lastCandleTimePerTimeframe: {},
          dataSourceType: 'LIVE_PROVEN'
        };
      } else {
        const proof = this.dataProofMap[targetSymbol];
        proof.lastTickPrice = closePrice;
        proof.lastTickEpoch = Date.now();
        proof.lastTickTimeUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        proof.ticksReceivedSinceLoad = (proof.ticksReceivedSinceLoad || 0) + 1;
        proof.dataSourceType = 'LIVE_PROVEN';
      }

      (this.dataProofMap[targetSymbol].lastCandleTimePerTimeframe as Record<string, string | null | undefined>)[tfName] = lastCandleIso;

      if (this.onDataProofUpdated) {
        this.onDataProofUpdated({ ...this.dataProofMap });
      }

      if (this.onCandlesUpdated) {
        this.onCandlesUpdated(targetSymbol, nextClosed, updatedForming, isNewClosedCandle);
      }
      return;
    }
  }

  private findTargetSymbolByDerivSymbol(derivSymbol?: string): string | null {
    if (!derivSymbol) return null;
    const lower = derivSymbol.toLowerCase();

    for (const [targetSym, sub] of this.activeSubscriptions.entries()) {
      if (sub.derivSymbol.toLowerCase() === lower) {
        return targetSym;
      }
    }
    for (const [sym, proof] of Object.entries(this.dataProofMap)) {
      if (proof.underlyingSymbol.toLowerCase() === lower) {
        return sym;
      }
    }
    return normalizeAllowedSymbol(derivSymbol);
  }
}
