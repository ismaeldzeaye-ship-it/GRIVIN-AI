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

/**
 * Daylight Saving Time (DST) checker for US and UK/EU:
 * US: 2nd Sunday in March to 1st Sunday in November
 * UK/EU: Last Sunday in March to Last Sunday in October
 */
export function isDaylightSavingTime(date: Date): { usDST: boolean; ukDST: boolean } {
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
 * Returns session schedules adjusted for UTC and DST.
 */
export function getActiveSessionSchedules(date = new Date()): SessionBoundary[] {
  const { usDST, ukDST } = isDaylightSavingTime(date);

  // Asian session: 00:00 - 08:00 UTC (Tokyo/Sydney)
  // London session: 07:00 or 08:00 UTC depending on UK DST (BST is UTC+1)
  // When UK is on BST (summer), London opens at 07:00 UTC, closes 15:30 UTC.
  // When UK is on GMT (winter), London opens at 08:00 UTC, closes 16:30 UTC.
  const londonStart = ukDST ? 7 : 8;
  const londonEndHour = ukDST ? 15 : 16;
  const londonEndMin = 30;

  // New York session: 8:00 AM - 5:00 PM EST/EDT
  // US EDT (summer) is UTC-4 -> 12:00 UTC - 21:00 UTC
  // US EST (winter) is UTC-5 -> 13:00 UTC - 22:00 UTC
  const nyStart = usDST ? 12 : 13;
  const nyEndHour = usDST ? 20 : 21;
  const nyEndMin = 30;

  return [
    {
      name: 'ASIAN',
      label: 'Asian Session (Tokyo/Sydney)',
      startHourUTC: 0,
      startMinuteUTC: 0,
      endHourUTC: 8,
      endMinuteUTC: 0,
      color: 'rgba(56, 189, 248, 0.12)',
      borderColor: '#38bdf8'
    },
    {
      name: 'LONDON',
      label: 'London Session (Pre-NY)',
      startHourUTC: londonStart,
      startMinuteUTC: 0,
      endHourUTC: londonEndHour,
      endMinuteUTC: londonEndMin,
      color: 'rgba(168, 85, 247, 0.12)',
      borderColor: '#a855f7'
    },
    {
      name: 'NEW_YORK',
      label: 'New York Session',
      startHourUTC: nyStart,
      startMinuteUTC: 0,
      endHourUTC: nyEndHour,
      endMinuteUTC: nyEndMin,
      color: 'rgba(234, 179, 8, 0.12)',
      borderColor: '#eab308'
    },
    {
      name: 'LONDON_NY_OVERLAP',
      label: 'London / NY Institutional Overlap',
      startHourUTC: nyStart,
      startMinuteUTC: 0,
      endHourUTC: londonEndHour,
      endMinuteUTC: londonEndMin,
      color: 'rgba(239, 68, 68, 0.18)',
      borderColor: '#ef4444'
    }
  ];
}

/**
 * Determine the current market session given a timestamp or Date.
 */
export function getCurrentSession(date = new Date()): {
  session: MarketSessionType;
  label: string;
  isOverlap: boolean;
  dstStatus: { usDST: boolean; ukDST: boolean };
} {
  const day = date.getUTCDay();
  const dst = isDaylightSavingTime(date);

  // Weekend check: closed from Friday 22:00 UTC to Sunday 21:00 UTC
  const hour = date.getUTCHours();
  const min = date.getUTCMinutes();
  const totalMins = hour * 60 + min;

  if (day === 6 || (day === 5 && totalMins >= 22 * 60) || (day === 0 && totalMins < 21 * 60)) {
    return {
      session: 'CLOSED',
      label: 'Weekend — Market Closed',
      isOverlap: false,
      dstStatus: dst
    };
  }

  const schedules = getActiveSessionSchedules(date);
  const overlap = schedules.find(s => s.name === 'LONDON_NY_OVERLAP')!;
  const ny = schedules.find(s => s.name === 'NEW_YORK')!;
  const london = schedules.find(s => s.name === 'LONDON')!;
  const asian = schedules.find(s => s.name === 'ASIAN')!;

  const overlapStart = overlap.startHourUTC * 60 + overlap.startMinuteUTC;
  const overlapEnd = overlap.endHourUTC * 60 + overlap.endMinuteUTC;

  if (totalMins >= overlapStart && totalMins < overlapEnd) {
    return {
      session: 'LONDON_NY_OVERLAP',
      label: 'London / NY Overlap (Peak Volume)',
      isOverlap: true,
      dstStatus: dst
    };
  }

  const nyStart = ny.startHourUTC * 60 + ny.startMinuteUTC;
  const nyEnd = ny.endHourUTC * 60 + ny.endMinuteUTC;
  if (totalMins >= nyStart && totalMins < nyEnd) {
    return {
      session: 'NEW_YORK',
      label: 'New York Session',
      isOverlap: false,
      dstStatus: dst
    };
  }

  const londonStart = london.startHourUTC * 60 + london.startMinuteUTC;
  const londonEnd = london.endHourUTC * 60 + london.endMinuteUTC;
  if (totalMins >= londonStart && totalMins < londonEnd) {
    return {
      session: 'LONDON',
      label: 'London Session',
      isOverlap: false,
      dstStatus: dst
    };
  }

  const asianStart = asian.startHourUTC * 60 + asian.startMinuteUTC;
  const asianEnd = asian.endHourUTC * 60 + asian.endMinuteUTC;
  if (totalMins >= asianStart && totalMins < asianEnd) {
    return {
      session: 'ASIAN',
      label: 'Asian Session',
      isOverlap: false,
      dstStatus: dst
    };
  }

  return {
    session: 'ASIAN',
    label: 'Late NY / Pre-Asia Transition',
    isOverlap: false,
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
