import { missingDetails } from '../core/model/completeness';
import { Person } from '../core/model/types';
import { I18n } from '../i18n/i18n';

/** "To fill in: first name, year of birth", or empty when nothing is missing. For the flag on cards and in lists. */
export function missingText(i18n: I18n, person: Person): string {
  const gaps = missingDetails(person);
  return gaps.length ? i18n.t('missing.title', { list: i18n.list(gaps.map((g) => i18n.t(`missing.${g}`))) }) : '';
}
