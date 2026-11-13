import { SymbolInfo, SymbolLiveStatus, DataSourceOrigin } from '../types';
import { isNewYorkRegularHours } from '../engine/sessions';

/**
 * Checks whether a market is currently open for trading.
 * - Crypto (BTCUSD / BTCUSDT) is open 24/7/365, never closed on weekends.
 * - SPYUSDT / QQQUSDT (ES/NQ perpetual proxies) are open ONLY 09:30-16:00 America/New_York weekdays (DST-aware).
 * - Forex, Commodities (Gold), and Indices close on weekends (Friday ~21:55 UTC through Sunday ~21:05 UTC).
 * - Broker active_symbols fields exchange_is_open and is_trading_suspended are respected.
 */
export function isSymbolMarketOpen(symbol: string, info?: Partial<SymbolInfo>, date: Date = new Date()): boolean {
  const upper = symbol.toUpperCase();

  // Item 3: SPYUSDT & QQQUSDT (ES/MES & NQ/NAS100) are OFF-HOURS outside 09:30-16:00 NY weekdays
  if (
    upper.includes('SPY') || 
    upper.includes('QQQ') || 
    upper === 'ES/MES' || 
    upper === 'NQ/NAS100' ||
    info?.symbol === 'SPYUSDT' ||
    info?.symbol === 'QQQUSDT' ||
    info?.exactBrokerSymbol === 'SPYUSDT' ||
    info?.exactBrokerSymbol === 'QQQUSDT'
  ) {
    return isNewYorkRegularHours(date);
  }

  // Pure Crypto: BTCUSD / BTCUSDT open 24/7
  if (info?.category === 'CRYPTO' || upper === 'BTCUSD' || upper === 'BTCUSDT' || upper.startsWith('BTC')) {
    return true;
  }

  // Weekend check for Forex, Metals, and Indices
  const utcDay = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();

  const isFridayPostClose = utcDay === 5 && (utcHour > 21 || (utcHour === 21 && utcMinute >= 55));
  const isSaturday = utcDay === 6;
  const isSundayPreOpen = utcDay === 0 && (utcHour < 21 || (utcHour === 21 && utcMinute < 5));

  if (isFridayPostClose || isSaturday || isSundayPreOpen) {
    return false; // Weekend: closed for non-crypto
  }

  if (info?.isTradingSuspended === true) {
    return false;
  }
  if (info?.exchangeIsOpen === false) {
    return false;
  }

  return true;
}

/**
 * MASTER PROMPT: SECTION 1: ALLOWED INSTRUMENTS (ONLY THESE)
 * - Commodities: XAUUSD (Gold)
 * - Forex majors: EURUSD, GBPUSD, USDJPY
 * - Indices / Futures: ES/MES (S&P 500), Nasdaq futures (NQ) / NAS100, US30
 * - Crypto: BTCUSD (BTCUSDT)
 * No other symbol may be analyzed or signaled.
 */
export const DEFAULT_SYMBOL_REGISTRY: Record<string, SymbolInfo> = {
  'XAUUSD': {
    symbol: 'XAUUSD',
    name: 'Gold (Commodities)',
    category: 'METALS',
    brokerSymbol: 'frxXAUUSD',
    derivSymbol: 'frxXAUUSD',
    exactBrokerSymbol: 'frxXAUUSD',
    digits: 2,
    pipSize: 0.1,
    volumeType: 'NONE',
    provider: 'DERIV',
    pipValuePerStandardLot: 10.0,
    lotSize: 100,
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: false,
    exchangeIsOpen: undefined,
    isTradingSuspended: undefined,
    isMarketOpen: false,
    status: 'UNVERIFIED',
    dataOrigin: 'UNVERIFIED'
  },
  'EURUSD': {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    category: 'FOREX',
    brokerSymbol: 'frxEURUSD',
    derivSymbol: 'frxEURUSD',
    exactBrokerSymbol: 'frxEURUSD',
    digits: 5,
    pipSize: 0.0001,
    volumeType: 'NONE',
    provider: 'DERIV',
    pipValuePerStandardLot: 10.0,
    lotSize: 100000,
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: false,
    exchangeIsOpen: undefined,
    isTradingSuspended: undefined,
    isMarketOpen: false,
    status: 'UNVERIFIED',
    dataOrigin: 'UNVERIFIED'
  },
  'GBPUSD': {
    symbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    category: 'FOREX',
    brokerSymbol: 'frxGBPUSD',
    derivSymbol: 'frxGBPUSD',
    exactBrokerSymbol: 'frxGBPUSD',
    digits: 5,
    pipSize: 0.0001,
    volumeType: 'NONE',
    provider: 'DERIV',
    pipValuePerStandardLot: 10.0,
    lotSize: 100000,
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: false,
    exchangeIsOpen: undefined,
    isTradingSuspended: undefined,
    isMarketOpen: false,
    status: 'UNVERIFIED',
    dataOrigin: 'UNVERIFIED'
  },
  'USDJPY': {
    symbol: 'USDJPY',
    name: 'US Dollar / Japanese Yen',
    category: 'FOREX',
    brokerSymbol: 'frxUSDJPY',
    derivSymbol: 'frxUSDJPY',
    exactBrokerSymbol: 'frxUSDJPY',
    digits: 3,
    pipSize: 0.01,
    volumeType: 'NONE',
    provider: 'DERIV',
    pipValuePerStandardLot: 6.8,
    lotSize: 100000,
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: false,
    exchangeIsOpen: undefined,
    isTradingSuspended: undefined,
    isMarketOpen: false,
    status: 'UNVERIFIED',
    dataOrigin: 'UNVERIFIED'
  },
  'ES/MES': {
    symbol: 'ES/MES',
    name: 'ES/MES (S&P 500)',
    category: 'INDICES',
    brokerSymbol: 'SPYUSDT',
    derivSymbol: undefined,
    exactBrokerSymbol: 'SPYUSDT',
    digits: 2,
    pipSize: 0.01,
    volumeType: 'REAL_VOLUME',
    provider: 'BINANCE',
    pipValuePerStandardLot: 1.0,
    lotSize: 1,
    minLot: 0.01,
    maxLot: 500.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true,
    exchangeIsOpen: true,
    isTradingSuspended: false,
    isMarketOpen: isNewYorkRegularHours(),
    marketType: 'FUTURES',
    isPerpetual: true,
    perpetualLabel: 'perpetual contract, not the index, not CME futures',
    status: isNewYorkRegularHours() ? 'ACTIVE' : 'OFF-HOURS',
    dataOrigin: 'LIVE_PROVEN'
  },
  'NQ/NAS100': {
    symbol: 'NQ/NAS100',
    name: 'NQ/NAS100 (Nasdaq)',
    category: 'INDICES',
    brokerSymbol: 'QQQUSDT',
    derivSymbol: undefined,
    exactBrokerSymbol: 'QQQUSDT',
    digits: 2,
    pipSize: 0.01,
    volumeType: 'REAL_VOLUME',
    provider: 'BINANCE',
    pipValuePerStandardLot: 1.0,
    lotSize: 1,
    minLot: 0.01,
    maxLot: 500.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true,
    exchangeIsOpen: true,
    isTradingSuspended: false,
    isMarketOpen: isNewYorkRegularHours(),
    marketType: 'FUTURES',
    isPerpetual: true,
    perpetualLabel: 'perpetual contract, not the index, not CME futures',
    status: isNewYorkRegularHours() ? 'ACTIVE' : 'OFF-HOURS',
    dataOrigin: 'LIVE_PROVEN'
  },
  'US30': {
    symbol: 'US30',
    name: 'US30 (Wall Street 30)',
    category: 'INDICES',
    brokerSymbol: 'unavailable',
    derivSymbol: undefined,
    exactBrokerSymbol: 'unavailable',
    digits: 1,
    pipSize: 1.0,
    volumeType: 'NONE',
    provider: 'DERIV',
    pipValuePerStandardLot: 10.0,
    lotSize: 10,
    minLot: 0.1,
    maxLot: 20.0,
    lotStep: 0.1,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: false,
    exchangeIsOpen: undefined,
    isTradingSuspended: undefined,
    isMarketOpen: false,
    status: 'UNAVAILABLE',
    dataOrigin: 'UNVERIFIED',
    unavailabilityReason: 'NO SIGNAL: APPROVED MARKET DATA UNAVAILABLE'
  },
  'BTCUSD': {
    symbol: 'BTCUSD',
    name: 'Bitcoin / Tether USDT (BTCUSD)',
    category: 'CRYPTO',
    brokerSymbol: 'BTCUSDT',
    exactBrokerSymbol: 'BTCUSDT',
    digits: 2,
    pipSize: 0.01,
    volumeType: 'REAL_VOLUME',
    provider: 'BINANCE',
    pipValuePerStandardLot: 1.0,
    lotSize: 1,
    minLot: 0.001,
    maxLot: 10.0,
    lotStep: 0.001,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true,
    exchangeIsOpen: true,
    isTradingSuspended: false,
    isMarketOpen: true,
    marketType: 'SPOT',
    status: 'ACTIVE',
    dataOrigin: 'LIVE_PROVEN'
  },
  'SPYUSDT': {
    symbol: 'SPYUSDT',
    name: 'SPY / Tether USDT Perpetual (ES/MES Proxy)',
    category: 'INDICES',
    brokerSymbol: 'SPYUSDT',
    exactBrokerSymbol: 'SPYUSDT',
    digits: 2,
    pipSize: 0.01,
    volumeType: 'REAL_VOLUME',
    provider: 'BINANCE',
    pipValuePerStandardLot: 1.0,
    lotSize: 1,
    minLot: 0.01,
    maxLot: 500.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true,
    exchangeIsOpen: true,
    isTradingSuspended: false,
    isMarketOpen: true,
    marketType: 'FUTURES',
    isPerpetual: true,
    perpetualLabel: 'USDT-M Perpetual Contract (Proxy for ES/MES — Not an index or CME futures)',
    status: 'ACTIVE',
    dataOrigin: 'LIVE_PROVEN'
  },
  'QQQUSDT': {
    symbol: 'QQQUSDT',
    name: 'QQQ / Tether USDT Perpetual (NQ/NAS100 Proxy)',
    category: 'INDICES',
    brokerSymbol: 'QQQUSDT',
    exactBrokerSymbol: 'QQQUSDT',
    digits: 2,
    pipSize: 0.01,
    volumeType: 'REAL_VOLUME',
    provider: 'BINANCE',
    pipValuePerStandardLot: 1.0,
    lotSize: 1,
    minLot: 0.01,
    maxLot: 500.0,
    lotStep: 0.01,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true,
    exchangeIsOpen: true,
    isTradingSuspended: false,
    isMarketOpen: true,
    marketType: 'FUTURES',
    isPerpetual: true,
    perpetualLabel: 'USDT-M Perpetual Contract (Proxy for NQ/NAS100 — Not an index or CME futures)',
    status: 'ACTIVE',
    dataOrigin: 'LIVE_PROVEN'
  }
};

/**
 * Notice: USDT is a dollar-pegged stablecoin, not fiat USD.
 */
export const USDT_DISCLAIMER = 'USDT (Tether) is a USD-pegged stablecoin, not fiat USD. Price and liquidity reflect Tether-denominated order books on Binance.';

/**
 * Allowed Binance symbols: BTCUSDT, plus USDT-M perpetuals SPYUSDT (ES/MES proxy) and QQQUSDT (NQ/NAS100 proxy).
 */
export const DEFAULT_BINANCE_SYMBOLS = ['BTCUSDT', 'SPYUSDT', 'QQQUSDT'];

export function getCustomBinanceSymbols(): string[] {
  return DEFAULT_BINANCE_SYMBOLS;
}

export function saveCustomBinanceSymbols(_symbols: string[]): void {
  // Configured Binance symbols: BTCUSDT, SPYUSDT, QQQUSDT
}

export const SUPPORTED_SYMBOLS = DEFAULT_SYMBOL_REGISTRY;
export const DEFAULT_SYMBOL = 'XAUUSD';

/**
 * Normalizes input symbol strings to the unified Section 1 key.
 */
export function normalizeAllowedSymbol(raw: string): string {
  const clean = raw.replace('/', '').toUpperCase();
  if (clean === 'XAUUSD' || clean === 'FRXXAUUSD' || clean.includes('GOLD')) return 'XAUUSD';
  if (clean === 'EURUSD' || clean === 'FRXEURUSD') return 'EURUSD';
  if (clean === 'GBPUSD' || clean === 'FRXGBPUSD') return 'GBPUSD';
  if (clean === 'USDJPY' || clean === 'FRXUSDJPY') return 'USDJPY';
  if (clean === 'SPYUSDT' || clean === 'SPY') return 'SPYUSDT';
  if (clean === 'QQQUSDT' || clean === 'QQQ') return 'QQQUSDT';
  if (clean.includes('ES') || clean.includes('MES') || clean.includes('SPC') || clean.includes('500')) return 'ES/MES';
  if (clean.includes('NQ') || clean.includes('NDX') || clean.includes('NAS') || clean.includes('TECH')) return 'NQ/NAS100';
  if (clean.includes('US30') || clean.includes('DJI') || clean.includes('DOW') || clean.includes('WALL')) return 'US30';
  if (clean.includes('BTC')) return 'BTCUSD';
  return raw;
}

/**
 * Returns substitution note for broker CFD/futures equivalence.
 */
export function getBrokerSubstitutionNote(symbol: string): string | undefined {
  if (symbol === 'ES/MES') return 'Substituted to US500 / S&P 500 Index CFD (OTC_SPC) on Deriv; or trade SPYUSDT perpetual on Binance';
  if (symbol === 'NQ/NAS100') return 'Substituted to US Tech 100 / NAS100 (OTC_NDX) on Deriv; or trade QQQUSDT perpetual on Binance';
  if (symbol === 'US30') return 'Substituted to Wall Street 30 (OTC_DJI) on Deriv. (If unavailable on broker, engine outputs NO SIGNAL)';
  if (symbol === 'BTCUSD') return 'Substituted to Binance BTCUSDT Spot/Futures';
  if (symbol === 'SPYUSDT') return 'Binance USDT-M Perpetual Contract (Proxy for ES/MES — Not an index or CME futures)';
  if (symbol === 'QQQUSDT') return 'Binance USDT-M Perpetual Contract (Proxy for NQ/NAS100 — Not an index or CME futures)';
  return undefined;
}

/**
 * Strict exclusion of synthetic indices (RNG / computer-generated algorithms).
 * Master Prompt Step 0: "Never use an unlisted pair, synthetic index, exotic or altcoin."
 */
export function isSyntheticIndex(symbol: string, marketName = '', displayName = ''): boolean {
  const combined = `${symbol} ${marketName} ${displayName}`.toUpperCase();
  if (
    combined.includes('SYNTHETIC') ||
    combined.includes('VOLATILITY') ||
    combined.includes('BOOM') ||
    combined.includes('CRASH') ||
    combined.includes('STEP') ||
    combined.includes('JUMP') ||
    combined.includes('RANGE BREAK') ||
    combined.includes('DEX') ||
    combined.includes('DRIFT') ||
    symbol.startsWith('R_') ||
    symbol.startsWith('1HZ')
  ) {
    return true;
  }
  return false;
}

export interface DerivActiveSymbolItem {
  underlying_symbol: string;
  underlying_symbol_name: string;
  underlying_symbol_type: string;
  exchange_is_open: number;
  is_trading_suspended: number;
  pip_size?: number;
}

/**
 * Updates availability & exact Deriv symbol from active_symbols response.
 * ONLY matches and updates the Section 1 allowed instruments.
 * Never injects unlisted pairs, synthetic indices, exotics, or altcoins.
 */
export function applyDerivActiveSymbols(
  registry: Record<string, SymbolInfo>,
  activeSymbols: DerivActiveSymbolItem[],
  discoveryStatus: 'PENDING' | 'SUCCESS' | 'FAILED' = 'SUCCESS'
): Record<string, SymbolInfo> {
  const updated = { ...registry };

  if (discoveryStatus === 'PENDING' || discoveryStatus === 'FAILED' || !activeSymbols || activeSymbols.length === 0) {
    for (const key of Object.keys(updated)) {
      if (updated[key].provider === 'DERIV') {
        updated[key] = {
          ...updated[key],
          status: 'UNVERIFIED',
          isAvailable: false,
          isMarketOpen: false,
          dataOrigin: 'UNVERIFIED'
        };
      }
    }
    return updated;
  }

  // Filter out any synthetic index candidates
  const cleanDerivSymbols = activeSymbols.filter(
    s => s.underlying_symbol_type !== 'synthetic_index' &&
         !isSyntheticIndex(s.underlying_symbol, s.underlying_symbol_type, s.underlying_symbol_name)
  );

  for (const key of Object.keys(updated)) {
    const item = updated[key];
    if (item.provider !== 'DERIV') {
      continue;
    }

    // Match each Section 1 allowed instrument to its Deriv symbol
    const match = cleanDerivSymbols.find(s => {
      const underSym = s.underlying_symbol.toUpperCase();
      const underName = s.underlying_symbol_name.toUpperCase();
      const keyNorm = key.replace('/', '').toUpperCase();

      if (underSym === (item.exactBrokerSymbol || item.derivSymbol || '').toUpperCase()) return true;
      if (underSym === `FRX${keyNorm}`) return true;
      if (underName === key.toUpperCase()) return true;

      // Index and Commodity substitutions
      if (key === 'NQ/NAS100' && (underSym === 'OTC_NDX' || underName.includes('US TECH 100') || underName.includes('NASDAQ'))) {
        return true;
      }
      if (key === 'ES/MES' && (underSym === 'OTC_SPC' || underName.includes('US 500') || underName.includes('S&P 500'))) {
        return true;
      }
      if (key === 'US30' && (underSym === 'OTC_DJI' || underName.includes('WALL STREET 30') || underName.includes('DOW JONES'))) {
        return true;
      }
      if (key === 'XAUUSD' && (underSym === 'FRXXAUUSD' || underName.includes('GOLD'))) {
        return true;
      }
      return false;
    });

    if (match) {
      const exchangeIsOpen = match.exchange_is_open === 1;
      const isTradingSuspended = match.is_trading_suspended === 1;

      let status: SymbolLiveStatus;
      if (isTradingSuspended) {
        status = 'UNAVAILABLE';
      } else if (!exchangeIsOpen) {
        status = 'MARKET CLOSED';
      } else {
        status = 'ACTIVE';
      }

      updated[key] = {
        ...item,
        exactBrokerSymbol: match.underlying_symbol,
        derivSymbol: match.underlying_symbol,
        isAvailable: status !== 'UNAVAILABLE',
        pipSize: match.pip_size || item.pipSize,
        exchangeIsOpen,
        isTradingSuspended,
        isMarketOpen: status === 'ACTIVE',
        status,
        dataOrigin: status === 'ACTIVE' || status === 'MARKET CLOSED' ? 'LIVE_PROVEN' : 'UNVERIFIED',
        unavailabilityReason: isTradingSuspended ? 'Trading suspended on broker' : undefined
      };
    } else {
      if (key === 'ES/MES') {
        updated['ES/MES'] = {
          ...item,
          brokerSymbol: 'SPYUSDT',
          exactBrokerSymbol: 'SPYUSDT',
          provider: 'BINANCE',
          volumeType: 'REAL_VOLUME',
          marketType: 'FUTURES',
          isPerpetual: true,
          perpetualLabel: 'perpetual contract, not the index, not CME futures',
          isAvailable: true,
          isMarketOpen: isNewYorkRegularHours(),
          status: isNewYorkRegularHours() ? 'ACTIVE' : 'OFF-HOURS',
          dataOrigin: 'LIVE_PROVEN',
          unavailabilityReason: undefined
        };
      } else if (key === 'NQ/NAS100') {
        updated['NQ/NAS100'] = {
          ...item,
          brokerSymbol: 'QQQUSDT',
          exactBrokerSymbol: 'QQQUSDT',
          provider: 'BINANCE',
          volumeType: 'REAL_VOLUME',
          marketType: 'FUTURES',
          isPerpetual: true,
          perpetualLabel: 'perpetual contract, not the index, not CME futures',
          isAvailable: true,
          isMarketOpen: isNewYorkRegularHours(),
          status: isNewYorkRegularHours() ? 'ACTIVE' : 'OFF-HOURS',
          dataOrigin: 'LIVE_PROVEN',
          unavailabilityReason: undefined
        };
      } else if (key === 'US30') {
        updated['US30'] = {
          ...item,
          exactBrokerSymbol: 'unavailable',
          status: 'UNAVAILABLE',
          isAvailable: false,
          isMarketOpen: false,
          dataOrigin: 'UNVERIFIED',
          unavailabilityReason: 'NO SIGNAL: APPROVED MARKET DATA UNAVAILABLE'
        };
      } else {
        updated[key] = {
          ...item,
          exactBrokerSymbol: 'unavailable',
          status: 'UNAVAILABLE',
          isAvailable: false,
          isMarketOpen: false,
          dataOrigin: 'UNVERIFIED',
          unavailabilityReason: 'Symbol not found in Deriv active symbols response'
        };
      }
    }
  }

  return updated;
}

export function formatPrice(price: number, symbol: string, digits = 2): string {
  if (price === undefined || price === null || isNaN(price)) return '—';
  const norm = normalizeAllowedSymbol(symbol);
  const effectiveDigits = norm === 'EURUSD' || norm === 'GBPUSD' ? 5 :
    norm === 'USDJPY' ? 3 :
    norm === 'XAUUSD' || norm === 'ES/MES' || norm === 'NQ/NAS100' || norm === 'BTCUSD' ? 2 :
    norm === 'US30' ? 1 :
    digits;
  return Number(price).toFixed(effectiveDigits);
}

export function calculatePips(diff: number, pipSize: number): number {
  if (!pipSize || pipSize <= 0) return 0;
  return Number((Math.abs(diff) / pipSize).toFixed(1));
}

/**
 * Requirement 1: Show the spread in price units for crypto, in pips only for forex and gold.
 */
export function formatSpread(diffOrPips: number, symbol: string, isAlreadyInPips = false, pipSize = 0.0001): string {
  if (diffOrPips === undefined || diffOrPips === null || isNaN(diffOrPips) || diffOrPips <= 0) {
    return 'N/A';
  }
  const norm = normalizeAllowedSymbol(symbol);
  const isCrypto = norm === 'BTCUSD' || norm.includes('BTC') || symbol.toUpperCase().includes('BTC');

  if (isCrypto) {
    // Spread in price units (e.g. 0.50)
    return diffOrPips.toFixed(2);
  }

  // Forex and Gold in pips
  if (isAlreadyInPips) {
    return `${diffOrPips.toFixed(1)} pips`;
  }
  const pips = pipSize > 0 ? diffOrPips / pipSize : diffOrPips;
  return `${pips.toFixed(1)} pips`;
}

/**
 * Requirement 2: Truthful labels: the footer STATUS, the "Profile: REAL" chip
 * and the BID/ASK box must show NO DATA / N/A whenever there are no live candles or quotes.
 */
export function getTruthfulStatus(isOpen: boolean, hasData: boolean, isUnavailable = false): string {
  if (isUnavailable) return 'UNAVAILABLE';
  if (!hasData) return 'NO DATA';
  return isOpen ? 'OPEN' : 'MARKET CLOSED';
}

export function getTruthfulProfileLabel(profileLabel: string | undefined, hasData: boolean): string {
  if (!hasData) return 'NO DATA';
  return profileLabel || 'NO DATA';
}
