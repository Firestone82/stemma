import { TileGrid, tileName } from './tiles';

/**
 * A one-page PDF holding a JPEG image the size of the page. Small and enough
 * for printing a poster at home or in a copy shop; the SVG export is there for
 * anything that needs vector lines.
 */
export function pdfFromJpeg(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number, pageWidthPt: number, pageHeightPt: number, title = ''): Blob {
  const W = num(pageWidthPt);
  const H = num(pageHeightPt);
  return pdfPages(jpeg, pixelWidth, pixelHeight, [{ w: pageWidthPt, h: pageHeightPt, content: `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q` }], title);
}

/** A page of a PDF: its size in points and what is drawn on it (with /Im0 the image, /F1 Helvetica). */
export interface PdfPage {
  w: number;
  h: number;
  content: string;
}

/**
 * A PDF of several pages sharing one JPEG image (/Im0), which each page draws
 * as much of as it wants; text in Helvetica (/F1), in plain ASCII.
 */
export function pdfPages(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number, pages: readonly PdfPage[], title = ''): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | (string | Uint8Array)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const p of Array.isArray(body) ? body : [body]) push(p);
    push('\nendobj\n');
  };

  // 1 catalog, 2 pages, 3 image, 4 font, 5 info, then a page and its contents for each page.
  const pageId = (i: number) => 6 + i * 2;
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, [
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    '\nendstream',
  ]);
  object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  object(5, `<< /Title ${pdfText(title)} /Producer (Stemma) /Creator (Stemma) >>`);
  pages.forEach((page, i) => {
    object(
      pageId(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.w)} ${num(page.h)}] /Resources << /XObject << /Im0 3 0 R >> /Font << /F1 4 0 R >> /ProcSet [/PDF /Text /ImageC] >> /Contents ${pageId(i) + 1} 0 R >>`,
    );
    object(pageId(i) + 1, `<< /Length ${enc.encode(page.content).length} >>\nstream\n${page.content}\nendstream`);
  });

  const count = 6 + pages.length * 2;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/**
 * The pages for a poster printed on several sheets (see tileGrid): each shows
 * its part of the poster, drawn at the grid's scale inside the margin, with
 * corner marks, a dashed line where the next sheet's part begins (trim one
 * sheet there and glue it over the other) named after that sheet, and its own
 * name in the corner. Printing to the edge, the parts fill the sheets, with no
 * corner marks, and the names are written in the shared strip.
 */
export function tilePages(grid: TileGrid, posterWmm: number, posterHmm: number): PdfPage[] {
  const pt = (mm: number) => (mm * 72) / 25.4;
  const k = grid.scale;
  const W = pt(grid.sheetW);
  const H = pt(grid.sheetH);
  const m = pt(grid.margin);
  const total = grid.tiles.length;
  return grid.tiles.map((tile, i) => {
    const vw = pt(tile.w * k);
    const vh = pt(tile.h * k);
    // The poster drawn at the grid's scale, moved so that this sheet's part of it starts at the margin.
    const tx = m - pt(tile.x * k);
    const ty = H - m - pt(posterHmm * k) + pt(tile.y * k);
    const top = H - m;
    const ops: string[] = [];
    ops.push(
      `q ${num(m)} ${num(top - vh)} ${num(vw)} ${num(vh)} re W n ${num(pt(posterWmm * k))} 0 0 ${num(pt(posterHmm * k))} ${num(tx)} ${num(ty)} cm /Im0 Do Q`,
    );
    const right = grid.tiles.find((t) => t.row === tile.row && t.col === tile.col + 1);
    const below = grid.tiles.find((t) => t.col === tile.col && t.row === tile.row + 1);
    const label = (x: number, y: number, s: string) => `BT /F1 6.5 Tf 0.35 g ${num(x)} ${num(y)} Td (${s}) Tj ET`;
    // Printing to the edge there is no margin to write in: names go on a small white patch in the shared strip.
    const patch = (x: number, y: number, s: string) =>
      `q 1 g ${num(x - pt(0.6))} ${num(y - pt(0.8))} ${num(pt(1.2) + s.length * 3.6)} ${num(pt(3.4))} re f Q ` + label(x, y, s);
    const edge = grid.margin === 0;
    if (!edge) {
      // Corner marks, out in the margin.
      const tick = pt(Math.min(3.5, grid.margin - 1.2));
      const gap = pt(0.8);
      ops.push('q 0.35 w 0.45 G');
      for (const [x, y, dx, dy] of [
        [m, top, -1, 1],
        [m + vw, top, 1, 1],
        [m, top - vh, -1, -1],
        [m + vw, top - vh, 1, -1],
      ] as const) {
        ops.push(`${num(x + dx * gap)} ${num(y)} m ${num(x + dx * (gap + tick))} ${num(y)} l S`);
        ops.push(`${num(x)} ${num(y + dy * gap)} m ${num(x)} ${num(y + dy * (gap + tick))} l S`);
      }
      ops.push('Q');
    }
    // Where the neighbours' parts begin: trim there, glue over.
    if (right) {
      const x = m + pt((right.x - tile.x) * k);
      ops.push(`q 0.5 w 0.35 G [3 2] 0 d ${num(x)} ${num(top)} m ${num(x)} ${num(top - vh)} l S Q`);
      ops.push(edge ? patch(x + pt(1.2), top - pt(4), `${tileName(right)} >`) : label(x + pt(0.8), top + pt(1.4), `${tileName(right)} >`));
    }
    if (below) {
      const y = top - pt((below.y - tile.y) * k);
      ops.push(`q 0.5 w 0.35 G [3 2] 0 d ${num(m)} ${num(y)} m ${num(m + vw)} ${num(y)} l S Q`);
      ops.push(edge ? patch(m + pt(2), y - pt(4), tileName(below)) : label(pt(0.6), y - pt(2.4), tileName(below)));
    }
    const name = `${tileName(tile)}   ${i + 1}/${total}`;
    ops.push(edge ? patch(m + pt(2), top - pt(4), name) : label(m, top + pt(1.4), name));
    return { w: W, h: H, content: ops.join('\n') };
  });
}

function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** A PDF text string in UTF-16BE, so titles in any language survive. */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += cp.toString(16).padStart(4, '0');
    }
  }
  return `<${hex.toUpperCase()}>`;
}
