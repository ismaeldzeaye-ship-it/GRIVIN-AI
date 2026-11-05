import React from 'react';
import { MarketDataScreen } from './MarketDataScreen';
import { MarketDataConfig, SymbolInfo } from '../types';
import { DEFAULT_SYMBOL_REGISTRY } from '../data/symbolMapping';

interface ConnectionWizardProps {
  config: MarketDataConfig;
  symbolRegistry?: Record<string, SymbolInfo>;
  onReconnectDeriv?: () => void;
  onRefreshSymbols?: () => void;
  onToggleSimulationMode: (enabled: boolean) => void;
  // Compatibility props
  onUpdateConfig?: (cfg: any) => void;
  onTestConnection?: () => Promise<boolean>;
  onSimulateStaleFeed?: () => void;
}

export const ConnectionWizard: React.FC<ConnectionWizardProps> = ({
  config,
  symbolRegistry = DEFAULT_SYMBOL_REGISTRY,
  onReconnectDeriv = () => {},
  onRefreshSymbols = () => {},
  onToggleSimulationMode
}) => {
  return (
    <MarketDataScreen
      config={config}
      symbolRegistry={symbolRegistry}
      onReconnectDeriv={onReconnectDeriv}
      onRefreshSymbols={onRefreshSymbols}
      onToggleSimulationMode={onToggleSimulationMode}
    />
  );
};
