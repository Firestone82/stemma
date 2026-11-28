import { sampleDocument } from '../model/sample';
import { DEFAULT_PRINT, PrintSettings, TreeDocument } from '../model/types';
import { DocBuilder, pedigree, randomFamily } from '../testing/fixtures';
import { PX_PER_MM } from './paper';
import { PosterInput, gapsFor, posterSteps, renderPoster } from './poster';

/** A measurer that is good enough without a browser: every letter about half its size wide. */
const measure = (t: string, font: string) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
  return t.length * size * 0.5;
};

function render(doc: TreeDocument, settings: Partial<PrintSettings> = {}, more: Partial<PosterInput> = {}) {
  return renderPoster({ doc, settings: { ...DEFAULT_PRINT, ...settings }, measure, now: new Date('2026-01-01T00:00:00Z'), ...more });
}

const cardsIn = (svg: string) => [...svg.matchAll(/<g class="card" data-person="([^"]+)"/g)].map((m) => m[1]);

describe('the printed page', () => {
  it('draws everyone once on the paper asked for, in the Heritage style', () => {
    const doc = sampleDocument();
    const p = render(doc, { paper: 'A3', orientation: 'landscape' });
    expect(p.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm"')).toBe(true);
    expect(p.paper).toEqual({ widthMm: 420, heightMm: 297, landscape: true });
    expect(p.width).toBeCloseTo(420 * PX_PER_MM);
    expect(cardsIn(p.svg).sort()).toEqual(doc.people.map((x) => x.id).sort());
    expect(p.people).toBe(29);
    expect(p.total).toBe(29);
    expect(p.generations).toBe(5);
    expect(p.centerId).toBe('I11');
    expect(p.partnerId).toBe('I15');
    // The title, the frame and the families' names.
    expect(p.svg).toContain('The Ashworth family');
    expect(p.svg).toContain('Ashworth</text>');
    expect(p.text).toContain('Simon');
  });

  it('has only lines between the cards: no branches, leaves or picture behind the tree', () => {
    const p = render(sampleDocument());
    expect(p.svg).not.toMatch(/<image|leaf|branch|canopy/);
  });

  it('adds decorations behind the chart without changing the layout', () => {
    const doc = sampleDocument();
    const page = { paper: 'A3', orientation: 'landscape' } as const;
    const plain = render(doc, page);
    const decorated = render(doc, { ...page, showDecorations: true });
    expect(plain.svg).not.toContain('pp-decoration');
    expect(decorated.svg).toContain('data-decoration="edge-branch"');
    expect(decorated.svg).toContain('data-decoration="footer-branch"');
    expect(decorated.svg.indexOf('pp-decoration')).toBeLessThan(decorated.svg.indexOf('data-person'));
    const parser = new DOMParser();
    const embellishments = parser.parseFromString(decorated.svg, 'image/svg+xml');
    const artwork = [...embellishments.querySelectorAll('.pp-decoration')];
    expect(artwork.every((group) => group.getAttribute('fill') === 'none' && !group.querySelector('[fill]'))).toBe(true);
    embellishments.querySelectorAll('.pp-decoration').forEach((group) => group.remove());
    expect(embellishments.documentElement.isEqualNode(parser.parseFromString(plain.svg, 'image/svg+xml').documentElement)).toBe(true);
  });

  it('picks the orientation that gives the bigger cards, and fills the sheet better than the tree as it comes', () => {
    const doc = randomFamily(7, 40);
    const best = render(doc, { paper: 'A3', orientation: 'auto' });
    const land = render(doc, { paper: 'A3', orientation: 'landscape' });
    const port = render(doc, { paper: 'A3', orientation: 'portrait' });
    expect(best.cardMm.w).toBeGreaterThanOrEqual(Math.max(land.cardMm.w, port.cardMm.w) * 0.98);
    expect(best.coverage).toBeGreaterThan(0.12);
  });

  it('prints bigger cards on bigger paper, from A4 to A1', () => {
    const doc = randomFamily(3, 40);
    const widths = ['A4', 'A3', 'A2', 'A1'].map((paper) => render(doc, { paper, orientation: 'landscape' }).cardMm.w);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1] * 1.25);
  });

  it('keeps everything inside the page', () => {
    for (const doc of [sampleDocument(), pedigree(5), randomFamily(5, 50)]) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        const p = render(doc, { paper: 'A4', orientation });
        const m = /<g transform="translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)">/.exec(p.svg)!;
        const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
        for (const c of p.svg.matchAll(/<g class="card" data-person="[^"]+" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)) {
          const x = tx + Number(c[1]) * s;
          const y = ty + Number(c[2]) * s;
          expect(x).toBeGreaterThan(0);
          expect(y).toBeGreaterThan(0);
          expect(x + 188 * s).toBeLessThan(p.width);
          expect(y + 40 * s).toBeLessThan(p.height);
        }
      }
    }
  });

  it('shows on the cards what the settings say', () => {
    const doc = sampleDocument();
    const all = render(doc).svg;
    // Shields with initials, the surname at birth, years, the sex as an accent, ribbons.
    expect(all).toContain('>SA</text>');
    expect(all).toContain('née Nováková');
    expect(all).toContain('1898 – 1971');
    const none = render(doc, { showEmblems: false, showBirthNames: false, dates: 'none', sexColors: false, showRibbons: false }).svg;
    expect(none).not.toContain('>SA</text>');
    expect(none).not.toContain('née Nováková');
    expect(none).not.toContain('1898 – 1971');
    expect(none.length).toBeLessThan(all.length);
    // Cards without lines are lower, so they come out bigger on the same paper.
    expect(render(doc, { dates: 'none', showBirthNames: false, paper: 'A3', orientation: 'portrait' }).namePt).toBeGreaterThanOrEqual(
      // About as big at the least: among pages about as good the fuller one is taken.
      render(doc, { paper: 'A3', orientation: 'portrait' }).namePt * 0.98,
    );
  });

  it('frames the couple the page is drawn around as one, a little away from their cards, with no colour on the cards themselves', () => {
    const p = render(sampleDocument(), { paper: 'A3', orientation: 'landscape' });
    const frames = [...p.svg.matchAll(/<rect class="focus-frame" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) =>
      m.slice(1).map(Number),
    );
    expect(frames).toHaveLength(1);
    const card = (id: string) => {
      const m = new RegExp(`<g class="card" data-person="${id}" transform="translate\\(([-\\d.]+),([-\\d.]+)\\)"`).exec(p.svg)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const [x, y, w, h] = frames[0];
    const [a, b] = [card('I11'), card('I15')].sort((u, v) => u.x - v.x);
    // Round both, the same few units from each side of them.
    expect(a.x - x).toBeCloseTo(8, 1);
    expect(y).toBeCloseTo(a.y - 8, 1);
    expect(x + w - (b.x + p.cardUnits.w)).toBeCloseTo(8, 1);
    expect(h).toBeCloseTo(p.cardUnits.h + 16, 1);
    expect(p.svg).not.toContain('focus-ring');
    // The layout keeps room round them for it: no other card reaches into the frame.
    const others = [...p.svg.matchAll(/<g class="card" data-person="([^"]+)" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)]
      .filter((m) => m[1] !== 'I11' && m[1] !== 'I15')
      .map((m) => ({ x: Number(m[2]), y: Number(m[3]) }));
    const inside = others.filter((o) => o.x < x + w && o.x + p.cardUnits.w > x && o.y < y + h && o.y + p.cardUnits.h > y);
    expect(inside).toEqual([]);
    // The lines from their parents run through the frame onto their cards.
    for (const child of ['I11', 'I15']) {
      const d = new RegExp(`d="([^"]+)"[^>]*data-child="${child}"`).exec(p.svg)?.[1] ?? '';
      expect(d).not.toBe('');
      const last = Number(/(-?[\d.]+)$/.exec(d)![1]);
      expect(last).toBeCloseTo(card(child).y, 1);
      expect(last).toBeGreaterThan(y + 1);
    }
    // The crown on the frame stands clear of where the lines come in.
    const crown = /<path d="M([-\d.]+),[-\d.]+L[-\d.]+,[-\d.]+L[-\d.]+,[-\d.]+L([-\d.]+),/.exec(p.svg.slice(p.svg.indexOf('focus-frame')))!;
    const crownX = Number(crown[2]);
    for (const l of p.lines.filter((l) => l.childId === 'I11' || l.childId === 'I15'))
      expect(Math.abs(l.points[l.points.length - 1].x - crownX)).toBeGreaterThan(12);
  });

  it('draws the lines heavier and the marks between partners bigger when asked', () => {
    const doc = sampleDocument();
    const widths = (svg: string) =>
      [...svg.matchAll(/data-family="[^"]+"/g)].length && [...svg.matchAll(/stroke-width="([\d.]+)"[^>]*data-family/g)].map((m) => Number(m[1]));
    const plain = render(doc, { paper: 'A3' });
    const strong = render(doc, { paper: 'A3', strongLines: true });
    const thin = (svg: string) => Math.min(...(widths(svg) || [0]));
    expect(thin(strong.svg)).toBeCloseTo(thin(plain.svg) * 1.7, 2);
    // The marks need more room between partners: the gap between a couple's cards is wider.
    const gap = (r: typeof plain) => {
      const at = (id: string) => Number(new RegExp(`data-person="${id}" transform="translate\\(([-\\d.]+),`).exec(r.svg)![1]);
      return Math.abs(at('I15') - at('I11')) - r.cardUnits.w;
    };
    expect(gap(strong)).toBeGreaterThanOrEqual(43);
    expect(gap(plain)).toBeLessThan(35);
    const plate = (svg: string) => Number(/<rect x="-([\d.]+)" y="-[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#eee1c3"\/>/.exec(svg)?.[1]);
    expect(plate(strong.svg)).toBeGreaterThan(plate(plain.svg) * 1.2);
  });

  it('writes dates in full where asked', () => {
    const doc = sampleDocument();
    const full = /1898-03-14|14\. 3\. 1898|14 March 1898|14 Mar 1898/;
    // With letters narrow enough for the long dates to fit the card.
    const narrow = (t: string, font: string) => measure(t, font) * 0.6;
    expect(render(doc, { dates: 'full' }, { measure: narrow }).svg).toMatch(full);
    expect(render(doc, { dates: 'years' }, { measure: narrow }).svg).not.toMatch(full);
    // Where they do not fit, the years.
    expect(render(doc, { dates: 'full' }, { measure: (t, f) => measure(t, f) * 3 }).svg).not.toMatch(full);
  });

  it('never puts the badge for a mistake on paper', () => {
    const doc = sampleDocument();
    // Simon, born after he died: a mistake the chart marks.
    doc.people.find((p) => p.id === 'I11')!.death = { date: { value: '1900' } };
    expect(render(doc).svg).not.toMatch(/<circle r="7.5"/);
  });

  it('packs the families tightly when asked: the cards come out bigger', () => {
    const doc = sampleDocument();
    const plain = render(doc, { paper: 'A3', orientation: 'landscape' });
    const tight = render(doc, { paper: 'A3', orientation: 'landscape', tight: true });
    expect(tight.cardMm.w).toBeGreaterThan(plain.cardMm.w);
  });

  it('says how each couple stands in a word, when asked', () => {
    const doc = sampleDocument();
    expect(render(doc).svg).not.toMatch(/>married</);
    const svg = render(doc, { unionText: true }).svg;
    expect(svg).toMatch(/>married</);
    expect(svg).toMatch(/>divorced</);
  });

  it('puts the title where it was moved by hand, and gives the tree the room it took', () => {
    const doc = sampleDocument();
    const plain = render(doc, { paper: 'A3', orientation: 'landscape' });
    expect(plain.title).toMatchObject({ free: false });
    expect(plain.title!.x + plain.title!.w / 2).toBeCloseTo(0.5, 2);
    const moved = render(doc, { paper: 'A3', orientation: 'landscape', titleAt: { x: 0.25, y: 0.85 } });
    expect(moved.title).toMatchObject({ free: true });
    expect(moved.title!.x + moved.title!.w / 2).toBeCloseTo(0.25, 2);
    expect(moved.title!.y).toBeCloseTo(0.85, 2);
    // The tree keeps clear of the title wherever it is: about as big either way.
    expect(moved.cardMm.w).toBeGreaterThan(plain.cardMm.w * 0.97);
    // The page inside its margin, for lining the title and the names up.
    expect(moved.inner.x).toBeGreaterThan(0);
    expect(moved.inner.x * 2 + moved.inner.w).toBeCloseTo(1, 6);
  });

  it('keeps the tree out of the title’s and the names’ boxes instead of giving each a strip of the page', () => {
    const doc = sampleDocument();
    // With the title in the middle or moved to a corner, the tree has the page around it: the cards about as big.
    const middle = render(doc, { paper: 'A3', orientation: 'landscape' });
    const corner = render(doc, { paper: 'A3', orientation: 'landscape', titleAt: { x: 0.2, y: 0.06 } });
    expect(corner.cardMm.w).toBeGreaterThan(middle.cardMm.w * 0.97);
    // No card stands in either box, wherever they are.
    for (const r of [middle, corner]) {
      const chart = /<g transform="translate\(([-\d.]+)[ ,]([-\d.]+)\) scale\(([\d.]+)\)">/.exec(r.svg)!;
      const [ox, oy, k] = [Number(chart[1]), Number(chart[2]), Number(chart[3])];
      const cards = [...r.svg.matchAll(/<g class="card" data-person="[^"]+" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)].map((m) => ({
        x: ox + Number(m[1]) * k,
        y: oy + Number(m[2]) * k,
        w: r.cardUnits.w * k,
        h: r.cardUnits.h * k,
      }));
      expect(cards).toHaveLength(r.people);
      for (const box of [r.title!, r.legend!]) {
        const b = { x: box.x * r.width, y: box.y * r.height, w: box.w * r.width, h: box.h * r.height };
        expect(cards.filter((c) => c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y)).toEqual([]);
      }
    }
  });

  it('moves a card by hand: it stands where it was put, its line led after it, everyone else where they were', () => {
    const doc = sampleDocument();
    const at = (svg: string, id: string) => {
      const m = new RegExp(`data-person="${id}" transform="translate\\(([^,]+),([^)]+)\\)"`).exec(svg)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const plain = render(doc, { paper: 'A3', orientation: 'landscape' });
    // Leo, a little to the right and down.
    const moved = render(doc, { paper: 'A3', orientation: 'landscape', moves: { I29: { x: 60, y: 25 } } });
    expect(at(moved.svg, 'I29').x).toBeCloseTo(at(plain.svg, 'I29').x + 60, 3);
    expect(at(moved.svg, 'I29').y).toBeCloseTo(at(plain.svg, 'I29').y + 25, 3);
    for (const id of cardsIn(plain.svg)) if (id !== 'I29') expect(at(moved.svg, id)).toEqual(at(plain.svg, id));
    expect(moved.cardMm.w).toBeCloseTo(plain.cardMm.w, 6);
    // His line ends on his card where it now is.
    const end = moved.lines.find((l) => l.childId === 'I29')!.points.at(-1)!;
    const card = at(moved.svg, 'I29');
    expect(end.x).toBeGreaterThan(card.x - 1);
    expect(end.x).toBeLessThan(card.x + moved.cardUnits.w + 1);
    expect(end.y).toBeGreaterThan(card.y - 1);
    expect(end.y).toBeLessThan(card.y + moved.cardUnits.h + 1);
    // A move of someone who is not on the page changes nothing.
    expect(render(doc, { paper: 'A3', orientation: 'landscape', moves: { nobody: { x: 60, y: 25 } } }).svg).toBe(plain.svg);
  });

  it('widens a gap between two cards by hand: the same arrangement, those two further apart, fitted to the page again', () => {
    const doc = sampleDocument();
    const at = (svg: string, id: string) => {
      const m = new RegExp(`data-person="${id}" transform="translate\\(([^,]+),([^)]+)\\)"`).exec(svg)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const settings: Partial<PrintSettings> = { paper: 'A3', orientation: 'landscape' };
    const plain = render(doc, settings);
    // Two cards side by side in the lowest row there are two.
    const cards = cardsIn(plain.svg).map((id) => ({ id, ...at(plain.svg, id) }));
    const y = Math.max(...cards.filter((c) => cards.some((d) => d !== c && d.y === c.y)).map((c) => c.y));
    const row = cards.filter((c) => c.y === y).sort((a, b) => a.x - b.x);
    const [a, b] = [row[0], row[1]];
    const wider = render(doc, { ...settings, gaps: { [`${a.id}|${b.id}`]: 120 } });
    const gap = (svg: string) => at(svg, b.id).x - at(svg, a.id).x;
    expect(gap(wider.svg)).toBeCloseTo(gap(plain.svg) + 120, 3);
    // Everyone is still on it, the cards about as big (the lettering is sized to them again) or smaller.
    expect(cardsIn(wider.svg).sort()).toEqual(cardsIn(plain.svg).sort());
    expect(wider.cardMm.w).toBeLessThanOrEqual(plain.cardMm.w * 1.01);
    // A gap between two who do not stand next to each other changes nothing.
    expect(render(doc, { ...settings, gaps: { 'nobody|else': 120 } }).svg).toBe(plain.svg);
  });

  it('draws the direct lines of the two in the middle in their own colours, and every other line plain', () => {
    const doc = sampleDocument();
    const r = render(doc, { paper: 'A3', orientation: 'landscape' });
    const stroke = (child: string) => new RegExp(`<path [^>]*stroke="([^"]+)"[^>]*data-child="${child}"`).exec(r.svg)![1];
    const width = (child: string) => Number(new RegExp(`<path [^>]*stroke-width="([^"]+)"[^>]*data-child="${child}"`).exec(r.svg)![1]);
    // Simon's line, and his father's above it; Šárka's; and Harold, a great-uncle off both.
    expect(stroke('I11')).toBe(stroke('I6'));
    expect(stroke('I15')).not.toBe(stroke('I11'));
    expect(stroke('I8')).not.toBe(stroke('I11'));
    expect(stroke('I8')).not.toBe(stroke('I15'));
    // Their own children are no part of where they come from.
    expect(stroke('I22')).toBe(stroke('I8'));
    expect(width('I11')).toBeGreaterThan(width('I8'));
    // The line up from Simon's grandmother to parents nobody knows is his line too.
    expect(stroke('I2')).toBe(stroke('I11'));
    // The two cards the page is drawn around have one frame round both of them.
    expect([...r.svg.matchAll(/class="focus-frame"/g)]).toHaveLength(1);
  });

  it('tells which family and child every line belongs to, and gives the lines whole for finding what hangs on one', () => {
    const doc = sampleDocument();
    const r = render(doc, { paper: 'A3', orientation: 'landscape' });
    const drawn = [...r.svg.matchAll(/<path [^>]*data-family="([^"]+)" data-child="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    const whole = r.lines.map((l) => `${l.familyId} ${l.childId}`);
    expect(new Set(drawn)).toEqual(new Set(whole));
    // One line for every child of a family on the page.
    const children = doc.families.flatMap((f) => f.children.map((c) => `${f.id} ${c.personId}`));
    expect(new Set(whole)).toEqual(new Set(children));
    // Brothers and sisters leave their parents at one point: the stretch they share.
    const [a, b] = r.lines.filter((l) => l.familyId === 'F5');
    expect(a.points[0]).toEqual(b.points[0]);
    expect(r.shown).toHaveLength(r.people);
  });

  it('stands every couple side by side unless couples may be stacked, and draws everyone whichever way partners stand', () => {
    const doc = randomFamily(6, 70);
    const at = (svg: string) =>
      new Map(
        [...svg.matchAll(/<g class="card" data-person="([^"]+)" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)].map((m) => [
          m[1],
          { x: Number(m[2]), y: Number(m[3]) },
        ]),
      );
    /** Couples whose two cards stand one straight over the other. */
    const stacked = (svg: string) => {
      const cards = at(svg);
      return doc.families.filter((f) => {
        const [a, b] = f.partners.map((p) => cards.get(p));
        return !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
      }).length;
    };
    const plain = render(doc, { paper: 'A4', orientation: 'portrait' });
    expect(stacked(plain.svg)).toBe(0);
    for (const settings of [{ stackCouples: true }, { amidPartners: false }, { stackCouples: true, amidPartners: false }]) {
      const other = render(doc, { paper: 'A4', orientation: 'portrait', ...settings });
      expect(other.people).toBe(plain.people);
      expect(new Set(cardsIn(other.svg))).toEqual(new Set(cardsIn(plain.svg)));
    }
  }, 60_000);

  it('searches longer for a fuller page when asked: the cards no smaller, and the same page when drawn again', () => {
    const doc = randomFamily(6, 70);
    const plain = render(doc, { paper: 'A3', orientation: 'landscape' });
    const full = render(doc, { paper: 'A3', orientation: 'landscape', fill: true });
    expect(full.people).toBe(plain.people);
    expect(full.cardMm.w).toBeGreaterThan(plain.cardMm.w * 0.995);
    expect(render(doc, { paper: 'A3', orientation: 'landscape', fill: true }).svg).toBe(full.svg);
  }, 60_000);

  it('sizes the title and the family names to the sheet and to the cards when no size is set', () => {
    const doc = sampleDocument();
    const cm = (paper: string) => render(doc, { paper, orientation: 'landscape' }).lettering!;
    const [a4, a3, a1] = [cm('A4'), cm('A3'), cm('A1')];
    // Bigger paper, bigger lettering; the title always well over the family names.
    expect(a3.titleCm).toBeGreaterThan(a4.titleCm);
    expect(a1.titleCm).toBeGreaterThan(a3.titleCm);
    expect(a3.legendCm).toBeGreaterThan(a4.legendCm);
    for (const l of [a4, a3, a1]) expect(l.titleCm).toBeGreaterThan(l.legendCm * 2);
    // On a small sheet the paper decides: a title 4.2% of the shorter side high (a line a fifth more).
    expect(a4.titleCm).toBeCloseTo(21 * 0.042 * 1.2, 1);
    // On a big sheet full of small cards the lettering keeps to the cards, but never under 2.2% of the shorter side.
    const big = randomFamily(4, 120);
    const crowded = render(big, { paper: 'A1', orientation: 'landscape' });
    const names = (crowded.namePt * 0.3528) / 10;
    expect(crowded.lettering!.titleCm).toBeLessThan(59.4 * 0.042 * 1.2);
    expect(crowded.lettering!.titleCm).toBeGreaterThanOrEqual(59.4 * 0.022 * 1.2 - 0.01);
    expect(crowded.lettering!.titleCm).toBeGreaterThanOrEqual(names * 3.6 * 1.2 - 0.02);
    expect(crowded.lettering!.legendCm).toBeGreaterThanOrEqual(names * 1.7 * 1.2 - 0.05);
    // A size that is set is the size, whatever the sheet and the cards.
    const set = render(big, { paper: 'A1', orientation: 'landscape', titleSize: 3, legendSize: 1 }).lettering;
    expect(set).toMatchObject({ titleCm: expect.closeTo(3, 5), legendCm: expect.closeTo(1, 5) });
    // With it, what the page would have chosen: about what it does choose when no size is set.
    expect(set.autoTitleCm).toBeCloseTo(crowded.lettering.titleCm, 0);
    expect(set.autoLegendCm).toBeCloseTo(crowded.lettering.legendCm, 0);
    expect(crowded.lettering.autoTitleCm).toBeCloseTo(crowded.lettering.titleCm, 1);
    expect(crowded.lettering.autoLegendCm).toBeCloseTo(crowded.lettering.legendCm, 1);
  });

  it('stands the family names where asked in a box bigger than they need: in a corner of it, along a side, in the middle', () => {
    const doc = sampleDocument();
    // A box much bigger than the names need.
    const box = { paper: 'A3', orientation: 'landscape', legendSize: 0.6, legendHeading: false, legendBox: { x: 0.05, y: 0.3, w: 0.6, h: 0.6 } } as const;
    /** Where the first of the names is drawn: its mark's left, the baseline of its label. */
    const first = (svg: string) => {
      const m = /<g class="pp-legend">.*?<text x="([\d.]+)" y="([\d.]+)"/s.exec(svg);
      return { x: Number(m?.[1]), y: Number(m?.[2]) };
    };
    /** The same for the last (the families without a name of their own). */
    const last = (svg: string) => {
      const m = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>Other families<\/text>/.exec(svg.slice(svg.indexOf('<g class="pp-legend">')));
      return { x: Number(m?.[1]), y: Number(m?.[2]) };
    };
    const middle = render(doc, box);
    const W = middle.width;
    const H = middle.height;
    const at = { left: 0.05 * W, top: 0.3 * H, right: 0.65 * W, foot: 0.9 * H };
    const topLeft = render(doc, { ...box, legendAlign: 'top-left' });
    expect(first(topLeft.svg).x).toBeLessThan(at.left + 0.04 * W);
    expect(first(topLeft.svg).y).toBeLessThan(at.top + 0.04 * H);
    const footRight = render(doc, { ...box, legendAlign: 'bottom-right' });
    expect(last(footRight.svg).y).toBeGreaterThan(at.foot - 0.03 * H);
    expect(last(footRight.svg).y).toBeLessThan(at.foot);
    // (The names stand in as many columns as the box is wide enough for, so there is only so far to go across.)
    expect(first(footRight.svg).x).toBeGreaterThan(first(topLeft.svg).x + 0.02 * W);
    // In the middle when nothing is asked: as far from the top as from the foot.
    expect(first(middle.svg).y - at.top).toBeGreaterThan(0.1 * H);
    expect(Math.abs(first(middle.svg).y - at.top - (at.foot - last(middle.svg).y))).toBeLessThan(0.03 * H);
    // Only where the names stand: the tree is the same.
    expect(topLeft.cardMm).toEqual(middle.cardMm);
    expect(footRight.cardMm).toEqual(middle.cardMm);
  });

  it('puts the family names held at the top under the title where the two would meet, so far apart as asked', () => {
    const doc = sampleDocument();
    const page = { paper: 'A3', orientation: 'landscape', showFrame: false, legendSize: 0.5, titleAnchor: 'top-right', legendAnchor: 'top-right' } as const;
    const mm = (share: number) => share * 297;
    for (const legendGap of [undefined, 0, 2]) {
      const r = render(doc, { ...page, legendGap });
      const t = r.title!;
      const l = r.legend!;
      // Under the title, its right edge on the margin like the title's, the gap between them.
      expect(l.y).toBeGreaterThan(t.y + t.h - 0.001);
      expect(mm(l.y - t.y - t.h)).toBeCloseTo((legendGap ?? 0.5) * 10, 1);
      expect(l.x + l.w).toBeCloseTo(r.inner.x + r.inner.w, 3);
    }
    // Where they would not meet, the names keep to the top of the page.
    const apart = render(doc, { ...page, titleAnchor: 'top-left' });
    expect(apart.legend!.y).toBeCloseTo(apart.inner.y, 3);
    // Held at the foot, with the title at the top: nothing to keep clear of.
    const foot = render(doc, { ...page, legendAnchor: 'bottom-right' }).legend!;
    expect(foot.y + foot.h).toBeCloseTo(apart.inner.y + apart.inner.h, 3);
  });

  it('draws the family names into any box asked for, as they would stand there', () => {
    const r = render(sampleDocument(), { paper: 'A3', orientation: 'landscape', legendHeading: false });
    const at = (markup: string) => [...markup.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
    const wide = at(r.namesIn({ x: 0.1, y: 0.1, w: 0.8, h: 0.05 }));
    const tall = at(r.namesIn({ x: 0.1, y: 0.1, w: 0.1, h: 0.8 }));
    expect(wide.length).toBe(tall.length);
    // In a wide box they stand in a row or two, in a tall one in a column.
    expect(new Set(wide.map((t) => t[1])).size).toBeLessThan(new Set(tall.map((t) => t[1])).size);
    // Their letters are as big in either: the box lays them out, it does not size them.
    expect(new Set([...wide, ...tall].map((t) => t[2])).size).toBe(1);
    // So big as asked, and in the corner asked.
    const fixed = at(r.namesIn({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, { cm: 0.6, align: 'bottom-right' }));
    expect(fixed[0][2]).toBeCloseTo((0.6 * 10 * (96 / 25.4)) / 1.2, 1);
    expect(Math.max(...fixed.map((t) => t[1])) / r.height).toBeGreaterThan(0.85);
  });

  it('keeps the family names one size in a box sized by hand, only their columns and rows follow the box', () => {
    const doc = randomFamily(3, 60);
    const page = { paper: 'A3', orientation: 'landscape', legendHeading: false } as const;
    // The names placed by hand are the page's last group of them.
    const names = (svg: string) => svg.slice(svg.lastIndexOf('<g class="pp-legend">'));
    const sizes = (svg: string) => [...names(svg).matchAll(/<text [^>]*font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    const columns = (svg: string) => new Set([...names(svg).matchAll(/<text x="([\d.]+)"/g)].map((m) => m[1])).size;
    const small = render(doc, { ...page, legendBox: { x: 0.05, y: 0.6, w: 0.15, h: 0.3 } });
    const big = render(doc, { ...page, legendBox: { x: 0.05, y: 0.3, w: 0.6, h: 0.6 } });
    const flat = render(doc, { ...page, legendBox: { x: 0.05, y: 0.8, w: 0.9, h: 0.08 } });
    const all = [small, big, flat].map((r) => sizes(r.svg));
    expect(all.every((s) => s.length > 2)).toBe(true);
    // The same letters in every box, as big as the page makes them by itself.
    const one = new Set(all.flat());
    expect(one.size).toBe(1);
    expect([...one][0]).toBeCloseTo((small.lettering.legendCm * 10 * (96 / 25.4)) / 1.2, 1);
    // A wide, low box puts them in more columns than a narrow one.
    expect(columns(flat.svg)).toBeGreaterThan(columns(small.svg));
  });

  it('holds the title at its anchor whatever size it is: against the margin at a side, at the top or the foot', () => {
    const doc = sampleDocument();
    const page = { paper: 'A3', orientation: 'landscape' } as const;
    const plain = render(doc, page);
    const inner = plain.inner;
    // By itself: across the top, in the middle, not placed by anyone.
    expect(plain.title!.x + plain.title!.w / 2).toBeCloseTo(0.5, 3);
    expect(plain.title!.free).toBe(false);
    for (const titleSize of [1.2, 2.4]) {
      const right = render(doc, { ...page, titleSize, titleAnchor: 'top-right' }).title!;
      expect(right.x + right.w).toBeCloseTo(inner.x + inner.w, 3);
      expect(right.y).toBeCloseTo(inner.y, 3);
      expect(right.free).toBe(true);
      const left = render(doc, { ...page, titleSize, titleAnchor: 'bottom-left' }).title!;
      expect(left.x).toBeCloseTo(inner.x, 3);
      expect(left.y + left.h).toBeCloseTo(inner.y + inner.h, 3);
    }
    // The anchor decides, not where the title was once dragged to.
    const both = render(doc, { ...page, titleAnchor: 'top-left', titleAt: { x: 0.7, y: 0.4 } }).title!;
    expect(both.x).toBeCloseTo(inner.x, 3);
    expect(both.y).toBeCloseTo(inner.y, 3);
    // The title is drawn where its box is.
    const drawn = render(doc, { ...page, titleAnchor: 'top-right' });
    const x = Number(/<g class="pp-title"><text x="([\d.]+)"/.exec(drawn.svg)?.[1]);
    expect(x / drawn.width).toBeCloseTo(drawn.title!.x + drawn.title!.w / 2, 3);
  });

  it('holds the family names at their anchor: a block just big enough, or their box at its size, bigger where they need more', () => {
    const doc = sampleDocument();
    const page = { paper: 'A3', orientation: 'landscape', showFrame: false } as const;
    const inner = render(doc, page).inner;
    const ends = (l: { x: number; y: number; w: number; h: number }) => ({ left: l.x, top: l.y, right: l.x + l.w, foot: l.y + l.h });
    // A block of the names, at the place, whatever size they are.
    const small = render(doc, { ...page, legendSize: 0.5, legendAnchor: 'bottom-right' }).legend!;
    const big = render(doc, { ...page, legendSize: 0.9, legendAnchor: 'bottom-right' }).legend!;
    for (const l of [small, big]) {
      expect(ends(l).right).toBeCloseTo(inner.x + inner.w, 3);
      expect(ends(l).foot).toBeCloseTo(inner.y + inner.h, 3);
      expect(l.free).toBe(true);
    }
    expect(big.w * big.h).toBeGreaterThan(small.w * small.h * 2);
    const middle = render(doc, { ...page, legendAnchor: 'left' }).legend!;
    expect(middle.x).toBeCloseTo(inner.x, 3);
    expect(middle.y + middle.h / 2).toBeCloseTo(inner.y + inner.h / 2, 3);
    // A box sized by hand keeps its size there; where it was does not matter.
    const sized = render(doc, { ...page, showTitle: false, legendSize: 0.5, legendAnchor: 'top-left', legendBox: { x: 0.5, y: 0.5, w: 0.4, h: 0.3 } }).legend!;
    expect(sized).toMatchObject({ x: expect.closeTo(inner.x, 3), y: expect.closeTo(inner.y, 3), w: expect.closeTo(0.4, 3), h: expect.closeTo(0.3, 3) });
    // Names that need more than the box has: the box grows away from the anchor.
    const tight = render(doc, { ...page, legendSize: 1.2, legendAnchor: 'bottom-left', legendBox: { x: 0.5, y: 0.5, w: 0.3, h: 0.05 } }).legend!;
    expect(tight.h).toBeGreaterThan(0.1);
    expect(tight.x).toBeCloseTo(inner.x, 3);
    expect(tight.y + tight.h).toBeCloseTo(inner.y + inner.h, 3);
    // Without an anchor the box lies where it was put, as ever.
    expect(render(doc, { ...page, legendBox: { x: 0.5, y: 0.5, w: 0.4, h: 0.3 } }).legend).toMatchObject({ x: 0.5, y: 0.5, free: true });
    // On a page with a frame, names in a corner keep clear of the flourish there: a little in from the margin, whatever the title's size
    // (the flourishes grow with it); along a side there is none to keep clear of.
    for (const titleSize of [1.5, 3]) {
      const framed = { ...page, showFrame: true, titleSize, legendSize: 0.5 } as const;
      const corner = render(doc, { ...framed, legendAnchor: 'bottom-left' }).legend!;
      const clear = corner.x - inner.x;
      expect(clear).toBeGreaterThanOrEqual(0);
      expect(clear).toBeLessThan(titleSize === 3 ? 0.1 : 0.03);
      if (titleSize === 3) expect(clear).toBeGreaterThan(0.002);
      const foot = render(doc, { ...framed, legendAnchor: 'bottom' }).legend!;
      expect(foot.y + foot.h).toBeCloseTo(inner.y + inner.h, 3);
    }
  });

  it('prints the words on the cards a size bigger when asked: taller cards of the same width', () => {
    const doc = sampleDocument();
    const usual = render(doc, { paper: 'A3', orientation: 'landscape' });
    const large = render(doc, { paper: 'A3', orientation: 'landscape', largeText: true });
    expect(large.cardUnits.w).toBe(usual.cardUnits.w);
    expect(large.cardUnits.h).toBeGreaterThan(usual.cardUnits.h * 1.1);
    // Names a fifth bigger for cards of one size; on this page (wider than it is full) nearly all of that is kept.
    expect(large.namePt / large.cardMm.w).toBeCloseTo((usual.namePt / usual.cardMm.w) * 1.2, 2);
    expect(large.namePt).toBeGreaterThan(usual.namePt * 1.05);
    expect(cardsIn(large.svg).sort()).toEqual(cardsIn(usual.svg).sort());
  });

  it('widens the card of someone whose names do not fit when asked, and only theirs', () => {
    const doc = sampleDocument();
    const long = 'Maximilian Bartholomew';
    const named = (given: string) => ({ ...doc, people: doc.people.map((p) => (p.id === 'I20' ? { ...p, name: { ...p.name, given } } : p)) });
    const widthsIn = (svg: string) =>
      new Map(
        [...svg.matchAll(/<g class="card" data-person="([^"]+)"[^>]*>(?:<rect class="focus-ring"[^>]*\/>)?<rect width="([\d.]+)"/g)].map((m) => [
          m[1],
          Number(m[2]),
        ]),
      );
    const one = render(named(long), { paper: 'A3', orientation: 'landscape' });
    // Every card one width: the long name cut short.
    expect(new Set(widthsIn(one.svg).values()).size).toBe(1);
    expect(one.svg.includes(`>${long}<`)).toBe(false);
    expect(/>Maximilian[^<]*…</.test(one.svg)).toBe(true);
    const free = render(named(long), { paper: 'A3', orientation: 'landscape', freeWidths: true });
    const widths = widthsIn(free.svg);
    expect(free.svg.includes(`>${long}<`)).toBe(true);
    expect(widths.get('I20')).toBeGreaterThan(free.cardUnits.w);
    expect(widths.get('I20')).toBeLessThanOrEqual(free.cardUnits.w * 1.5);
    expect([...widths].filter(([id, w]) => id !== 'I20' && w !== free.cardUnits.w)).toEqual([]);
    // A name longer than any card: as wide as a card gets, and cut short there.
    const most = render(named(`${long} ${long} ${long}`), { paper: 'A3', orientation: 'landscape', freeWidths: true });
    expect(widthsIn(most.svg).get('I20')).toBeCloseTo(most.cardUnits.w * 1.5);
    expect(/>Maximilian[^<]*…</.test(most.svg)).toBe(true);
  });

  it('keeps the gaps asked for between cards, partners never closer than their marker needs', () => {
    expect(gapsFor({ ...DEFAULT_PRINT, cardGap: 10, lineGap: 5 }, 200)).toEqual({
      siblingGap: 20,
      familyGap: 50,
      stackGap: 16,
      partnerGap: 50,
      tick: 10,
      stem: 10,
      drop: 10,
    });
    expect(gapsFor({ ...DEFAULT_PRINT, cardGap: 2 }, 200).partnerGap).toBe(26);
    expect(gapsFor(DEFAULT_PRINT, 200)).toEqual({});
  });

  it('draws the page a piece at a time to the same result, and the same tree again with little of the work', () => {
    const doc = randomFamily(11, 90);
    const input = { doc, settings: { ...DEFAULT_PRINT, paper: 'A2', orientation: 'landscape' as const }, measure, now: new Date('2026-01-01T00:00:00Z') };
    const count = (steps: ReturnType<typeof posterSteps>) => {
      for (let n = 0; ; n++) {
        const step = steps.next();
        if (step.done) return { steps: n, page: step.value };
      }
    };
    const first = count(posterSteps(input));
    expect(first.steps).toBeGreaterThan(50);
    expect(first.page.svg === renderPoster(input).svg).toBe(true);
    // Another title on the same tree: its layouts are there already.
    const retitled = count(posterSteps({ ...input, settings: { ...input.settings, title: 'Another title for the page' } }));
    expect(retitled.page.svg.includes('Another title for the page')).toBe(true);
    expect(retitled.page.cardMm.w).toBeCloseTo(first.page.cardMm.w, 0);
    // A switch that changes nothing about the layout: nothing to fit at all.
    const plain = count(posterSteps({ ...input, settings: { ...input.settings, showRibbons: false } }));
    expect(plain.steps).toBeLessThan(first.steps / 10);
  }, 60_000);

  it('puts the family names where the tree leaves room: across the foot, or as a block in a corner when that keeps the cards bigger', () => {
    const corners = (r: ReturnType<typeof render>) => {
      const l = r.legend!;
      // At the top: against the margin there, or right under the title.
      const t = r.title;
      const top = l.y < 0.12 || (!!t && Math.abs(l.y - (t.y + t.h)) < 0.05);
      return { left: l.x < 0.1, right: l.x + l.w > 0.9, top, bottom: l.y + l.h > 0.88, middle: Math.abs(l.x + l.w / 2 - 0.5) < 0.02 };
    };
    // A small tree with a few names: the rows across the foot, in the middle.
    const small = render(sampleDocument(), { paper: 'A3', orientation: 'landscape' });
    expect(small.legend).toMatchObject({ free: false });
    // Wherever they are put, no card stands on them, and they are on the page.
    for (const doc of [sampleDocument(), randomFamily(4, 120), randomFamily(6, 70)]) {
      const r = render(doc, { paper: 'A3', orientation: 'landscape' });
      const at = corners(r);
      expect(at.middle || at.left || at.right).toBe(true);
      expect(at.top || at.bottom).toBe(true);
      const l = r.legend!;
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(1);
      expect(l.y + l.h).toBeLessThanOrEqual(1);
      const chart = /<g transform="translate\(([-\d.]+)[ ,]([-\d.]+)\) scale\(([\d.]+)\)">/.exec(r.svg)!;
      const [ox, oy, k] = [Number(chart[1]), Number(chart[2]), Number(chart[3])];
      const box = { x: l.x * r.width, y: l.y * r.height, w: l.w * r.width, h: l.h * r.height };
      const over = [...r.svg.matchAll(/<g class="card" data-person="[^"]+" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)].filter((m) => {
        const x = ox + Number(m[1]) * k;
        const y = oy + Number(m[2]) * k;
        return x < box.x + box.w && x + r.cardUnits.w * k > box.x && y < box.y + box.h && y + r.cardUnits.h * k > box.y;
      });
      expect(over).toEqual([]);
      // Every family's name is there once, wherever the names stand.
      expect([...r.svg.matchAll(/class="pp-legend"/g)].length).toBeLessThanOrEqual(1);
    }
    // Placed by hand they stay where they were put.
    const byHand = render(randomFamily(4, 120), { paper: 'A3', orientation: 'landscape', legendBox: { x: 0.3, y: 0.4, w: 0.3, h: 0.1 } });
    expect(byHand.legend).toMatchObject({ free: true, x: expect.closeTo(0.3, 5), y: expect.closeTo(0.4, 5) });
  }, 60_000);

  it('says “née Unknown” for a married woman whose own surname nobody knows, unless switched off', () => {
    const b = new DocBuilder();
    b.person('H', 'Pavel', 'Nowak', 'male');
    b.person('W', 'Anna', 'Nowaková', 'female');
    b.person('S', 'Bruno', 'Novák', 'male');
    b.person('D', 'Soňa', 'Nováková', 'female');
    b.person('X', 'Jan', 'Mikula', 'male');
    b.person('Y', 'Petr', 'Mikula', 'male');
    b.family('F1', ['H', 'W'], ['S']);
    b.family('F2', ['S'], ['D']);
    b.family('F3', ['X'], ['Y']);
    const doc = b.build();
    doc.meta.homePersonId = 'S';
    const plain = render(doc, { paper: 'A4', orientation: 'landscape' });
    expect(plain.svg).toContain('née Unknown');
    expect(render(doc, { paper: 'A4', orientation: 'landscape' }, { language: 'cs' }).svg).toContain('roz. Neznámá');
    expect(render(doc, { paper: 'A4', orientation: 'landscape', unknownBirthNames: false }).svg).not.toContain('née Unknown');
    expect(render(doc, { paper: 'A4', orientation: 'landscape', showBirthNames: false }).svg).not.toContain('née Unknown');
    // Father Nowak, son Novák, granddaughter Nováková are one family (see the colours' own tests); apart, the page still has everyone.
    const apart = render({ ...doc, view: { ...doc.view, uniteSpellings: false } }, { paper: 'A4', orientation: 'landscape' });
    expect(apart.people).toBe(plain.people);
  });

  it('leaves the title, the family names and the frame out when switched off', () => {
    const doc = sampleDocument();
    const bare = render(doc, { showTitle: false, showLegend: false, showFrame: false });
    expect(bare.svg).not.toContain('The Ashworth family');
    expect(bare.legend).toBeUndefined();
    // More room for the tree: the cards are bigger.
    expect(bare.cardMm.w).toBeGreaterThan(render(doc).cardMm.w);
  });

  it('prints part of the tree: generations, side branches and people left out', () => {
    const doc = sampleDocument();
    expect(render(doc, { ancestors: 1, descendants: 0, branches: 0 }).people).toBeLessThan(10);
    const without = render(doc, {}, { omit: new Set(['I29']) });
    expect(cardsIn(without.svg)).not.toContain('I29');
    expect(without.people).toBe(28);
  });

  it('draws the page around whoever is chosen', () => {
    const doc = sampleDocument();
    const p = render(doc, { centerId: 'I20', partnerId: undefined });
    expect(p.centerId).toBe('I20');
    expect(p.partnerId).toBe('I25');
    expect(render(doc, { centerId: 'I20', partnerId: null }).partnerId).toBeUndefined();
  });

  it('sizes the page to the tree when no paper is chosen', () => {
    const p = render(sampleDocument(), { paper: 'fit' });
    expect(p.paper).toBeUndefined();
    expect(p.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/);
  });

  it("puts the families' names in a box placed by hand", () => {
    const doc = sampleDocument();
    const box = { x: 0.05, y: 0.8, w: 0.3, h: 0.12 };
    const p = render(doc, { legendBox: box });
    expect(p.legend).toMatchObject({ free: true });
    expect(p.legend!.x).toBeCloseTo(0.05);
    expect(p.svg).toContain('class="pp-legend"');
    expect(render(doc).legend).toMatchObject({ free: false });
  });

  it('makes the title as big as asked', () => {
    const doc = sampleDocument();
    expect(render(doc, { titleSize: 3 }).lettering.titleCm).toBeCloseTo(3);
    expect(render(doc, { legendSize: 1 }).lettering.legendCm).toBeCloseTo(1);
  });

  it('draws an empty page for an empty tree', () => {
    const p = render({ ...sampleDocument(), people: [], families: [] });
    expect(p.people).toBe(0);
    expect(cardsIn(p.svg)).toEqual([]);
  });
});
