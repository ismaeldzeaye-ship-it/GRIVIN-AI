import { MarketSessionType, Candle } from '../types';

export interface SessionBoundary {
  name: MarketSessionType;
  label: string;
  startHourUTC: number;
  startMinuteUTC: number;
  endHourUTC: number;
  endMinuteUTC: number;
  color: string;
  borderColor: string;
}

export interface UtcSessionState {
  sessionKey: 'ASIAN' | 'LONDON_KILLZONE' | 'LONDON_MID' | 'LONDON_NY_OVERLAP' | 'NY_AFTERNOON' | 'LATE' | 'CLOSED';
  label: string;
  utcTimeStr: string;
  timestamp: number;
  isQuietHours: boolean; // Asian (00-07) and Late (21-24)
  isFirstTwoMinutes: boolean; // Volatility buffer at session open (minutes 0 and 1)
  allowsSignals: boolean;
  marketOpen: boolean;
}

/**
 * Daylight Saving Time (DST) checker for US and UK/EU:
 * US: 2nd Sunday in March to 1st Sunday in November
 * UK/EU: Last Sunday in March to Last Sunday in October
 */
export function isDaylightSavingTime(date: Date = new Date()): { usDST: boolean; ukDST: boolean } {
  const year = date.getUTCFullYear();
  const time = date.getTime();

  // US DST: 2nd Sunday in March (2:00 AM) to 1st Sunday in November (2:00 AM)
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchFirstDay = marchFirst.getUTCDay();
  const secondSundayMarch = 1 + (marchFirstDay === 0 ? 7 : (14 - marchFirstDay));
  const usDSTStart = new Date(Date.UTC(year, 2, secondSundayMarch, 2, 0, 0)).getTime();

  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novFirstDay = novFirst.getUTCDay();
  const firstSundayNov = 1 + (novFirstDay === 0 ? 0 : (7 - novFirstDay));
  const usDSTEnd = new Date(Date.UTC(year, 10, firstSundayNov, 2, 0, 0)).getTime();

  const usDST = time >= usDSTStart && time < usDSTEnd;

  // UK/EU DST: Last Sunday in March (1:00 AM) to Last Sunday in October (1:00 AM)
  const lastSundayMarchDate = new Date(Date.UTC(year, 2, 31 - (new Date(Date.UTC(year, 2, 31)).getUTCDay()), 1, 0, 0)).getTime();
  const lastSundayOctDate = new Date(Date.UTC(year, 9, 31 - (new Date(Date.UTC(year, 9, 31)).getUTCDay()), 1, 0, 0)).getTime();
  const ukDST = time >= lastSundayMarchDate && time < lastSundayOctDate;

  return { usDST, ukDST };
}

/**
 * Checks if a given timestamp or Date is during regular New York equity trading hours
 * (09:30 - 16:00 New York time, Monday through Friday, DST-aware).
 */
export function isNewYorkRegularHours(timestampSecOrDate: number | Date = new Date()): boolean {
  const d = typeof timestampSecOrDate === 'number'
    ? (timestampSecOrDate > 1e11 ? new Date(timestampSecOrDate) : new Date(timestampSecOrDate * 1000))
    : timestampSecOrDate;
  const day = d.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) {
    return false; // Weekend is strictly off-hours
  }

  const { usDST } = isDaylightSavingTime(d);
  // In EDT (summer, UTC-4): 09:30 NY is 13:30 UTC, 16:00 NY is 20:00 UTC.
  // In EST (winter, UTC-5): 09:30 NY is 14:30 UTC, 16:00 NY is 21:00 UTC.
  const openMinutesUtc = (usDST ? 13 : 14) * 60 + 30;
  const closeMinutesUtc = (usDST ? 20 : 21) * 60;

  const currentMinutesUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
  return currentMinutesUtc >= openMinutesUtc && currentMinutesUtc < closeMinutesUtc;
}

/**
 * Returns previous regular New York session boundaries (09:30 to 16:00 NY).
 * Used specifically for SPY/QQQ volume profiles.
 */
export function getPreviousRegularSessionWindow(referenceTimeMs: number = Date.now()): {
  startTime: number;
  endTime: number;
  label: string;
} {
  const refDate = new Date(referenceTimeMs);
  const { usDST } = isDaylightSavingTime(refDate);

  const openHourUtc = usDST ? 13 : 14;
  const openMinUtc = 30;
  const closeHourUtc = usDST ? 20 : 21;
  const closeMinUtc = 0;

  // Search backward day by day to find the most recent completed regular weekday session
  const d = new Date(referenceTimeMs);
  const currentTotalMins = refDate.getUTCHours() * 60 + refDate.getUTCMinutes();
  const todayCloseMins = closeHourUtc * 60 + closeMinUtc;

  // If today is a weekday and already after market close (>= closeHourUtc:closeMinUtc),
  // today's regular session is the completed one.
  const dayOfWeek = refDate.getUTCDay();
  let daysBack = (dayOfWeek >= 1 && dayOfWeek <= 5 && currentTotalMins >= todayCloseMins) ? 0 : 1;

  while (true) {
    const targetDate = new Date(referenceTimeMs - daysBack * 86400000);
    const day = targetDate.getUTCDay();
    if (day >= 1 && day <= 5) {
      // Valid weekday found
      const yr = targetDate.getUTCFullYear();
      const mo = targetDate.getUTCMonth();
      const dt = targetDate.getUTCDate();
      const startTime = Date.UTC(yr, mo, dt, openHourUtc, openMinUtc, 0) / 1000;
      const endTime = Date.UTC(yr, mo, dt, closeHourUtc, closeMinUtc, 0) / 1000;
      return {
        startTime,
        endTime,
        label: `Previous NY Regular Session (${targetDate.toISOString().slice(0, 10)} 09:30-16:00 NY)`
      };
    }
    daysBack++;
  }
}

/**
 * Checks if current time is within the first 2 minutes after session open
 * (volatility buffer; block signals during minutes 0 and 1 of session open).
 * Boundaries: 00:00, 07:00, 10:00, 12:00, 15:00, 21:00 UTC.
 */
export function isFirstTwoMinutesOfSession(date: Date = new Date()): boolean {
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  const isBoundaryHour = [0, 7, 10, 12, 15, 21].includes(hour);
  return isBoundaryHour && (minute === 0 || minute === 1);
}

/**
 * Pure UTC Institutional Session Calculator:
 * - Asian: 00:00 - 07:00 UTC (Quiet hours)
 * - London Killzone: 07:00 - 10:00 UTC
 * - London Mid-Session: 10:00 - 12:00 UTC
 * - London/NY Overlap: 12:00 - 15:00 UTC
 * - NY Afternoon: 15:00 - 21:00 UTC
 * - Late: 21:00 - 24:00 UTC (Quiet hours)
 */
export function getUtcSessionState(date: Date = new Date()): UtcSessionState {
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const totalMins = hour * 60 + minute;
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`;
  const isFirstTwoMins = isFirstTwoMinutesOfSession(date);

  // Weekend check for standard markets (Friday 22:00 UTC to Sunday 21:00 UTC)
  const isWeekend = day === 6 || (day === 5 && totalMins >= 22 * 60) || (day === 0 && totalMins < 21 * 60);

  if (totalMins < 7 * 60) {
    // 00:00 - 07:00 Asian Session
    return {
      sessionKey: 'ASIAN',
      label: 'Asian Session (00:00–07:00 UTC)',
      utcTimeStr: timeFormatted,
      timestamp: date.getTime(),
      isQuietHours: true,
      isFirstTwoMinutes: isFirstTwoMins,
      allowsSignals: true, // Controlled by allowQuietHoursSignals switch
      marketOpen: !isWeekend
    };
  }

  if (totalMins < 10 * 60) {
    // 07:00 - 10:00 London Killzone
    return {
      sessionKey: 'LONDON_KILLZONE',
      label: 'London Killzone (07:00–10:00 UTC)',
      utcTimeStr: timeFormatted,
      timestamp: date.getTime(),
      isQuietHours: false,
      isFirstTwoMinutes: isFirstTwoMins,
      allowsSignals: true,
      marketOpen: !isWeekend
    };
  }

  if (totalMins < 12 * 60) {
    // 10:00 - 12:00 London Mid-Session
    return {
      sessionKey: 'LONDON_MID',
      label: 'London Mid-Session (10:00–12:00 UTC)',
      utcTimeStr: timeFormatted,
      timestamp: date.getTime(),
      isQuietHours: false,
      isFirstTwoMinutes: isFirstTwoMins,
      allowsSignals: true,
      marketOpen: !isWeekend
    };
  }

  if (totalMins < 15 * 60) {
    // 12:00 - 15:00 London/NY Overlap
    return {
      sessionKey: 'LONDON_NY_OVERLAP',
      label: 'London/NY Overlap (12:00–15:00 UTC)',
      utcTimeStr: timeFormatted,
      timestamp: date.getTime(),
      isQuietHours: false,
      isFirstTwoMinutes: isFirstTwoMins,
      allowsSignals: true,
      marketOpen: !isWeekend
    };
  }

  if (totalMins < 21 * 60) {
    // 15:00 - 21:00 NY Afternoon
    return {
      sessionKey: 'NY_AFTERNOON',
      label: 'NY Afternoon (15:00–21:00 UTC)',
      utcTimeStr: timeFormatted,
      timestamp: date.getTime(),
      isQuietHours: false,
      isFirstTwoMinutes: isFirstTwoMins,
      allowsSignals: true,
      marketOpen: !isWeekend
    };
  }

  // 21:00 - 24:00 Late Session
  return {
    sessionKey: 'LATE',
    label: 'Late Session (21:00–24:00 UTC)',
    utcTimeStr: timeFormatted,
    timestamp: date.getTime(),
    isQuietHours: true,
    isFirstTwoMinutes: isFirstTwoMins,
    allowsSignals: true, // Controlled by allowQuietHoursSignals switch
    marketOpen: !isWeekend
  };
}

/**
 * Returns session schedules adjusted for UTC and DST.
 */
export function getActiveSessionSchedules(date = new Date()): SessionBoundary[] {
  return [
    {
      name: 'ASIAN',
      label: 'Asian Session (00:00–07:00 UTC)',
      startHourUTC: 0,
      startMinuteUTC: 0,
      endHourUTC: 7,
      endMinuteUTC: 0,
      color: 'rgba(56, 189, 248, 0.12)',
      borderColor: '#38bdf8'
    },
    {
      name: 'LONDON',
      label: 'London Session (07:00–12:00 UTC)',
      startHourUTC: 7,
      startMinuteUTC: 0,
      endHourUTC: 12,
      endMinuteUTC: 0,
      color: 'rgba(168, 85, 247, 0.12)',
      borderColor: '#a855f7'
    },
    {
      name: 'LONDON_NY_OVERLAP',
      label: 'London / NY Overlap (12:00–15:00 UTC)',
      startHourUTC: 12,
      startMinuteUTC: 0,
      endHourUTC: 15,
      endMinuteUTC: 0,
      color: 'rgba(239, 68, 68, 0.18)',
      borderColor: '#ef4444'
    },
    {
      name: 'NEW_YORK',
      label: 'NY Afternoon (15:00–21:00 UTC)',
      startHourUTC: 15,
      startMinuteUTC: 0,
      endHourUTC: 21,
      endMinuteUTC: 0,
      color: 'rgba(234, 179, 8, 0.12)',
      borderColor: '#eab308'
    }
  ];
}

/**
 * Determine the current market session given a timestamp or Date (backward compatible).
 */
export function getCurrentSession(date = new Date()): {
  session: MarketSessionType;
  label: string;
  isOverlap: boolean;
  dstStatus: { usDST: boolean; ukDST: boolean };
} {
  const state = getUtcSessionState(date);
  const dst = isDaylightSavingTime(date);

  let session: MarketSessionType = 'ASIAN';
  if (state.sessionKey === 'CLOSED') session = 'CLOSED';
  else if (state.sessionKey === 'LONDON_KILLZONE' || state.sessionKey === 'LONDON_MID') session = 'LONDON';
  else if (state.sessionKey === 'LONDON_NY_OVERLAP') session = 'LONDON_NY_OVERLAP';
  else if (state.sessionKey === 'NY_AFTERNOON') session = 'NEW_YORK';
  else session = 'ASIAN';

  return {
    session,
    label: state.label,
    isOverlap: state.sessionKey === 'LONDON_NY_OVERLAP',
    dstStatus: dst
  };
}

/**
 * Filters candles belonging to a specific session range or extracts session highs and lows.
 */
export function getSessionHighLow(candles: Candle[], session: MarketSessionType): { high: number; low: number } | null {
  if (!candles.length) return null;
  let high = -Infinity;
  let low = Infinity;
  let found = false;

  const schedules = getActiveSessionSchedules();
  const schedule = schedules.find(s => s.name === session);
  if (!schedule) return null;

  for (const c of candles) {
    const d = new Date(c.time * 1000);
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    const startMins = schedule.startHourUTC * 60 + schedule.startMinuteUTC;
    const endMins = schedule.endHourUTC * 60 + schedule.endMinuteUTC;

    if (mins >= startMins && mins < endMins) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      found = true;
    }
  }

  return found ? { high, low } : null;
}

/**
 * Returns previous profile session boundaries:
 * - Crypto: UTC day (00:00 to 24:00 UTC).
 * - Forex, Gold and Indices: 17:00 New York with daylight saving.
 */
export function getPreviousProfileSessionBoundaries(
  referenceTimeMs: number = Date.now(),
  isCrypto: boolean = false
): { startTime: number; endTime: number; sessionLabel: string } {
  const refDate = new Date(referenceTimeMs);

  if (isCrypto) {
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth();
    const day = refDate.getUTCDate();
    const todayMidnightUtc = Date.UTC(year, month, day, 0, 0, 0) / 1000;
    const yesterdayMidnightUtc = todayMidnightUtc - 86400;
    return {
      startTime: yesterdayMidnightUtc,
      endTime: todayMidnightUtc,
      sessionLabel: `Crypto UTC Day (${new Date(yesterdayMidnightUtc * 1000).toISOString().slice(0, 10)})`
    };
  }

  // Forex, Gold, Indices: 17:00 New York with daylight saving
  const { usDST } = isDaylightSavingTime(refDate);
  // In EDT (summer), 17:00 NY is 21:00 UTC. In EST (winter), 17:00 NY is 22:00 UTC.
  const ny17HourUtc = usDST ? 21 : 22;

  const year = refDate.getUTCFullYear();
  const month = refDate.getUTCMonth();
  const day = refDate.getUTCDate();

  const boundaryTodayUtc = Date.UTC(year, month, day, ny17HourUtc, 0, 0) / 1000;
  const refSec = Math.floor(referenceTimeMs / 1000);

  let currentSessionStart: number;
  if (refSec >= boundaryTodayUtc) {
    currentSessionStart = boundaryTodayUtc;
  } else {
    currentSessionStart = boundaryTodayUtc - 86400;
  }

  const prevSessionEnd = currentSessionStart;
  const prevSessionStart = prevSessionEnd - 86400;

  return {
    startTime: prevSessionStart,
    endTime: prevSessionEnd,
    sessionLabel: `17:00 NY Profile (${usDST ? 'EDT 21:00 UTC' : 'EST 22:00 UTC'})`
  };
}

/**
 * Returns the active institutional Kill Zone
 */
export function getInstitutionalKillZone(date: Date = new Date()): string {
  const state = getUtcSessionState(date);
  switch (state.sessionKey) {
    case 'ASIAN': return 'ASIAN_SESSION';
    case 'LONDON_KILLZONE': return 'LONDON_OPEN_KILLZONE';
    case 'LONDON_MID': return 'LONDON_MID_SESSION';
    case 'LONDON_NY_OVERLAP': return 'LONDON_NY_OVERLAP';
    case 'NY_AFTERNOON': return 'NY_AFTERNOON';
    case 'LATE': return 'LATE_SESSION';
    default: return 'OUTSIDE_SESSION';
  }
}
