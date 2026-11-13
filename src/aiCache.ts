export interface MarketState {
  symbol: string;
  timeframe: string;
  session: string;
  lastClosedCandleTime: number;
  pocBin: number;
  zone: string;
  fvgCount: number;
  structureEventId?: string | number;
  direction?: string;
  strategyName?: string;
}

export const marketStateKey = (s: MarketState) =>
  [s.symbol, s.timeframe, s.session, s.lastClosedCandleTime,
   s.pocBin, s.zone, s.fvgCount, s.structureEventId ?? "none", s.direction ?? "none", s.strategyName ?? "none"].join("|");

export class AiAnalysisCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private ttlMs = 5 * 60_000, private maxEntries = 50) {}

  async get(state: MarketState, fetcher: () => Promise<T>, opts: { force?: boolean } = {}) {
    const key = marketStateKey(state);
    if (!opts.force) {
      const hit = this.store.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        this.store.delete(key);
        this.store.set(key, hit);
        return { value: hit.value, cached: true };
      }
    }
    const running = this.inflight.get(key);
    if (running) return { value: await running, cached: true };

    const p = fetcher()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        while (this.store.size > this.maxEntries) {
          const oldest = this.store.keys().next().value;
          if (oldest === undefined) break;
          this.store.delete(oldest);
        }
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return { value: await p, cached: false };
  }
}
