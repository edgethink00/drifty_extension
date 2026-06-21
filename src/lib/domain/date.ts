const MINUTES_PER_DAY = 24 * 60;

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftIsoDate(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function secondsToLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function normalizeStartOfDayMinutes(minutes = 0): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(minutes)));
}

export function logicalDayStartMs(day: string, startOfDayMinutes = 0): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 0, 0, 0, 0).getTime() + normalizeStartOfDayMinutes(startOfDayMinutes) * 60 * 1000;
}

export function logicalDayEndExclusiveMs(day: string, startOfDayMinutes = 0): number {
  return logicalDayStartMs(day, startOfDayMinutes) + MINUTES_PER_DAY * 60 * 1000;
}

export function logicalDayIsoDateForDate(date: Date, startOfDayMinutes = 0): string {
  const shifted = new Date(date.getTime() - normalizeStartOfDayMinutes(startOfDayMinutes) * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function logicalMinuteOfDay(minuteOfDay: number, startOfDayMinutes = 0): number {
  const normalized = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return (normalized - normalizeStartOfDayMinutes(startOfDayMinutes) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
