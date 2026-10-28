import { BacktestSummary, BacktestTrade, MarketSessionType, StrategyType, Timeframe } from '../types';
import { generateCandles } from '../data/marketFeed';
import { evaluateTradingSignals } from './setups';
import { SUPPORTED_SYMBOLS } from '../data/symbolMapping';

/**
 * Executes a simulated institutional backtest across historical candles
 * to evaluate strategy expectancy, win rate, and equity curve in R-multiples.
 */
export function runInstitutionalBacktest(
  symbol = 'XAU/USD',
  strategyFilter?: StrategyType,
  sessionFilter?: MarketSessionType,
  candleCount = 300
): BacktestSummary {
  const candles = generateCandles(symbol, 'M15', candleCount);
  const symInfo = SUPPORTED_SYMBOLS[symbol] || SUPPORTED_SYMBOLS['XAU/USD'];
  const trades: BacktestTrade[] = [];

  const sessions: MarketSessionType[] = ['ASIAN', 'LONDON', 'NEW_YORK', 'LONDON_NY_OVERLAP'];
  const strategies: StrategyType[] = [
    'POC_BOUNCE',
    'VALUE_AREA_REVERSAL',
    'CONFIRMED_BREAKOUT'
  ];

  // Step through candles in chunks to simulate historical signal trigger & resolution
  const step = 15;
  for (let i = 50; i < candles.length - 20; i += step) {
    const windowCandles = candles.slice(0, i);
    const futureCandles = candles.slice(i, i + 20);
    const last = windowCandles[windowCandles.length - 1];

    const signals = evaluateTradingSignals(symbol, windowCandles, 'M15', last.close);
    if (!signals.length) continue;

    const signal = signals[0];

    // Apply filters
    if (strategyFilter && signal.strategy !== strategyFilter) continue;
    if (sessionFilter && signal.session !== sessionFilter) continue;

    // Simulate forward resolution with single 2R take-profit
    let outcome: 'WIN' | 'LOSS' | 'BE' = 'BE';
    let rOutcome = 0;
    let exitPrice = signal.entryPrice;
    let exitTime = last.time + 3600;

    for (const fc of futureCandles) {
      if (signal.direction === 'BUY') {
        // Hit Stop Loss?
        if (fc.low <= signal.stopLoss) {
          outcome = 'LOSS';
          rOutcome = -1.0;
          exitPrice = signal.stopLoss;
          exitTime = fc.time;
          break;
        }
        // Hit Take Profit (2R)?
        if (fc.high >= signal.tp) {
          outcome = 'WIN';
          rOutcome = 2.0;
          exitPrice = signal.tp;
          exitTime = fc.time;
          break;
        }
      } else {
        // SELL
        if (fc.high >= signal.stopLoss) {
          outcome = 'LOSS';
          rOutcome = -1.0;
          exitPrice = signal.stopLoss;
          exitTime = fc.time;
          break;
        }
        // Hit Take Profit (2R)?
        if (fc.low <= signal.tp) {
          outcome = 'WIN';
          rOutcome = 2.0;
          exitPrice = signal.tp;
          exitTime = fc.time;
          break;
        }
      }
    }

    const pnlPips = Number((Math.abs(exitPrice - signal.entryPrice) / symInfo.pipSize).toFixed(1));

    trades.push({
      id: `bt-${symbol}-${trades.length + 1}`,
      symbol,
      strategy: signal.strategy,
      session: signal.session,
      timeframe: 'M15',
      direction: signal.direction === 'BUY' ? 'BUY' : 'SELL',
      entryTime: last.time,
      exitTime,
      entryPrice: signal.entryPrice,
      exitPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.tp,
      rOutcome,
      pnlPips: outcome === 'LOSS' ? -pnlPips : pnlPips,
      status: outcome
    });
  }

  // Calculate metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.status === 'WIN').length;
  const losingTrades = trades.filter(t => t.status === 'LOSS').length;
  const breakEvenTrades = trades.filter(t => t.status === 'BE').length;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const totalR = trades.reduce((sum, t) => sum + t.rOutcome, 0);
  const averageR = totalTrades > 0 ? Number((totalR / totalTrades).toFixed(2)) : 0;

  const grossWinR = trades.filter(t => t.rOutcome > 0).reduce((sum, t) => sum + t.rOutcome, 0);
  const grossLossR = Math.abs(trades.filter(t => t.rOutcome < 0).reduce((sum, t) => sum + t.rOutcome, 0));
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : 3.0;

  // Equity Curve & Drawdown in R
  let currentEquityR = 0;
  let peakEquityR = 0;
  let maxDrawdownR = 0;
  const equityCurve: { tradeIndex: number; equityR: number; timestamp: number }[] = [
    { tradeIndex: 0, equityR: 0, timestamp: candles[0]?.time || Date.now() / 1000 }
  ];

  trades.forEach((t, idx) => {
    currentEquityR += t.rOutcome;
    if (currentEquityR > peakEquityR) peakEquityR = currentEquityR;
    const dd = peakEquityR - currentEquityR;
    if (dd > maxDrawdownR) maxDrawdownR = dd;

    equityCurve.push({
      tradeIndex: idx + 1,
      equityR: Number(currentEquityR.toFixed(2)),
      timestamp: t.exitTime
    });
  });

  // Strategy Breakdown
  const breakdownByStrategy = {} as Record<StrategyType, { winRate: number; avgR: number; totalTrades: number }>;
  for (const s of strategies) {
    const sTrades = trades.filter(t => t.strategy === s);
    const sWins = sTrades.filter(t => t.status === 'WIN').length;
    const sTot = sTrades.length;
    const sR = sTrades.reduce((sum, t) => sum + t.rOutcome, 0);
    breakdownByStrategy[s] = {
      totalTrades: sTot,
      winRate: sTot > 0 ? Number(((sWins / sTot) * 100).toFixed(1)) : 0,
      avgR: sTot > 0 ? Number((sR / sTot).toFixed(2)) : 0
    };
  }

  // Session Breakdown
  const breakdownBySession = {} as Record<MarketSessionType, { winRate: number; avgR: number; totalTrades: number }>;
  for (const sess of sessions) {
    const sessTrades = trades.filter(t => t.session === sess);
    const sessWins = sessTrades.filter(t => t.status === 'WIN').length;
    const sessTot = sessTrades.length;
    const sessR = sessTrades.reduce((sum, t) => sum + t.rOutcome, 0);
    breakdownBySession[sess] = {
      totalTrades: sessTot,
      winRate: sessTot > 0 ? Number(((sessWins / sessTot) * 100).toFixed(1)) : 0,
      avgR: sessTot > 0 ? Number((sessR / sessTot).toFixed(2)) : 0
    };
  }

  // Symbol Breakdown
  const breakdownBySymbol: Record<string, { winRate: number; avgR: number; totalTrades: number }> = {
    [symbol]: {
      totalTrades,
      winRate,
      avgR: averageR
    }
  };

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakEvenTrades,
    winRate,
    averageR,
    profitFactor,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    equityCurve,
    breakdownByStrategy,
    breakdownBySession,
    breakdownBySymbol
  };
}
