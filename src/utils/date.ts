import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import { enUS, ja, zhCN } from 'date-fns/locale';
import type { SupportedLocale } from '../i18n/messages';

export function formatDateRange(startsOn: string, endsOn: string): string {
  return startsOn === endsOn ? startsOn : `${startsOn} - ${endsOn}`;
}

const DATE_FNS_LOCALE = {
  zh: zhCN,
  en: enUS,
  ja,
} satisfies Record<SupportedLocale, unknown>;

export function formatPredictionTime(isoString: string, locale: SupportedLocale): string {
  const date = new Date(isoString);
  const dateFnsLocale = DATE_FNS_LOCALE[locale];
  if (Math.abs(differenceInDays(date, new Date())) < 1) {
    return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale });
  }
  return format(date, 'yyyy-MM-dd HH:mm');
}

export function formatPredictionFullTime(isoString: string): string {
  return format(new Date(isoString), 'yyyy-MM-dd HH:mm:ss');
}
