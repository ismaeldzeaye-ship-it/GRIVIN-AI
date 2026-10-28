import { AlertNotification, NotificationControls, NotificationType, TradingSignal } from '../types';
import { playSignalChime } from './audioAlerts';

export const DEFAULT_NOTIFICATION_CONTROLS: NotificationControls = {
  enabled: true,
  selectedInstruments: ['XAU/USD', 'EUR/USD', 'GBP/USD', 'US30', 'NAS100', 'BTC/USD'],
  selectedNotificationTypes: [
    'BUY_SETUP',
    'SELL_SETUP',
    'STATUS_WAIT',
    'STATUS_INVALID',
    'PRICE_LEVEL',
    'PRICE_APPROACH_POC',
    'PRICE_APPROACH_VAH_VAL',
    'CONFIRMED_BOS',
    'CONFIRMED_CHOCH',
    'CONFIRMED_BREAKOUT',
    'CONFIRMED_VA_REVERSAL',
    'CONFIRMED_POC_BOUNCE',
    'CONNECTION_INTERRUPTED',
    'DATA_FEED_STALE'
  ],
  selectedTimeframes: ['M5', 'M15', 'H1'],
  minimumGrade: 'B',
  cooldownMinutes: 5,
  quietHoursEnabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '06:00',
  soundAlertsEnabled: true,
  vibrateEnabled: true
};

// Map of setup signatures to last alert timestamp to prevent duplicate notifications
const lastAlertSignatures = new Map<string, number>();

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn('Service Worker registration skipped or failed:', err);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

export function isQuietHoursActive(controls: NotificationControls): boolean {
  if (!controls.quietHoursEnabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = controls.quietHoursStart.split(':').map(Number);
  const [endH, endM] = controls.quietHoursEnd.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    // Over midnight (e.g., 23:00 to 06:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

/**
 * Checks cooldown and de-duplicates alerts for the same unchanged setup
 */
export function shouldSendNotification(
  notification: AlertNotification,
  controls: NotificationControls
): boolean {
  if (!controls.enabled) return false;

  // Check instrument filter
  if (!controls.selectedInstruments.includes(notification.instrument)) {
    return false;
  }

  // Check notification type filter
  if (!controls.selectedNotificationTypes.includes(notification.type)) {
    return false;
  }

  // Check quiet hours
  if (isQuietHoursActive(controls)) {
    return false;
  }

  // Check signature de-duplication
  const signature = `${notification.instrument}-${notification.type}-${notification.direction || ''}-${notification.strategyName || ''}`;
  const now = Date.now();
  const lastTime = lastAlertSignatures.get(signature);

  if (lastTime && now - lastTime < controls.cooldownMinutes * 60 * 1000) {
    // Duplicate alert within cooldown period -> suppress
    return false;
  }

  lastAlertSignatures.set(signature, now);
  return true;
}

/**
 * Format notification payload exactly as required by specification:
 * "GREVIN AI — BUY SETUP"
 * "Instrument: XAU/USD"
 * "Timeframe: M15 / M5 confirmation"
 * "Strategy: POC Bounce"
 * "Status: Confirmation received"
 * "Entry, stop-loss, and target: Open GREVIN AI to view verified levels."
 */
export function formatSignalNotification(signal: TradingSignal): AlertNotification {
  const directionTitle = signal.direction === 'BUY' ? 'BUY SETUP' : signal.direction === 'SELL' ? 'SELL SETUP' : 'WAIT FOR CONFIRMATION';
  const title = `GREVIN AI — ${directionTitle} [GRADE ${signal.grade}]`;
  const tfText = `${signal.timeframe}${signal.confirmationTimeframe ? ` / ${signal.confirmationTimeframe} confirmation` : ''}`;

  const body = [
    `Instrument: ${signal.symbol}`,
    `Timeframe: ${tfText}`,
    `Strategy: ${signal.strategyName}`,
    `Setup Grade: ${signal.grade}`,
    `Status: ${signal.status === 'VALID' ? 'Confirmation received' : 'Monitoring conditions'}`,
    `Entry: ${signal.entryPrice} | SL: ${signal.stopLoss} | Target: ${signal.tp} (2R)`,
    `Entry, stop-loss, and target: Open GREVIN AI to view verified levels.`
  ].join('\n');

  return {
    id: `notif-${signal.id}-${Date.now()}`,
    type: signal.direction === 'BUY' ? 'BUY_SETUP' : 'SELL_SETUP',
    title,
    body,
    instrument: signal.symbol,
    direction: signal.direction,
    timeframe: tfText,
    strategyName: signal.strategyName,
    entryZone: `${signal.entryZone.min} - ${signal.entryZone.max}`,
    stopLoss: signal.stopLoss,
    takeProfit: signal.tp,
    grade: signal.grade,
    reason: signal.reason,
    timestamp: Date.now(),
    read: false
  };
}

/**
 * Dispatches notification through:
 * 1. Web Push / Service Worker (works in background / when closed)
 * 2. In-app audio chime
 * 3. Browser notification API fallback
 */
export async function dispatchNotification(
  notification: AlertNotification,
  controls: NotificationControls
): Promise<void> {
  // Play sound if enabled
  if (controls.soundAlertsEnabled) {
    if (notification.type === 'BUY_SETUP') {
      playSignalChime('BUY');
    } else if (notification.type === 'SELL_SETUP') {
      playSignalChime('SELL');
    } else if (notification.type.includes('BOS') || notification.type.includes('CHOCH')) {
      playSignalChime('BOS');
    } else if (notification.type === 'DATA_FEED_STALE' || notification.type === 'CONNECTION_INTERRUPTED') {
      playSignalChime('STALE');
    } else {
      playSignalChime('ALERT');
    }
  }

  // Trigger vibration if supported
  if (controls.vibrateEnabled && typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // ignore
    }
  }

  // Post to Service Worker for background push
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(notification.title, {
          body: notification.body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: notification.id,
          vibrate: controls.vibrateEnabled ? [200, 100, 200] : undefined,
          data: { url: `/?symbol=${encodeURIComponent(notification.instrument)}` }
        } as unknown as NotificationOptions);
        return;
      }
    } catch (err) {
      console.warn('Service worker showNotification failed:', err);
    }
  }

  // Direct Notification API fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notification.title, {
        body: notification.body,
        icon: '/icon.svg'
      });
    } catch (err) {
      console.warn('Direct notification failed:', err);
    }
  }
}
