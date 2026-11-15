/**
 * The tree as a GEDCOM 5.5.1 file (.ged), the format genealogy sites such as
 * MyHeritage, Ancestry and FamilySearch read. It is an export only: Stemma's
 * own file is the XML, which keeps everything; GEDCOM keeps the people, their
 * names, births and deaths, and the families with their children.
 *
 * What GEDCOM has no place for is left out: portraits (stored in the tree,
 * where GEDCOM expects files beside it), the layout, print settings and
 * twins as a group (they keep their shared date of birth).
 *
 * Choices made for the sites that read it:
 * - UTF-8 with a byte order mark and CRLF line ends.
 * - A woman's name at birth is her main name; the surname she bears now is
 *   added as her married name.
 * - In a family, a man is the husband and a woman the wife; a couple of the
 *   same (or unknown) sex are written in the order they are in the tree.
 */
import { APP_VERSION } from '../xml/format';
import { ChildRelation, DateQualifier, Family, GenDate, LifeEvent, Person, Sex, TreeDocument } from '../model/types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const QUALIFIERS: Record<DateQualifier, string> = { about: 'ABT', before: 'BEF', after: 'AFT', estimated: 'EST', calculated: 'CAL' };

/** GEDCOM's pedigree values; a stepchild has none, as it is not a child of that couple. */
const PEDIGREE: Partial<Record<ChildRelation, string>> = { biological: 'birth', adopted: 'adopted', foster: 'foster' };

/** A line is at most 255 characters; longer values go on in CONC lines. */
const MAX_VALUE = 200;

export interface GedcomOptions {
  /** When the file is written, for the header. */
  now?: Date;
  /** The file's own name, recorded in the header. */
  filename?: string;
}

export function toGedcom(doc: TreeDocument, options: GedcomOptions = {}): string {
  const now = options.now ?? new Date();
  const lines: string[] = [];
  const add = (level: number, tag: string, value = '') => {
    for (const l of valueLines(level, tag, value)) lines.push(l);
  };

  // People and families get GEDCOM ids of their own (@I1@, @F1@): Stemma's ids may hold characters GEDCOM does not allow.
  const personRef = new Map(doc.people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const familyRef = new Map(doc.families.map((f, i) => [f.id, `@F${i + 1}@`]));

  add(0, 'HEAD');
  add(1, 'SOUR', 'STEMMA');
  add(2, 'VERS', APP_VERSION);
  add(2, 'NAME', 'Stemma');
  add(1, 'DEST', 'ANY');
  add(1, 'DATE', gedDay(now));
  add(2, 'TIME', `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
  add(1, 'SUBM', '@SUBM@');
  if (options.filename) add(1, 'FILE', options.filename);
  add(1, 'GEDC');
  add(2, 'VERS', '5.5.1');
  add(2, 'FORM', 'LINEAGE-LINKED');
  add(1, 'CHAR', 'UTF-8');
  if (doc.meta.title) add(1, 'NOTE', doc.meta.title);

  add(0, '@SUBM@ SUBM');
  add(1, 'NAME', 'Stemma');

  for (const person of doc.people) {
    add(0, `${personRef.get(person.id)} INDI`);
    names(person, add);
    add(1, 'SEX', sexCode(person.sex));
    event(1, 'BIRT', person.birth, add);
    if (person.death) event(1, 'DEAT', person.death, add, true);
    if (person.occupation) add(1, 'OCCU', person.occupation);
    for (const f of doc.families) {
      const child = f.children.find((c) => c.personId === person.id);
      if (!child) continue;
      add(1, 'FAMC', familyRef.get(f.id));
      const pedigree = PEDIGREE[child.relation];
      if (pedigree) add(2, 'PEDI', pedigree);
    }
    for (const f of doc.families) if (f.partners.includes(person.id)) add(1, 'FAMS', familyRef.get(f.id));
    if (person.notes) add(1, 'NOTE', person.notes);
  }

  for (const family of doc.families) {
    add(0, `${familyRef.get(family.id)} FAM`);
    const [husband, wife] = spouses(family, doc);
    if (husband) add(1, 'HUSB', personRef.get(husband));
    if (wife) add(1, 'WIFE', personRef.get(wife));
    for (const c of family.children) {
      const ref = personRef.get(c.personId);
      if (ref) add(1, 'CHIL', ref);
    }
    if (family.engagement) event(1, 'ENGA', family.engagement, add, true);
    if (family.kind === 'marriage') {
      event(1, 'MARR', family.start, add, true);
    } else if (family.kind === 'partnership') {
      // GEDCOM 5.5.1 has no partnership: a marriage whose type says so, which the sites show as partners.
      add(1, 'MARR');
      add(2, 'TYPE', 'Partners');
      eventDetails(2, family.start, add);
    }
    const end = family.end;
    if (end?.reason === 'divorce') event(1, 'DIV', end, add, true);
    else if (end?.reason === 'annulment') event(1, 'ANUL', end, add, true);
    else if (end?.reason === 'separation') {
      add(1, 'EVEN');
      add(2, 'TYPE', 'Separation');
      eventDetails(2, end, add);
    }
    if (family.notes) add(1, 'NOTE', family.notes);
  }

  add(0, 'TRLR');
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

type Add = (level: number, tag: string, value?: string) => void;

function names(person: Person, add: Add): void {
  const { given, surname, birthSurname, nickname, derived } = person.name;
  // A surname taken from her husband is not hers from birth.
  const atBirth = (birthSurname || (derived ? '' : surname) || '').trim();
  const first = given.trim();
  add(1, 'NAME', personalName(first, atBirth));
  if (first) add(2, 'GIVN', first);
  if (atBirth) add(2, 'SURN', atBirth);
  if (nickname) add(2, 'NICK', nickname);
  // The surname she bears now, when it is not the one she was born with (a recorded one, or one taken from her husband).
  const now = surname.trim();
  if (birthSurname && now && now !== birthSurname.trim()) {
    add(1, 'NAME', personalName(first, now));
    add(2, 'TYPE', 'married');
    if (first) add(2, 'GIVN', first);
    add(2, 'SURN', now);
  } else if (derived && now && !birthSurname) {
    // Her surname at birth is not known; the one shown is her husband's.
    add(1, 'NAME', personalName(first, now));
    add(2, 'TYPE', 'married');
  }
}

/** "Given /Surname/", the way GEDCOM marks the surname; slashes in the names themselves are dropped. */
function personalName(given: string, surname: string): string {
  const clean = (s: string) => s.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  // No surname: the given name alone ("Soňa"), not "Soňa //".
  return [clean(given), clean(surname) ? `/${clean(surname)}/` : ''].filter((s) => s !== '').join(' ');
}

function sexCode(sex: Sex): string {
  return sex === 'male' ? 'M' : sex === 'female' ? 'F' : 'U';
}

/**
 * An event with its date and place. With nothing known about it, it is
 * written only when `always` (someone who has died: "1 DEAT Y").
 */
function event(level: number, tag: string, e: LifeEvent | undefined, add: Add, always = false): void {
  const date = e?.date ? gedDate(e.date) : '';
  const place = e?.place?.trim() ?? '';
  if (!date && !place) {
    if (always) add(level, tag, 'Y');
    return;
  }
  add(level, tag);
  eventDetails(level + 1, e, add);
}

function eventDetails(level: number, e: LifeEvent | undefined, add: Add): void {
  const date = e?.date ? gedDate(e.date) : '';
  const place = e?.place?.trim() ?? '';
  if (date) add(level, 'DATE', date);
  if (place) add(level, 'PLAC', place);
}

/** A date as GEDCOM writes it: "ABT 12 MAR 1923", "MAR 1923", "1923", or a phrase in brackets. */
export function gedDate(d: GenDate): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(d.value ?? '');
  if (!m) return d.text?.trim() ? `(${d.text.trim().replace(/[()]/g, '')})` : '';
  const [, y, mo, day] = m;
  const parts = [day ? String(Number(day)) : '', mo ? MONTHS[Number(mo) - 1] : '', y].filter(Boolean).join(' ');
  return d.qualifier ? `${QUALIFIERS[d.qualifier]} ${parts}` : parts;
}

function gedDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The husband and the wife of a family: a man and a woman by their sex, otherwise in the tree's order. */
function spouses(family: Family, doc: TreeDocument): [string | undefined, string | undefined] {
  const [a, b] = family.partners;
  if (!b) {
    const sex = doc.people.find((p) => p.id === a)?.sex;
    return sex === 'female' ? [undefined, a] : [a, undefined];
  }
  const sexOf = (id: string) => doc.people.find((p) => p.id === id)?.sex;
  if (sexOf(a) === 'female' && sexOf(b) !== 'female') return [b, a];
  return [a, b];
}

/**
 * The lines for one value: the first with the tag, further lines of the
 * text as CONT, and long lines carried on in CONC. "@" is doubled, as GEDCOM
 * keeps it for references; references themselves ("@I1@") are left alone.
 */
function valueLines(level: number, tag: string, value: string): string[] {
  if (!value) return [`${level} ${tag}`];
  const isRef = /^@[A-Za-z0-9]+@$/.test(value);
  const text = isRef ? value : value.replace(/@/g, '@@');
  const out: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, i) => {
    const chunks = chunk(line);
    out.push(`${i === 0 ? `${level} ${tag}` : `${level + 1} CONT`}${chunks[0] ? ' ' + chunks[0] : ''}`);
    for (const c of chunks.slice(1)) out.push(`${level + 1} CONC ${c}`);
  });
  return out;
}

/** Cuts a line into pieces short enough for GEDCOM, never next to a space (sites drop spaces at the ends of CONC lines). */
function chunk(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > MAX_VALUE) {
    let at = MAX_VALUE;
    while (at > MAX_VALUE / 2 && (rest[at] === ' ' || rest[at - 1] === ' ')) at--;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  out.push(rest);
  return out;
}
