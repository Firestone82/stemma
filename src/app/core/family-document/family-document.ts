/**
 * The family document: a Word file to print, with a table for each family
 * that sets out its branches (see outline.ts), the youngest indented under
 * their parents with how they are their child, their partners under them,
<<<<<<< HEAD
 * each generation in a colour of its own, everyone under one number in the whole
=======
 * each branch in a colour of its own, everyone under one number in the whole
>>>>>>> 56d24cf3cbebd0db0b066117b9b03f4794cc1a38
 * document.
 */
import { ChildRelation, Sex } from '../model/types';
import { DOCX_TEXT_WIDTH, DocxBlock, DocxCell, DocxParagraph, DocxRow, DocxRun, docx, estimatePages } from './docx';
import { OutlineFamily, OutlinePartner, OutlinePerson, OutlineRow } from './outline';

/** The words of the document, in its language. */
export interface FamilyDocumentWords {
  /** "Families and their branches". */
  heading: string;
  /** The day it was made: "22 November 2026". */
  date: string;
  number: string;
  name: string;
  born: string;
  died: string;
  /** "son", "adopted daughter". */
  child(sex: Sex, relation: ChildRelation): string;
  /** "12 people in 4 generations". */
  summary(people: number, generations: number): string;
  /** "Children with Jana Nová". */
  with(partner: string): string;
  /** "Children with an unknown partner". */
  withUnknown: string;
  /** "continues in the Mikula family". */
  continuesIn(family: string): string;
  /** "listed above". */
  listedAbove: string;
  /** "No. 23", where someone is set out. */
  see(number: string): string;
  /** The heading of the list of families. */
  contents: string;
  /** What the shortcuts and symbols mean, at the start. */
  legend: { heading: string; entries: readonly LegendEntry[] };
}

/** "s", "son"; with `colours`, the meaning of the branches' colours. */
export interface LegendEntry {
  symbol: string;
  meaning: string;
  colours?: boolean;
}

export interface FamilyDocumentInput {
  title: string;
  description?: string;
  families: readonly OutlineFamily[];
  words: FamilyDocumentWords;
  language: string;
  now?: Date;
}

const INK = '3B2F23';
const MUTED = '6B5E4E';
const HEAD_FILL = 'EDE4D3';
/**
<<<<<<< HEAD
 * The generations under the oldest of a family, each in a colour of its own: children, grandchildren,
 * great-grandchildren and on, the colours coming round again. A family of parents and children only has none.
 */
const GENERATIONS: readonly string[] = ['EADCC3', 'D6E6DA', 'D8E2EF', 'ECD9D9', 'E4DDF0'];
=======
 * The branches under the oldest of a family, each in a colour of its own, in turn: the shades from the
 * children down to the great-grandchildren and further, lighter the further down.
 */
const BANDS: readonly (readonly string[])[] = [
  ['EADCC3', 'F3EADA', 'F9F4EC'],
  ['D6E6DA', 'E5EFE7', 'F1F7F2'],
  ['D8E2EF', 'E6EDF5', 'F2F5FA'],
  ['ECD9D9', 'F4E7E7', 'F9F2F2'],
];
>>>>>>> 56d24cf3cbebd0db0b066117b9b03f4794cc1a38
/** No., name (with how they are a child, and their partners under it), born, died. */
const WIDTHS = [650, DOCX_TEXT_WIDTH - 650 - 1500 - 1500, 1500, 1500];
/** Families of no more rows than this share pages. */
const SMALL = 4;
/** Each generation further in, in twips. */
const STEP = 280;

/** The document's bytes (.docx). */
export function familyDocument(input: FamilyDocumentInput): Uint8Array<ArrayBuffer> {
  const { words } = input;
  const blocks: DocxBlock[] = [
    { kind: 'p', style: 'Title', runs: [{ text: input.title }] },
    { kind: 'p', style: 'Subtitle', runs: [{ text: `${words.heading} · ${words.date}` }] },
  ];
  if (input.description?.trim()) blocks.push({ kind: 'p', runs: [{ text: input.description.trim() }] }, { kind: 'p', runs: [] });

  blocks.push({ kind: 'p', style: 'Heading1', runs: [{ text: words.legend.heading }] }, legendTable(words.legend.entries));

  const several = input.families.length > 1;
  const mark = (i: number) => `family-${i + 1}`;
  if (several) {
    // A table of contents: each family, dots, the page it starts on.
    blocks.push({ kind: 'p', style: 'Heading1', runs: [{ text: words.contents }] });
    input.families.forEach((f, i) =>
      blocks.push({
        kind: 'p',
        style: 'Contents',
        dotsToRight: true,
        runs: [
          { text: f.label, bold: true },
          { text: `  ${words.summary(f.people, f.generations)}`, color: MUTED },
          { text: '', tab: true },
          { text: '?', field: ` PAGEREF ${mark(i)} \\h ` },
        ],
      }),
    );
  }

  input.families.forEach((f, i) => {
    blocks.push(
      // A family of a few people follows on; a bigger one starts a page of its own, to be handed round on its own sheets.
      { kind: 'p', style: 'Heading1', runs: [{ text: f.label }], bookmark: mark(i), pageBreak: several && (i === 0 || f.rows.length > SMALL) },
      { kind: 'p', style: 'Note', keepNext: true, runs: [{ text: words.summary(f.people, f.generations) }] },
      { kind: 'p', keepNext: true, runs: [] },
      { kind: 'table', widths: WIDTHS, rows: [headRow(words), ...rows(f.rows, words)] },
    );
  });

  // The pages in the contents as they will come out; Word puts in its own when it opens the document.
  const pages = estimatePages(blocks);
  for (const b of blocks) {
    if (b.kind !== 'p') continue;
    for (const r of b.runs) {
      const at = r.field && /PAGEREF (\S+)/.exec(r.field);
      if (at) r.text = String(pages.get(at[1]) ?? '');
    }
  }
  return docx(blocks, { title: input.title, language: input.language, footer: input.title, now: input.now });
}

function legendTable(entries: readonly LegendEntry[]): DocxBlock {
  return {
    kind: 'table',
    widths: [1300, DOCX_TEXT_WIDTH - 1300],
    rows: entries.map((e) => ({
      cells: [
        // The colours stand for themselves: the first branch's.
<<<<<<< HEAD
        {
          shade: e.colours ? GENERATIONS[0] : undefined,
          paragraphs: [para([{ text: e.symbol, bold: !e.colours || undefined, color: e.colours ? MUTED : INK }])],
        },
=======
        { shade: e.colours ? BANDS[0][0] : undefined, paragraphs: [para([{ text: e.symbol, bold: !e.colours || undefined, color: e.colours ? MUTED : INK }])] },
>>>>>>> 56d24cf3cbebd0db0b066117b9b03f4794cc1a38
        { paragraphs: [para([{ text: e.meaning }])] },
      ],
    })),
  };
}

function headRow(words: FamilyDocumentWords): DocxRow {
  return {
    header: true,
    cells: [words.number, words.name, words.born, words.died].map((text) => ({
      shade: HEAD_FILL,
      paragraphs: [para([{ text, bold: true, color: INK }])],
    })),
  };
}

<<<<<<< HEAD
/** The table's rows: where it goes down more than one generation, each generation in its own colour. */
function rows(outline: readonly OutlineRow[], words: FamilyDocumentWords): DocxRow[] {
  const nested = outline.some((r) => r.level > 1);
  return outline.map((r) => row(r, words, nested && r.level > 0 ? GENERATIONS[(r.level - 1) % GENERATIONS.length] : undefined));
=======
/** The table's rows: each branch under the oldest in its own colour, the deeper the lighter. */
function rows(outline: readonly OutlineRow[], words: FamilyDocumentWords): DocxRow[] {
  let band = -1;
  return outline.map((r) => {
    if (r.level === 0) band = -1;
    else if (r.level === 1 && r.kind === 'person') band++;
    const shade = r.level > 0 && band >= 0 ? BANDS[band % BANDS.length][Math.min(r.level, 3) - 1] : undefined;
    return row(r, words, shade);
  });
>>>>>>> 56d24cf3cbebd0db0b066117b9b03f4794cc1a38
}

function row(r: OutlineRow, words: FamilyDocumentWords, shade: string | undefined): DocxRow {
  if (r.kind === 'union') {
    const runs: DocxRun[] = r.partner
      ? [{ text: words.with(r.partner.name), italic: true, color: MUTED }, ...numberRun(r.partner.number, words)]
      : [{ text: words.withUnknown, italic: true, color: MUTED }];
    return { cells: [{ span: WIDTHS.length, shade, paragraphs: [para(runs, WIDTHS[0] + r.level * STEP)] }] };
  }
  const cell = (paragraphs: DocxParagraph[]): DocxCell => ({ paragraphs, shade });
  return {
<<<<<<< HEAD
    cells: [
      cell([para([{ text: r.number, color: MUTED }])]),
      cell(nameCell(r, words)),
      cell([para([{ text: yearBelow(r.birth) }])]),
      cell([para([{ text: yearBelow(r.death) }])]),
    ],
=======
    cells: [cell([para([{ text: r.number, color: MUTED }])]), cell(nameCell(r, words)), cell([para([{ text: r.birth }])]), cell([para([{ text: r.death }])])],
>>>>>>> 56d24cf3cbebd0db0b066117b9b03f4794cc1a38
  };
}

/** "son  Petr Novák", the notes on him, and under them his partners. */
function nameCell(r: OutlinePerson, words: FamilyDocumentWords): DocxParagraph[] {
  const indent = r.level * STEP;
  const lead: DocxRun[] = r.childRelation ? [{ text: `${words.child(r.sex, r.childRelation)}  `, italic: true, color: MUTED, size: 8.5 }] : [];
  // The name at birth beside the name ("Claire Ferri née Ashworth"); born into another family, it is that family's, which the family says.
  const born: DocxRun[] = r.bornAs && !r.continuesIn ? [{ text: `  ${r.bornAs}`, italic: true, color: MUTED, size: 8.5 }] : [];
  const out = [para([...lead, { text: r.name, bold: r.level === 0 || undefined }, ...born], indent)];
  const notes = [r.bornWith, r.continuesIn ? words.continuesIn(r.continuesIn) : '', r.repeated ? words.listedAbove : ''].filter(Boolean);
  if (notes.length) out.push(para([{ text: notes.join(', '), italic: true, color: MUTED, size: 8.5 }], indent));
  // Someone set out elsewhere has their partners given there.
  if (!r.continuesIn && !r.repeated) for (const p of r.partners) out.push(partnerPara(p, words, indent));
  return out;
}

/** "∞ Jana Nová (No. 23)  1920 – 1990, married". */
function partnerPara(p: OutlinePartner, words: FamilyDocumentWords, indent: number): DocxParagraph {
  const runs: DocxRun[] = [{ text: '∞ ', color: MUTED }, { text: p.name }, ...numberRun(p.number, words)];
  const more = [p.lifespan, p.union].filter(Boolean).join(', ');
  if (more) runs.push({ text: `  ${more}`, color: MUTED, size: 8.5 });
  return para(runs, indent);
}

/** " (No. 23)" after the name of someone set out in the document. */
function numberRun(number: string, words: FamilyDocumentWords): DocxRun[] {
  return number ? [{ text: ` (${words.see(number)})`, color: MUTED, size: 8.5 }] : [];
}

/** "5. července" over "1954": the year on a line of its own. */
function yearBelow(date: string): string {
  return date.replace(/\s+(\S*\d{3,4}\S*)$/, '\n$1');
}

function para(runs: DocxRun[], indent = 0): DocxParagraph {
  return { kind: 'p', runs, indent: indent || undefined };
}
