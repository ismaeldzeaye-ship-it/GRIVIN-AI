import { SymbolInfo } from '../types';

export interface PositionCalculationParams {
  accountBalance: number;
  riskPercent: number; // e.g. 1.0 for 1%
  entryPrice: number;
  stopLossPrice: number;
  tpPrice?: number; // Single 2R take profit
  symbolInfo?: SymbolInfo; // Real cTrader symbol specifications
}

export interface PositionCalculationResult {
  canCalculate: boolean;
  unavailabilityReason?: string;
  riskAmountCash?: number;
  stopLossPips?: number;
  recommendedLotSize?: number;
  potentialProfitCash?: number;
  rewardRiskRatio?: number;
  pipValuePerLot?: number;
  contractSize?: number;
}

export function calculatePositionSize(params: PositionCalculationParams): PositionCalculationResult {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice, tpPrice, symbolInfo } = params;

  // Requirement 4: Take pip/tick value and contract size from the cTrader symbol data.
  // If specs are unavailable, say position size cannot be calculated.
  if (
    !symbolInfo ||
    symbolInfo.pipValuePerStandardLot === undefined ||
    symbolInfo.lotSize === undefined ||
    !symbolInfo.pipSize ||
    symbolInfo.pipSize <= 0
  ) {
    return {
      canCalculate: false,
      unavailabilityReason: 'Position size cannot be calculated (symbol specifications unavailable from cTrader).'
    };
  }

  const pipSize = symbolInfo.pipSize;
  const pipValue = symbolInfo.pipValuePerStandardLot;
  const contractSize = symbolInfo.lotSize;

  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  const stopLossPips = Number((priceDiff / pipSize).toFixed(1));

  if (stopLossPips <= 0 || pipValue <= 0) {
    return {
      canCalculate: false,
      unavailabilityReason: 'Invalid stop loss distance or pip value.'
    };
  }

  const riskAmountCash = accountBalance * (riskPercent / 100);
  const dollarRiskPerLot = stopLossPips * pipValue;

  let rawLotSize = riskAmountCash / dollarRiskPerLot;

  const minLot = symbolInfo.minLot ?? 0.01;
  const maxLot = symbolInfo.maxLot ?? 100.0;
  const step = symbolInfo.lotStep ?? 0.01;

  rawLotSize = Math.max(minLot, Math.min(maxLot, rawLotSize));
  const recommendedLotSize = Number((Math.floor(rawLotSize / step) * step).toFixed(2));
  const finalRiskCash = Number((recommendedLotSize * dollarRiskPerLot).toFixed(2));

  let potentialProfitCash: number | undefined;
  let rewardRiskRatio: number | undefined;

  if (tpPrice) {
    const tpPips = Math.abs(tpPrice - entryPrice) / pipSize;
    potentialProfitCash = Number((recommendedLotSize * tpPips * pipValue).toFixed(2));
    rewardRiskRatio = Number((tpPips / Math.max(1, stopLossPips)).toFixed(2));
  }

  return {
    canCalculate: true,
    riskAmountCash: finalRiskCash,
    stopLossPips,
    recommendedLotSize,
    potentialProfitCash,
    rewardRiskRatio: rewardRiskRatio || 2.0,
    pipValuePerLot: pipValue,
    contractSize
  };
}
