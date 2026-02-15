import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export function utcToTenantTz(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

export function tenantTzToUtc(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

export function formatInTenantTz(date: Date, timezone: string, fmt: string = 'yyyy-MM-dd HH:mm'): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, fmt);
}
