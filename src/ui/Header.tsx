import React from 'react';
import { MarketSessionType, CTraderConfig } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  Activity, 
  Bell, 
  Clock, 
  Globe, 
  Radio, 
  Sliders, 
  Volume2, 
  VolumeX, 
  Wifi, 
  Send,
  BookOpen,
  BarChart3,
  TrendingUp,
  LayoutDashboard
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentSession: {
    session: MarketSessionType;
    label: string;
    isOverlap: boolean;
    dstStatus: { usDST: boolean; ukDST: boolean };
  };
  cTraderConfig: CTraderConfig;
  unreadAlertCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onTriggerTestPush: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentSession,
  cTraderConfig,
  unreadAlertCount,
  soundEnabled,
  onToggleSound,
  onTriggerTestPush,
  onOpenSettings
}) => {
  const getSessionColor = () => {
    if (currentSession.isOverlap) return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    if (currentSession.session === 'LONDON') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (currentSession.session === 'NEW_YORK') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (currentSession.session === 'ASIAN') return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'chart', label: 'Chart', icon: TrendingUp },
    { id: 'signals', label: 'Signals Feed', icon: Activity },
    { id: 'alerts', label: 'Alerts & Push', icon: Bell, badge: unreadAlertCount },
    { id: 'backtest', label: 'Backtest', icon: BarChart3 },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'ctrader', label: 'Market Data', icon: Wifi }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#070b14]/95 backdrop-blur border-b border-slate-800/80">
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-slate-800/50 text-xs">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-slate-950 font-black text-sm">
              G
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black tracking-wider text-slate-100 text-sm">GREVIN AI</span>
                <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  INSTITUTIONAL
                </span>
              </div>
            </div>
          </div>

          {/* Active Market Session Badge */}
          <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${getSessionColor()}`}>
            <span className={`w-2 h-2 rounded-full ${currentSession.isOverlap ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'}`}></span>
            <span className="font-bold">{currentSession.label}</span>
          </div>

          {/* Daylight Saving Time Indicator */}
          <div className="hidden xl:flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span>DST: US {currentSession.dstStatus.usDST ? 'EDT' : 'EST'} / UK {currentSession.dstStatus.ukDST ? 'BST' : 'GMT'}</span>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex items-center gap-2.5">
          {/* cTrader Connection Badge */}
          <div 
            onClick={() => onSelectTab('ctrader')}
            className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition ${
              cTraderConfig.simulationMode
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50'
                : cTraderConfig.connected && !cTraderConfig.isStale
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50'
                : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/50'
            }`}
            title="cTrader Open API Connection Status"
          >
            <Radio className={`w-3 h-3 ${
              cTraderConfig.simulationMode ? 'text-amber-400' : cTraderConfig.connected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'
            }`} />
            <span>
              {cTraderConfig.simulationMode 
                ? 'SIMULATION MODE' 
                : cTraderConfig.connected 
                ? `cTrader: ${cTraderConfig.latencyMs !== null ? `${cTraderConfig.latencyMs}ms` : 'Connected'}` 
                : 'cTrader: NOT CONNECTED'}
            </span>
          </div>

          {/* Push Test Button */}
          <button
            onClick={onTriggerTestPush}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition"
            title="Send test push notification to Android phone and background service worker"
          >
            <Send className="w-3 h-3 text-cyan-400" />
            <span>Test Push</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded border transition ${
              soundEnabled
                ? 'bg-slate-900 text-cyan-400 border-slate-700 hover:bg-slate-800'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
            }`}
            title={soundEnabled ? 'Audio alerts active' : 'Audio alerts muted'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Settings Modal Button */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
            title="System Settings & Unit Tests"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center px-4 overflow-x-auto scrollbar-none gap-1 bg-[#090d16]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition relative ${
                isActive
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
