/**
 * What is still missing about a person, when they are taken to have died, and
 * whether they died at birth. The chart and the people list flag the gaps; the
 * editor marks the long dead as dead; cards of the dead carry a ribbon.
 */
import { GenDate, LifeEvent, Person } from './types';

/** A detail worth filling in: the given name, or the year of birth. */
export type MissingDetail = 'given' | 'birthYear';

/** People born longer ago than this are taken to have died. */
export const ASSUMED_DEAD_AFTER_YEARS = 100;

/**
 * The details nobody has filled in for this person. A given name or a year of
 * birth that is ticked as unknown is not missing: it is known not to be known.
 */
export function missingDetails(person: Person): MissingDetail[] {
  const out: MissingDetail[] = [];
  if (!person.name.given.trim() && !person.name.givenUnknown) out.push('given');
  if (!hasDate(person.birth) && !person.birth?.dateUnknown) out.push('birthYear');
  return out;
}

/** A date has been given, as a calendar date or in words. */
export function hasDate(event: LifeEvent | undefined): boolean {
  return !!(event?.date?.value || event?.date?.text?.trim());
}

/** The year of a date, when it has one. */
export function yearOf(date: GenDate | undefined): number | undefined {
  const m = /^(\d{1,4})/.exec(date?.value ?? '');
  return m ? Number(m[1]) : undefined;
}

/**
 * Born so long ago that they cannot be alive: more than a hundred years before
 * `now`. A birth recorded as "after" a year is not enough to tell.
 */
export function bornLongAgo(birth: GenDate | undefined, now: Date = new Date()): boolean {
  const year = yearOf(birth);
  if (year === undefined || birth?.qualifier === 'after') return false;
  return now.getFullYear() - year > ASSUMED_DEAD_AFTER_YEARS;
}

/**
 * Died the day they were born. Dates are compared as far as both are known:
 * with only years, the same year counts.
 */
export function diedAtBirth(person: Person): boolean {
  const born = person.birth?.date?.value;
  const died = person.death?.date?.value;
  if (!born || !died) return false;
  const [short, long] = born.length <= died.length ? [born, died] : [died, born];
  return long.startsWith(short);
}
