import { Person } from './types';

/**
 * "Anna Marie Hartmann". Someone whose given name is not known is "Unknown
 * Hartmann", with `unknown` in the language wanted (see I18n.name for the app's).
 */
export function displayName(person: Person | undefined, unknown = 'Unknown'): string {
  if (!person) return 'Unknown person';
  const given = person.name.given.trim() || unknown;
  const surname = person.name.surname.trim();
  return surname ? `${given} ${surname}` : given;
}

/** Whether nobody knows the person's given name: the chart says "Unknown" and draws the card dashed. */
export function nameUnknown(person: Person): boolean {
  return !person.name.given.trim();
}

/** Surname line with the birth surname when it differs: "Ashworth née Moreau". */
export function surnameLine(person: Person): string {
  const surname = person.name.surname.trim();
  const birth = person.name.birthSurname?.trim();
  if (birth && birth !== surname) return surname ? `${surname} née ${birth}` : birth;
  return surname;
}

/** "Hartmann, Anna Marie" for alphabetical lists; "Hartmann, Unknown" when the given name is not known. */
export function sortName(person: Person, unknown = 'Unknown'): string {
  const given = person.name.given.trim() || unknown;
  const surname = person.name.surname.trim();
  return surname ? `${surname}, ${given}` : given;
}

let graphemes: Intl.Segmenter | null | undefined;

function firstLetter(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (graphemes === undefined) {
    graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  // The first user-perceived character, so "Šárka" gives "Š" even when decomposed.
  const first = graphemes ? (graphemes.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? '') : Array.from(trimmed)[0];
  return first.toLocaleUpperCase();
}

/** One or two letters for the chart badge. */
export function initials(person: Person): string {
  const given = firstLetter(person.name.given);
  const surname = firstLetter(person.name.surname || person.name.birthSurname || '');
  return given + surname || '?';
}

function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

/**
 * Groups spellings of one family name under a single key, so the chart can colour
 * a family consistently. Folds case, diacritics and the common feminine forms of
 * Central and Eastern European surnames (Novák/Nováková, Svoboda/Svobodová,
 * Marek/Marková, Černý/Černá, Heczko/Heczková, Kowalski/Kowalska, Ivanov/Ivanova).
 *
 * With `united`, the Polish and the Czech way of writing one name are one family too: a name was written
 * as the parish or the office of the day wrote it, Nowak on one side of the border and Novák on the other
 * (w and v, sz and š, cz and č, rz and ř, ł and l, and a married woman's -owa beside -ová).
 */
export function surnameKey(raw: string | undefined, united: boolean | Unite = false): string {
  const text = (raw ?? '').trim().toLocaleLowerCase().normalize('NFC');
  if (!text) return '';
  const words = text.split(/\s+/);
  let last = words[words.length - 1];
  if (last.length > 4 && last.endsWith('ová')) last = last.slice(0, -3);
  else if (united && last.length > 5 && last.endsWith('owa')) last = last.slice(0, -3);
  else if (/(?:sk|ck|dzk)[ia]$/.test(last)) last = last.slice(0, -1);
  else if (last.length > 3 && /[áý]$/.test(last)) last = last.slice(0, -1);
  else if (last.length > 3 && /[ao]$/.test(last)) last = last.slice(0, -1);
  // The movable e of Czech names: Marek and Marková, Němec and Němcová, Havel and Havlová.
  last = last.replace(/([^aáeéěiíoóuúůyý])[eě]([kcl])$/, '$1$2');
  words[words.length - 1] = last;
  const key = stripDiacritics(words.join(' '));
  return unitedKey(key, united);
}

/**
 * Which other ways of writing a surname count as the same family (see ViewSettings.uniteSpellings,
 * uniteForeign). `true` alone is the Polish way. Letters with and without their marks are one always.
 */
export interface Unite {
  /** Polish and Czech: Nowak and Novák, Kowalczyk and Kovalčík. */
  polish?: boolean;
  /** German and Czech: Schmidt and Šmíd, Schwarz and Švarc, Müller and Mueller, Weiss and Vajs. */
  foreign?: boolean;
}

/** What a tree's settings unite. */
export function unitingOf(view: { uniteSpellings: boolean; uniteForeign?: boolean }): Unite {
  return { polish: view.uniteSpellings, foreign: !!view.uniteForeign };
}

/**
 * A family's key (see surnameKey, already without the marks over letters) with the other ways of writing it
 * made one: "nowak" and "novak" are "novak"; "schmidt" and "smid" are "smit".
 */
export function unitedKey(key: string, united: boolean | Unite = true): string {
  const u: Unite = typeof united === 'boolean' ? { polish: united } : united;
  let k = key;
  if (u.foreign) {
    k = k
      .replace(/ß/g, 'ss')
      .replace(/chs/g, 'ks')
      .replace(/tsch/g, 'c')
      .replace(/sch/g, 's')
      .replace(/(?:tz|z)/g, 'c')
      .replace(/ck/g, 'k')
      .replace(/ph/g, 'f')
      .replace(/th/g, 't')
      .replace(/dt/g, 't')
      .replace(/qu/g, 'kv')
      .replace(/ae/g, 'a')
      .replace(/oe/g, 'o')
      .replace(/ue/g, 'u')
      .replace(/ie/g, 'i')
      .replace(/eu/g, 'oj')
      .replace(/[ea][iy]/g, 'aj')
      .replace(/y/g, 'i')
      .replace(/w/g, 'v')
      // Doubled letters as one, and a d at the end as it is said: Schmidt, Šmíd and Šmít.
      .replace(/([a-z])\1+/g, '$1')
      .replace(/d\b/g, 't');
  }
  if (u.polish) k = k.replace(/ł/g, 'l').replace(/w/g, 'v').replace(/sz/g, 's').replace(/cz/g, 'c').replace(/rz/g, 'r');
  return k;
}

/** The surname a person was born with, which decides their family colour. */
export function lineageSurname(person: Person): string {
  return person.name.birthSurname?.trim() || person.name.surname.trim();
}

export function searchText(person: Person): string {
  const parts = [person.name.given, person.name.surname, person.name.birthSurname ?? '', person.name.nickname ?? ''];
  return stripDiacritics(parts.join(' ').toLocaleLowerCase());
}

export function normalizeQuery(query: string): string {
  return stripDiacritics(query.trim().toLocaleLowerCase());
}
