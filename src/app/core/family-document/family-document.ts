/**
 * The family document: a Word file to print, with a table for each family
 * that sets out its branches (see outline.ts), the youngest indented under
 * their parents with how they are their child, their partners under them,
 * each generation in a colour of its own, everyone under one number in the whole
 * document.
 */
import { ChildRelation, Sex } from '../model/types';
import { DOCX_PAGE_HEIGHT, DOCX_TEXT_WIDTH, DocxBlock, DocxCell, DocxParagraph, DocxRow, DocxRun, blocksHeight, docx, estimatePages } from './docx';
import { OutlineFamily, OutlinePartner, OutlinePerson, OutlineRow, numberOutline } from './outline';

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
 * The generations under the oldest of a family, each in a colour of its own: children, grandchildren,
 * great-grandchildren and on, the colours coming round again. A family of parents and children only has none.
 * Printed in grey, each is a different grey from the ones next to it (light, darker, lighter, darkest).
 */
const GENERATIONS: readonly string[] = ['F2EADD', 'BBD6C3', 'D5E0EB', 'D6B2B2'];
/** No., name (with how they are a child, and their partners under it), born, died. */
const WIDTHS = [650, DOCX_TEXT_WIDTH - 650 - 1500 - 1500, 1500, 1500];
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

  // The biggest families first, the smaller ones filling the pages after them (see arrange); numbered in that order.
  const families = numberOutline(arrange(input.families, words));
  const several = families.length > 1;
  const mark = (i: number) => `family-${i + 1}`;
  if (several) {
    // A table of contents: each family, dots, the page it starts on.
    blocks.push({ kind: 'p', style: 'Heading1', runs: [{ text: words.contents }] });
    families.forEach((f, i) =>
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

  // The families from a new page after the contents, one after another.
  families.forEach((f, i) => blocks.push(...familyBlocks(f, words, mark(i), several && i === 0)));

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

/** A family's heading, the line under it and its table; a table that fits on a page is kept on one. */
function familyBlocks(f: OutlineFamily, words: FamilyDocumentWords, bookmark?: string, pageBreak = false): DocxBlock[] {
  const table: DocxBlock = { kind: 'table', widths: WIDTHS, rows: [headRow(words), ...rows(f.rows, words)] };
  const blocks: DocxBlock[] = [
    { kind: 'p', style: 'Heading1', runs: [{ text: f.label }], bookmark, pageBreak },
    { kind: 'p', style: 'Note', keepNext: true, runs: [{ text: words.summary(f.people, f.generations) }] },
    { kind: 'p', keepNext: true, runs: [] },
    table,
  ];
  table.keepTogether = blocksHeight(blocks) <= DOCX_PAGE_HEIGHT;
  return blocks;
}

/**
 * The order the families are printed in: the biggest first, and after each, the biggest that still fits
 * in what is left of the page, so pages are not left half empty. A family longer than a page goes on from
 * wherever the one before it ends.
 */
function arrange(families: readonly OutlineFamily[], words: FamilyDocumentWords): OutlineFamily[] {
  const left = families.map((f) => ({ f, h: blocksHeight(familyBlocks(f, words)) })).sort((a, b) => b.h - a.h || a.f.label.localeCompare(b.f.label));
  const out: OutlineFamily[] = [];
  let used = 0;
  while (left.length) {
    const room = DOCX_PAGE_HEIGHT - used;
    let at = left.findIndex((x) => x.h <= room);
    // Nothing fits: a family longer than a page starts here all the same; otherwise a new page.
    if (at < 0 && (used === 0 || left[0].h > DOCX_PAGE_HEIGHT)) at = 0;
    if (at < 0) {
      used = 0;
      continue;
    }
    const [next] = left.splice(at, 1);
    out.push(next.f);
    used = next.h > room ? (used + next.h) % DOCX_PAGE_HEIGHT : used + next.h;
  }
  return out;
}

function legendTable(entries: readonly LegendEntry[]): DocxBlock {
  return {
    kind: 'table',
    widths: [1300, DOCX_TEXT_WIDTH - 1300],
    rows: entries.map((e) => ({
      cells: [
        // The colours stand for themselves: the first branch's.
        {
          shade: e.colours ? GENERATIONS[0] : undefined,
          paragraphs: [para([{ text: e.symbol, bold: !e.colours || undefined, color: e.colours ? MUTED : INK }])],
        },
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

/** The table's rows: where it goes down more than one generation, each generation in its own colour. */
function rows(outline: readonly OutlineRow[], words: FamilyDocumentWords): DocxRow[] {
  const nested = outline.some((r) => r.level > 1);
  return outline.map((r) => row(r, words, nested && r.level > 0 ? GENERATIONS[(r.level - 1) % GENERATIONS.length] : undefined));
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
    cells: [
      cell([para([{ text: r.number, color: MUTED }])]),
      cell(nameCell(r, words)),
      cell([para([{ text: yearBelow(r.birth) }])]),
      cell([para([{ text: yearBelow(r.death) }])]),
    ],
  };
}

/** "son  Petr Novák", the notes on him, and under them his partners. */
function nameCell(r: OutlinePerson, words: FamilyDocumentWords): DocxParagraph[] {
  const indent = r.level * STEP;
  const lead: DocxRun[] = r.childRelation ? [{ text: `${words.child(r.sex, r.childRelation)}  `, italic: true, color: MUTED, size: 8.5 }] : [];
  // The name at birth beside the name ("Claire Ferri née Ashworth"); born into another family, it is that family's, which the family says.
  const born: DocxRun[] = r.bornAs && !r.continuesIn ? [{ text: `  ${r.bornAs}`, italic: true, color: MUTED, size: 8.5 }] : [];
  const out = [para([...lead, { text: r.name, bold: r.level === 0 || undefined }, ...born], indent)];
  const notes = r.continuesIn ? [words.continuesIn(r.continuesIn)] : [];
  if (notes.length) out.push(para([{ text: notes.join(', '), italic: true, color: MUTED, size: 8.5 }], indent));
  // Someone set out elsewhere has their partners given there.
  if (!r.continuesIn) for (const p of r.partners) out.push(partnerPara(p, words, indent));
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
