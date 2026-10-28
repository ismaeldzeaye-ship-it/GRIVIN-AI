import { SymbolInfo } from '../types';

/**
 * Symbol mapping table mapping standard institutional aliases to broker symbols.
 * Includes US100 alongside NAS100 per explicit instruction.
 * Only instruments explicitly requested are supported; unverified ones are marked unavailable.
 */
export const DEFAULT_SYMBOL_REGISTRY: Record<string, SymbolInfo> = {
  'XAU/USD': {
    symbol: 'XAU/USD',
    brokerSymbol: 'XAUUSD',
    name: 'Spot Gold / US Dollar',
    category: 'METALS',
    digits: 2,
    pipSize: 0.1,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  },
  'EUR/USD': {
    symbol: 'EUR/USD',
    brokerSymbol: 'EURUSD',
    name: 'Euro / US Dollar',
    category: 'FOREX',
    digits: 5,
    pipSize: 0.0001,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  },
  'GBP/USD': {
    symbol: 'GBP/USD',
    brokerSymbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    category: 'FOREX',
    digits: 5,
    pipSize: 0.0001,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  },
  'US30': {
    symbol: 'US30',
    brokerSymbol: 'US30.cash',
    name: 'Wall Street 30 / Dow Jones',
    category: 'INDICES',
    digits: 1,
    pipSize: 1.0,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  },
  'NAS100': {
    symbol: 'NAS100',
    brokerSymbol: 'USTEC',
    name: 'US Tech 100 (Nasdaq)',
    category: 'INDICES',
    digits: 2,
    pipSize: 1.0,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  },
  'US100': {
    symbol: 'US100',
    brokerSymbol: 'US100',
    name: 'US Tech 100 Index (US100)',
    category: 'INDICES',
    digits: 2,
    pipSize: 1.0,
    currentBid: 0,
    currentAsk: 0,
    spreadPips: 0,
    dayChangePercent: 0,
    dayHigh: 0,
    dayLow: 0,
    isAvailable: true
  }
};

export const SUPPORTED_SYMBOLS = DEFAULT_SYMBOL_REGISTRY;
export const DEFAULT_SYMBOL = 'XAU/USD';

/**
 * Updates dynamic symbol specs received from verified cTrader account
 */
export function applyCTraderSymbolData(
  registry: Record<string, SymbolInfo>,
  cTraderSymbols: Array<{
    symbolName: string;
    digits: number;
    pipPosition: number;
    lotSize?: number;
    pipValue?: number;
    minLot?: number;
    maxLot?: number;
    lotStep?: number;
  }>
): Record<string, SymbolInfo> {
  const updated = { ...registry };

  // Mark all as unavailable initially until verified in account list
  Object.keys(updated).forEach(k => {
    updated[k].isAvailable = false;
  });

  for (const cs of cTraderSymbols) {
    // Find matching symbol in registry by symbol name or broker symbol
    const matchKey = Object.keys(updated).find(k => 
      k.replace('/', '') === cs.symbolName.replace('/', '') ||
      updated[k].brokerSymbol?.toLowerCase() === cs.symbolName.toLowerCase() ||
      (k === 'US100' && cs.symbolName.toUpperCase().includes('100')) ||
      (k === 'NAS100' && cs.symbolName.toUpperCase().includes('NAS'))
    );

    if (matchKey) {
      updated[matchKey] = {
        ...updated[matchKey],
        digits: cs.digits,
        pipSize: Math.pow(10, -cs.pipPosition),
        lotSize: cs.lotSize,
        pipValuePerStandardLot: cs.pipValue,
        minLot: cs.minLot,
        maxLot: cs.maxLot,
        lotStep: cs.lotStep,
        isAvailable: true
      };
    }
  }

  return updated;
}

export function formatPrice(price: number, symbol: string, digits = 2): string {
  if (!price || isNaN(price)) return '—';
  return Number(price).toFixed(digits);
}

export function calculatePips(diff: number, pipSize: number): number {
  if (!pipSize || pipSize <= 0) return 0;
  return Number((Math.abs(diff) / pipSize).toFixed(1));
}
