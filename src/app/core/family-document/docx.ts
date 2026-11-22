/**
 * A Word document (.docx, Office Open XML) of headings, paragraphs and tables:
 * as much of the format as a printable list needs. Word, LibreOffice and
 * Google Docs open it; the person can still edit it before printing.
 */
import { zip } from './zip';

export interface DocxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** In points. */
  size?: number;
  /** "RRGGBB". */
  color?: string;
}

export interface DocxParagraph {
  kind: 'p';
  runs: DocxRun[];
  style?: 'Title' | 'Subtitle' | 'Heading1' | 'Note';
  /** From the left, in twentieths of a point (twips). */
  indent?: number;
  /** Kept on the page with the next paragraph (a heading with its table). */
  keepNext?: boolean;
  /** Starts a new page. */
  pageBreak?: boolean;
}

export interface DocxCell {
  paragraphs: DocxParagraph[];
  /** Background, "RRGGBB". */
  shade?: string;
  /** How many columns the cell takes. */
  span?: number;
}

export interface DocxRow {
  cells: DocxCell[];
  /** Repeated at the top of every page the table runs onto. */
  header?: boolean;
}

export interface DocxTable {
  kind: 'table';
  /** Column widths in twips; together the width of the text on the page. */
  widths: number[];
  rows: DocxRow[];
}

export type DocxBlock = DocxParagraph | DocxTable;

export interface DocxOptions {
  title: string;
  /** BCP 47 tag of the text, for spelling and hyphenation: "cs". */
  language: string;
  /** Text in the footer, before the page number. */
  footer?: string;
  now?: Date;
}

/** A4 with margins of 1.8 cm: what is left for the text, in twips. */
export const DOCX_TEXT_WIDTH = 11906 - 2 * 1021;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** The document's bytes. */
export function docx(blocks: readonly DocxBlock[], options: DocxOptions): Uint8Array<ArrayBuffer> {
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const body = blocks.map(block).join('');
  const sect =
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1021" w:right="1021" w:bottom="1021" w:left="1021" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  return zip(
    [
      {
        name: '[Content_Types].xml',
        data:
          xmlHead() +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
          `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          `</Types>`,
      },
      {
        name: '_rels/.rels',
        data:
          xmlHead() +
          `<Relationships xmlns="${PR}">` +
          `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `<Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/>` +
          `</Relationships>`,
      },
      {
        name: 'docProps/core.xml',
        data:
          xmlHead() +
          `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
          `<dc:title>${esc(options.title)}</dc:title><dc:language>${esc(options.language)}</dc:language>` +
          `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
          `</cp:coreProperties>`,
      },
      {
        name: 'docProps/app.xml',
        data:
          xmlHead() +
          `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Stemma</Application></Properties>`,
      },
      {
        name: 'word/_rels/document.xml.rels',
        data:
          xmlHead() +
          `<Relationships xmlns="${PR}">` +
          `<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>` +
          `<Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/>` +
          `</Relationships>`,
      },
      { name: 'word/styles.xml', data: styles(options.language) },
      {
        name: 'word/footer1.xml',
        data:
          xmlHead() +
          `<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:pStyle w:val="Note"/><w:jc w:val="center"/></w:pPr>` +
          (options.footer ? `<w:r><w:t xml:space="preserve">${esc(options.footer)} · </w:t></w:r>` : '') +
          `<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`,
      },
      { name: 'word/document.xml', data: xmlHead() + `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${sect}</w:body></w:document>` },
    ],
    now,
  );
}

function block(b: DocxBlock): string {
  return b.kind === 'p' ? paragraph(b) : table(b);
}

function paragraph(p: DocxParagraph): string {
  const props =
    (p.style ? `<w:pStyle w:val="${p.style}"/>` : '') +
    (p.keepNext ? '<w:keepNext/>' : '') +
    (p.pageBreak ? '<w:pageBreakBefore/>' : '') +
    (p.indent ? `<w:ind w:left="${Math.round(p.indent)}"/>` : '');
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${p.runs.map(run).join('')}</w:p>`;
}

function run(r: DocxRun): string {
  const props =
    (r.bold ? '<w:b/>' : '') +
    (r.italic ? '<w:i/>' : '') +
    (r.color ? `<w:color w:val="${r.color}"/>` : '') +
    (r.size ? `<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>` : '');
  // Line breaks inside a run become Word's breaks.
  const text = r.text
    .split('\n')
    .map((part) => `<w:t xml:space="preserve">${esc(part)}</w:t>`)
    .join('<w:br/>');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${text}</w:r>`;
}

function table(t: DocxTable): string {
  const width = t.widths.reduce((s, w) => s + w, 0);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFB6A8"/>`;
  const props =
    `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr>`;
  const grid = `<w:tblGrid>${t.widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const rows = t.rows
    .map((row) => {
      let col = 0;
      const cells = row.cells
        .map((c) => {
          const span = Math.max(1, c.span ?? 1);
          const w = t.widths.slice(col, col + span).reduce((s, x) => s + x, 0);
          col += span;
          const cp =
            `<w:tcW w:w="${w}" w:type="dxa"/>` +
            (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
            (c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.shade}"/>` : '');
          // A cell must end with a paragraph, even an empty one.
          const paras = c.paragraphs.length ? c.paragraphs : [{ kind: 'p', runs: [] } as DocxParagraph];
          return `<w:tc><w:tcPr>${cp}</w:tcPr>${paras.map(paragraph).join('')}</w:tc>`;
        })
        .join('');
      // Rows are not split over two pages; the heading row comes again on each page.
      return `<w:tr><w:trPr><w:cantSplit/>${row.header ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`;
    })
    .join('');
  return `<w:tbl>${props}${grid}${rows}</w:tbl>`;
}

function styles(language: string): string {
  const lang = esc(language);
  return (
    xmlHead() +
    `<w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="Cambria" w:cs="Cambria"/>` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${lang}"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="3B2F23"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:i/><w:color w:val="6B5E4E"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="5A3E1B"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:rPr><w:color w:val="6B5E4E"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>` +
    `</w:styles>`
  );
}

function xmlHead(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
}

/** Text for XML, without the control characters XML does not allow. */
function esc(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}
