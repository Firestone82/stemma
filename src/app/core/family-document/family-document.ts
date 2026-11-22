/**
 * The family document: a Word file to print, with a table for each family
 * that sets out its branches (see outline.ts), the youngest indented under
 * their parents.
 */
import { DOCX_TEXT_WIDTH, DocxBlock, DocxCell, DocxParagraph, DocxRow, DocxRun, docx } from './docx';
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
  partners: string;
  /** "12 people in 4 generations". */
  summary(people: number, generations: number): string;
  /** "with Jana Nová". */
  with(partner: string): string;
  /** "with an unknown partner". */
  withUnknown: string;
  /** "carries on the Mikula family". */
  continuesIn(family: string): string;
  /** "listed under 1.2". */
  see(number: string): string;
  /** The heading of the list of families. */
  contents: string;
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
const ROOT_FILL = 'F7F2EA';
/** No., name, born, died, partners. */
const WIDTHS = [850, 3000, 1650, 1650, DOCX_TEXT_WIDTH - 850 - 3000 - 1650 - 1650];
/** Families of no more rows than this share pages. */
const SMALL = 4;
/** Each generation further in, in twips. */
const STEP = 240;

/** The document's bytes (.docx). */
export function familyDocument(input: FamilyDocumentInput): Uint8Array<ArrayBuffer> {
  const { words } = input;
  const blocks: DocxBlock[] = [
    { kind: 'p', style: 'Title', runs: [{ text: input.title }] },
    { kind: 'p', style: 'Subtitle', runs: [{ text: `${words.heading} · ${words.date}` }] },
  ];
  if (input.description?.trim()) blocks.push({ kind: 'p', runs: [{ text: input.description.trim() }] }, { kind: 'p', runs: [] });

  if (input.families.length > 1) {
    blocks.push({ kind: 'p', style: 'Heading1', runs: [{ text: words.contents }] });
    for (const f of input.families) {
      blocks.push({
        kind: 'p',
        runs: [
          { text: f.label, bold: true },
          { text: `  ${words.summary(f.people, f.generations)}`, color: MUTED },
        ],
      });
    }
  }

  for (const f of input.families) {
    blocks.push(
      // A family of a few people follows on; a bigger one starts a page of its own, to be handed round on its own sheets.
      { kind: 'p', style: 'Heading1', runs: [{ text: f.label }], pageBreak: input.families.length > 1 && f.rows.length > SMALL },
      { kind: 'p', style: 'Note', keepNext: true, runs: [{ text: words.summary(f.people, f.generations) }] },
      { kind: 'p', keepNext: true, runs: [] },
      { kind: 'table', widths: WIDTHS, rows: [headRow(words), ...f.rows.map((r) => row(r, words))] },
    );
  }

  return docx(blocks, { title: input.title, language: input.language, footer: input.title, now: input.now });
}

function headRow(words: FamilyDocumentWords): DocxRow {
  return {
    header: true,
    cells: [words.number, words.name, words.born, words.died, words.partners].map((text) => ({
      shade: HEAD_FILL,
      paragraphs: [para([{ text, bold: true, color: INK }])],
    })),
  };
}

function row(r: OutlineRow, words: FamilyDocumentWords): DocxRow {
  if (r.kind === 'union') {
    const text = r.partner ? words.with(r.partner.name) : words.withUnknown;
    return { cells: [{ span: 5, paragraphs: [para([{ text, italic: true, color: MUTED }], 850 + r.level * STEP)] }] };
  }
  const shade = r.level === 0 ? ROOT_FILL : undefined;
  const cell = (paragraphs: DocxParagraph[]): DocxCell => ({ paragraphs, shade });
  return {
    cells: [
      cell([para([{ text: r.number, color: MUTED }])]),
      cell(nameCell(r, words)),
      cell([para([{ text: r.birth }])]),
      cell([para([{ text: r.death }])]),
      cell(r.continuesIn || r.seeNumber ? [] : r.partners.map(partnerPara)),
    ],
  };
}

function nameCell(r: OutlinePerson, words: FamilyDocumentWords): DocxParagraph[] {
  const indent = r.level * STEP;
  const lead: DocxRun[] = r.level ? [{ text: '– ', color: MUTED }] : [];
  const out = [para([...lead, { text: r.name, bold: r.level === 0 || undefined }], indent)];
  // Born into another family, their name at birth is that family's: the family says it.
  const notes = [
    r.continuesIn ? '' : r.bornAs,
    r.bornWith,
    r.continuesIn ? words.continuesIn(r.continuesIn) : '',
    r.seeNumber ? words.see(r.seeNumber) : '',
  ].filter(Boolean);
  if (notes.length) out.push(para([{ text: notes.join(', '), italic: true, color: MUTED, size: 8.5 }], indent + (r.level ? STEP : 0)));
  return out;
}

function partnerPara(p: OutlinePartner): DocxParagraph {
  const runs: DocxRun[] = [{ text: p.name }];
  const more = [p.lifespan, p.union].filter(Boolean).join(', ');
  if (more) runs.push({ text: `\n${more}`, color: MUTED, size: 8.5 });
  return para(runs);
}

function para(runs: DocxRun[], indent = 0): DocxParagraph {
  return { kind: 'p', runs, indent: indent || undefined };
}
