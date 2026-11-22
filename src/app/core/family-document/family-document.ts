/**
 * The family document: a Word file to print, with a table for each family
 * that sets out its branches (see outline.ts), the youngest indented under
 * their parents, everyone under one number in the whole document.
 */
import { ChildRelation, Sex } from '../model/types';
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
  /** The column saying how someone is the child of the one above: "Relation". */
  relation: string;
  born: string;
  died: string;
  partners: string;
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
/** No., name, relation, born, died, partners. */
const WIDTHS = [650, 2750, 1150, 1350, 1350, DOCX_TEXT_WIDTH - 650 - 2750 - 1150 - 1350 - 1350];
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
      { kind: 'table', widths: WIDTHS, rows: [headRow(words), ...f.rows.map((r) => row(r, words))] },
    );
  });

  return docx(blocks, { title: input.title, language: input.language, footer: input.title, now: input.now });
}

function headRow(words: FamilyDocumentWords): DocxRow {
  return {
    header: true,
    cells: [words.number, words.name, words.relation, words.born, words.died, words.partners].map((text) => ({
      shade: HEAD_FILL,
      paragraphs: [para([{ text, bold: true, color: INK }])],
    })),
  };
}

function row(r: OutlineRow, words: FamilyDocumentWords): DocxRow {
  if (r.kind === 'union') {
    const runs: DocxRun[] = r.partner
      ? [{ text: words.with(r.partner.name), italic: true, color: MUTED }, ...numberRun(r.partner.number, words)]
      : [{ text: words.withUnknown, italic: true, color: MUTED }];
    return { cells: [{ span: WIDTHS.length, paragraphs: [para(runs, WIDTHS[0] + r.level * STEP)] }] };
  }
  const shade = r.level === 0 ? ROOT_FILL : undefined;
  const cell = (paragraphs: DocxParagraph[]): DocxCell => ({ paragraphs, shade });
  // Someone set out elsewhere: their partners are given there.
  const elsewhere = !!r.continuesIn || !!r.repeated;
  return {
    cells: [
      cell([para([{ text: r.number, color: MUTED }])]),
      cell(nameCell(r, words)),
      cell([para([{ text: r.childRelation ? words.child(r.sex, r.childRelation) : '', color: MUTED }])]),
      cell([para([{ text: r.birth }])]),
      cell([para([{ text: r.death }])]),
      cell(elsewhere ? [] : r.partners.map((p) => partnerPara(p, words))),
    ],
  };
}

function nameCell(r: OutlinePerson, words: FamilyDocumentWords): DocxParagraph[] {
  const indent = r.level * STEP;
  const lead: DocxRun[] = r.level ? [{ text: '– ', color: MUTED }] : [];
  const out = [para([...lead, { text: r.name, bold: r.level === 0 || undefined }], indent)];
  // Born into another family, their name at birth is that family's: the family says it.
  const notes = [r.continuesIn ? '' : r.bornAs, r.bornWith, r.continuesIn ? words.continuesIn(r.continuesIn) : '', r.repeated ? words.listedAbove : ''].filter(
    Boolean,
  );
  if (notes.length) out.push(para([{ text: notes.join(', '), italic: true, color: MUTED, size: 8.5 }], indent + (r.level ? STEP : 0)));
  return out;
}

function partnerPara(p: OutlinePartner, words: FamilyDocumentWords): DocxParagraph {
  const runs: DocxRun[] = [{ text: p.name }, ...numberRun(p.number, words)];
  const more = [p.lifespan, p.union].filter(Boolean).join(', ');
  if (more) runs.push({ text: `\n${more}`, color: MUTED, size: 8.5 });
  return para(runs);
}

/** " (No. 23)" after the name of someone set out in the document. */
function numberRun(number: string, words: FamilyDocumentWords): DocxRun[] {
  return number ? [{ text: ` (${words.see(number)})`, color: MUTED, size: 8.5 }] : [];
}

function para(runs: DocxRun[], indent = 0): DocxParagraph {
  return { kind: 'p', runs, indent: indent || undefined };
}
