import { DocBuilder, wideFamily } from '../testing/fixtures';
import { moveCards } from '../model/arrangement';
import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { DEFAULT_PRINT, Person, PrintSettings, TreeDocument } from '../model/types';
import { computeLayout } from '../layout/layout';
import { pdfFromJpeg } from './pdf';
import { flipLayout, renderPoster, siblingsAround } from './poster';
import { RELATIVES, relativesOf, relativesSettings, scopeDocument } from './scope';
import { kinship } from '../kinship/kinship';
import { POSTER_THEMES, posterTheme } from './themes';
import { threeSpouses } from '../testing/fixtures';

const measure = (text: string, font: string) => text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12) * 0.5;

describe('print scope', () => {
  const doc = sampleDocument();
  const index = new TreeIndex(doc);
  const ids = (s: { people: ReadonlySet<string> }) => [...s.people].sort();

  it('keeps the direct line and partners', () => {
    const s = scopeDocument(doc, index, { centerId: 'I11', partnerId: 'I15', ancestors: 1, descendants: 1, branches: 0 });
    // Simon, Šárka, their parents, Simon's children, and the partners of all of them.
    expect(ids(s)).toEqual(['I11', 'I14', 'I15', 'I16', 'I17', 'I20', 'I21', 'I22', 'I25', 'I26', 'I6', 'I9'].sort());
    expect(s.doc.people.map((p) => p.id)).not.toContain('I12');
    expect(s.doc.families.every((f) => f.partners.every((p) => s.people.has(p)))).toBe(true);
  });

  it("keeps a former partner's side to the people one would have known", () => {
    // Ruth divorced Simon: his parents, brother and sister (with her husband) and his
    // descendants stay; his grandparents, aunts, uncles, cousins, nieces and nephews go.
    const everything = { centerId: 'I14', partnerId: 'I11', ancestors: 'all', descendants: 'all', branches: 'all' } as const;
    const near = scopeDocument(doc, index, { ...everything, nearFormerPartner: true });
    for (const id of ['I14', 'I11', 'I6', 'I9', 'I12', 'I13', 'I18', 'I20', 'I21', 'I22', 'I15', 'I27', 'I29']) expect(near.people.has(id)).toBe(true);
    for (const id of ['I1', 'I2', 'I3', 'I4', 'I5', 'I7', 'I8', 'I10', 'I19', 'I23', 'I24']) expect(near.people.has(id)).toBe(false);
    expect(near.doc.families.every((f) => f.partners.every((p) => near.people.has(p)))).toBe(true);
    // Without the option, or for a couple still together, nothing changes.
    expect(scopeDocument(doc, index, everything).people.has('I1')).toBe(true);
    const together = { centerId: 'I11', partnerId: 'I15', ancestors: 'all', descendants: 'all', branches: 2 } as const;
    expect(ids(scopeDocument(doc, index, { ...together, nearFormerPartner: true }))).toEqual(ids(scopeDocument(doc, index, together)));
  });

  it('adds siblings, nieces and nephews one branch out', () => {
    const s = scopeDocument(doc, index, { centerId: 'I11', partnerId: 'I15', ancestors: 1, descendants: 1, branches: 1 });
    for (const id of ['I12', 'I13', 'I18', 'I23', 'I24']) expect(s.people.has(id)).toBe(true);
    // Brothers and sisters only: the nieces and nephews stay out.
    const only = scopeDocument(doc, index, { centerId: 'I11', partnerId: 'I15', ancestors: 2, descendants: 1, branches: 1, siblingsOnly: true });
    const kin = kinship(index, 'I11');
    for (const id of only.people) {
      const k = kin.get(id);
      if (k?.kind === 'line') expect(Math.min(k.up, k.down) === 1 && k.up !== k.down, id).toBe(false);
    }
    expect(only.people.size).toBeLessThan(
      scopeDocument(doc, index, { centerId: 'I11', partnerId: 'I15', ancestors: 2, descendants: 1, branches: 1 }).people.size,
    );
    // Aunts and uncles need the grandparents' generation.
    expect(s.people.has('I7')).toBe(false);
    const wider = scopeDocument(doc, index, { centerId: 'I11', partnerId: 'I15', ancestors: 2, descendants: 1, branches: 1 });
    expect(wider.people.has('I7')).toBe(true);
    expect(wider.people.has('I19')).toBe(false);
  });

  it('leaves out people hidden from prints, unless the print is about them', () => {
    // Šárka's partner Simon hidden: she and his children stay, as a one-parent family.
    const hidden: TreeDocument = { ...doc, people: doc.people.map((p) => (p.id === 'I11' ? { ...p, hiddenFromPrint: true } : p)) };
    const hiddenIndex = new TreeIndex(hidden);
    const s = scopeDocument(hidden, hiddenIndex, { centerId: 'I15', ancestors: 'all', descendants: 'all', branches: 'all' });
    expect(s.people.has('I11')).toBe(false);
    expect(s.people.has('I15')).toBe(true);
    expect(s.people.size).toBe(doc.people.length - 1);
    const family = s.doc.families.find((f) => f.partners.includes('I15'))!;
    expect(family.partners).toEqual(['I15']);
    expect(family.children.length).toBeGreaterThan(0);
    // Nobody is hidden from a print about themselves.
    const own = scopeDocument(hidden, hiddenIndex, { centerId: 'I11', ancestors: 1, descendants: 1, branches: 0 });
    expect(own.people.has('I11')).toBe(true);
    // The print can show the hidden people all the same.
    const shown = scopeDocument(hidden, hiddenIndex, { centerId: 'I15', ancestors: 'all', descendants: 'all', branches: 'all', showHidden: true });
    expect(shown.people.has('I11')).toBe(true);
    expect(shown.people.size).toBe(doc.people.length);
    // People clicked away in the studio are left out of that print alone, even with the hidden ones shown.
    const omitted = scopeDocument(doc, index, {
      centerId: 'I15',
      ancestors: 'all',
      descendants: 'all',
      branches: 'all',
      showHidden: true,
      omit: new Set(['I11', 'I15']),
    });
    expect(omitted.people.has('I11')).toBe(false);
    expect(omitted.people.has('I15')).toBe(true);
  });

  it('takes everyone when nothing is limited', () => {
    const s = scopeDocument(doc, index, { centerId: 'I11', ancestors: 'all', descendants: 'all', branches: 'all' });
    expect(s.people.size).toBe(doc.people.length);
  });

  it('leaves out the families of those who married in, but not their partners', () => {
    // Marco's parents, and a later wife of his.
    const person = (id: string, sex: Person['sex']): Person => ({ id, sex, name: { given: id, surname: 'Ferri' } });
    const married: TreeDocument = {
      ...doc,
      people: [...doc.people, person('P1', 'male'), person('P2', 'female'), person('P3', 'female')],
      families: [
        ...doc.families,
        { id: 'F90', kind: 'marriage', partners: ['P1', 'P2'], children: [{ personId: 'I18', relation: 'biological' }] },
        { id: 'F91', kind: 'marriage', partners: ['I18', 'P3'], children: [] },
      ],
    };
    const options = { centerId: 'I11', partnerId: 'I15', ancestors: 'all', descendants: 'all' } as const;
    const all = scopeDocument(married, new TreeIndex(married), { ...options, ...relativesSettings('everyone') });
    const kin = scopeDocument(married, new TreeIndex(married), { ...options, ...relativesSettings('relatives') });
    expect(all.people.size).toBe(32);
    // Everyone else has a relationship name as seen from Simon: Marco is his brother-in-law.
    expect([...all.people].filter((id) => !kin.people.has(id)).sort()).toEqual(['P1', 'P2']);
    expect(kin.people.has('P3')).toBe(true);
    expect(kin.doc.families.some((f) => f.id === 'F90')).toBe(false);
    // Nearer steps leave them out anyway.
    const cousins = scopeDocument(married, new TreeIndex(married), { ...options, ...relativesSettings('cousins') });
    expect(cousins.people.has('P1')).toBe(false);
  });

  it('saves each step of Relatives as side branches and in-law families', () => {
    for (const r of RELATIVES) expect(relativesOf(relativesSettings(r))).toBe(r);
    expect(relativesOf({ branches: 3, inLawFamilies: true, siblingsOnly: false })).toBe('everyone');
    expect(relativesSettings('relatives')).toEqual({ branches: 'all', inLawFamilies: false, siblingsOnly: false });
    expect(relativesSettings('siblings')).toEqual({ branches: 1, inLawFamilies: true, siblingsOnly: true });
  });
});

describe('printed page', () => {
  const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
  const settings = (patch: Partial<PrintSettings> = {}): PrintSettings => ({ ...DEFAULT_PRINT, ...patch });

  it('draws every style as well-formed SVG with the title and everyone in it', () => {
    for (const theme of POSTER_THEMES) {
      const result = renderPoster({ doc, settings: settings({ theme: theme.id }), measure, now: new Date(2026, 9, 10) });
      const dom = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
      expect(dom.getElementsByTagName('parsererror')).toHaveLength(0);
      expect(result.svg).toContain('The Ashworth family');
      expect(result.people).toBe(29);
      expect(result.paper?.landscape).toBe(true);
      expect(result.svg).toContain('width="420mm"');
      expect(result.centerId).toBe('I11');
      expect(result.partnerId).toBe('I15');
    }
  });

  it('brings the couple towards the middle of the page when asked, without leaving the page empty beside the tree', () => {
    // Ruth has nobody of her own in the tree; Simon's family is all on one side of them.
    const placed = (centered: boolean) => {
      const result = renderPoster({ doc, settings: settings({ centerId: 'I14', partnerId: 'I11', centered, theme: 'heirloom' }), measure });
      const dom = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
      const lefts = [...dom.querySelectorAll('[data-person]')].map((card) => {
        const chart = card.closest('g[transform*="scale"]:not([data-person])')!;
        const [, tx, , s] = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(chart.getAttribute('transform')!)!.map(Number);
        const [, cx] = /translate\(([-\d.]+),/.exec(card.getAttribute('transform')!)!.map(Number);
        return { id: card.getAttribute('data-person')!, left: tx + cx * s, s };
      });
      const s = lefts[0].s;
      const cardW = 178 * s;
      const couple = lefts.filter((l) => l.id === 'I14' || l.id === 'I11');
      const middle = (Math.min(...couple.map((x) => x.left)) + Math.max(...couple.map((x) => x.left)) + cardW) / 2;
      const span = Math.max(...lefts.map((l) => l.left)) + cardW - Math.min(...lefts.map((l) => l.left));
      return { off: Math.abs(middle - result.width / 2) / result.width, s, filled: span / result.width };
    };
    const centred = placed(true);
    const plain = placed(false);
    // The cards are as big either way: keeping the couple in the middle never shrinks the tree.
    expect(centred.s).toBeCloseTo(plain.s, 2);
    expect(centred.off).toBeLessThanOrEqual(plain.off + 0.001);
    // The tree reaches across the page, margins aside.
    expect(centred.filled).toBeGreaterThan(0.8);
  });

  it('tries the person in the middle at the other places among their brothers and sisters', () => {
    // Simon is the eldest of three.
    const orders = siblingsAround(doc, new TreeIndex(doc), 'I11').map((d) => d.families.find((f) => f.id === 'F4')!.children.map((c) => c.personId));
    expect(orders).toEqual([
      ['I12', 'I11', 'I13'],
      ['I12', 'I13', 'I11'],
    ]);
    // An only child.
    expect(siblingsAround(doc, new TreeIndex(doc), 'I22')).toEqual([]);
  });

  it('writes surnames at birth and the counts in the language the tree was saved in, without relationship names', () => {
    const cs = { ...doc, view: { ...doc.view, language: 'cs' } };
    const result = renderPoster({ doc: cs, settings: settings({ showRelationships: true }), measure });
    expect(result.svg).toContain('5 generací, 29 osob');
    // The surname at birth on its own line.
    expect(result.svg).toContain('>roz. Nováková<');
    // Prints have no relationship names, whatever the old setting says.
    expect(result.svg).not.toContain('Tchyně');
  });

  it('writes in the language it is given, whatever the tree was saved in', () => {
    const result = renderPoster({ doc, settings: settings(), language: 'cs', measure });
    expect(doc.view.language).toBe('en');
    expect(result.svg).toContain('5 generací');
    expect(result.svg).not.toContain('5 generations');
  });

  it('shows how a couple stands by their marker alone, without a note', () => {
    const result = renderPoster({ doc, settings: settings(), measure });
    for (const note of ['>married<', '>divorced<', '>engaged<']) expect(result.svg).not.toContain(note);
  });

  it('draws childless couples in the room of one card on request, the partner stacked under the card', () => {
    // Šárka's son Tomáš and his fiancée Mia have nobody under them.
    const childless = { ...doc, families: doc.families.map((f) => (f.id === 'F11' ? { ...f, children: [] } : f)) };
    const couple = childless.families.find((f) => f.id === 'F11')!.partners;
    const positions = (svg: string) =>
      new Map([...svg.matchAll(/data-person="([^"]+)" transform="translate\(([-\d.]+),([-\d.]+)\)/g)].map((m) => [m[1], { x: +m[2], y: +m[3] }]));
    const usual = positions(renderPoster({ doc: childless, settings: settings(), measure }).svg);
    // Laid out to fit, or with tall generations: always (on paper otherwise only in rows where it makes the cards bigger).
    const compactSvg = renderPoster({ doc: childless, settings: settings({ compactCouples: true, paper: 'fit' }), measure }).svg;
    const tall = positions(renderPoster({ doc: childless, settings: settings({ compactCouples: true, tallGenerations: true }), measure }).svg);
    const [e, g] = couple.map((id) => tall.get(id)!);
    expect(e.y).not.toBe(g.y);
    const compact = positions(compactSvg);
    const [a, b] = couple.map((id) => usual.get(id)!);
    expect(a.y).toBe(b.y);
    const [c, d] = couple.map((id) => compact.get(id)!);
    // One under the other, the lower one stepped in by its line.
    expect(c.y).not.toBe(d.y);
    expect(Math.abs(c.x - d.x)).toBeLessThan(Math.abs(a.x - b.x));
    // Both are still there, by name.
    for (const name of ['Tomáš', 'Mia']) expect(compactSvg).toContain(`>${name}<`);
  });

  it('draws the title and the family names bigger on request, in every style (the title as far as it fits)', () => {
    const fontSizes = (svg: string, text: string) => {
      const m = svg.match(new RegExp(`font-size="([\\d.]+)"[^>]*>(?:<[^>]+>)*${text}`));
      return m ? +m[1] : NaN;
    };
    for (const theme of POSTER_THEMES) {
      const plain = renderPoster({ doc, settings: settings({ theme: theme.id }), measure, now: new Date(2026, 9, 10) });
      const big = renderPoster({ doc, settings: settings({ theme: theme.id, titleScale: 2, legendScale: 1.5 }), measure, now: new Date(2026, 9, 10) });
      expect(fontSizes(big.svg, 'The Ashworth family'), theme.id).toBeGreaterThan(fontSizes(plain.svg, 'The Ashworth family') * 1.2);
      expect(big.people).toBe(plain.people);
    }
  });

  it('draws curved lines when the chart has them, in styles with lines of their own kind', () => {
    const lineData = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#4b3828"/g)].map((m) => m[1]);
    const square = lineData(renderPoster({ doc, settings: settings({ theme: 'heirloom', showTree: false }), measure }).svg);
    const curved = lineData(renderPoster({ doc, settings: settings({ theme: 'heirloom', showTree: false }), lines: 'curved', measure }).svg);
    expect(square.some((d) => d.includes('Q'))).toBe(true);
    expect(curved.length).toBe(square.length);
    expect(curved.some((d) => d.includes('Q'))).toBe(false);
    expect(curved.some((d) => d.includes('C'))).toBe(true);
    // The Heraldic cord follows the chart's lines too.
    const now = new Date(2026, 9, 11);
    const heraldic = (lines: 'square' | 'curved') => renderPoster({ doc: threeSpouses(), settings: settings({ theme: 'heraldic' }), lines, measure, now }).svg;
    expect(heraldic('curved')).not.toBe(heraldic('square'));
  });

  it('draws the family lines as branches of the tree in the Heirloom style, and as lines when the tree is off', () => {
    const lineData = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#4b3828"/g)].map((m) => m[1]);
    const withTree = renderPoster({ doc, settings: settings({ theme: 'heirloom', showTree: true }), measure });
    const without = renderPoster({ doc, settings: settings({ theme: 'heirloom', showTree: false }), measure });
    expect(lineData(without.svg).length).toBeGreaterThan(lineData(withTree.svg).length);
    expect(withTree.svg).toContain('pp-tree-room');
    expect(without.svg).not.toContain('pp-tree-room');
  });

  it('can turn a layout upside down for styles that grow upwards', () => {
    const layout = computeLayout(doc);
    const flipped = flipLayout(layout);
    const top = (l: typeof layout, id: string) => l.cards.find((c) => c.personId === id)!.y;
    expect(top(layout, 'I1')).toBeLessThan(top(layout, 'I29'));
    expect(top(flipped, 'I1')).toBeGreaterThan(top(flipped, 'I29'));
    expect(flipped.bounds).toEqual(layout.bounds);
  });

  it('draws the tree behind the chart and marks sex on the cards', () => {
    const plain = renderPoster({ doc, settings: settings({ showTree: false, showSex: false, sexColors: false }), measure });
    const decorated = renderPoster({ doc, settings: settings({ showTree: true, showSex: true, sexColors: true }), measure });
    expect(decorated.svg.length).toBeGreaterThan(plain.svg.length);
    const { palette, tree } = posterTheme('heirloom');
    expect(decorated.svg).toContain(palette.cardMale);
    expect(plain.svg).not.toContain(palette.cardMale);
    // Wood, leaves and blossom in the style's colours.
    expect(decorated.svg).toContain(`fill="${tree!.wood}"`);
    expect(decorated.svg).toContain(`fill="${tree!.leaves[0]}"`);
    expect(decorated.svg).toContain(`fill="${tree!.bloom![0]}"`);
    expect(plain.svg).not.toContain('pp-tree-room');
    expect(plain.svg).not.toContain(`fill="${tree!.leaves[0]}"`);
    // A style without a tree of its own draws none.
    const modern = renderPoster({ doc, settings: settings({ theme: 'modern', showTree: true }), measure });
    expect(modern.svg).not.toContain('pp-tree-room');
  });

  it('prints no portraits, and gives no room to lines a person has nothing for', () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQ';
    const withPhoto = { ...doc, people: doc.people.map((p) => (p.id === 'I11' ? { ...p, photo } : p)) };
    for (const theme of ['heirloom', 'heraldic', 'modern']) {
      const printed = renderPoster({ doc: withPhoto, settings: settings({ theme, showPhotos: true, portraitSize: 2 }), measure }).svg;
      expect(printed).not.toContain('pp-photo-I11');
      expect(printed).not.toContain('/9j/4AAQ');
    }
    // Edith was born Barlow and has that line; Thomas has none, so his dates follow his surname directly.
    const lineY = (svg: string, name: string) => {
      const at = svg.indexOf(`>${name}<`);
      return Number(/ y="([\d.]+)"/.exec(svg.slice(svg.lastIndexOf('<text', at)))![1]);
    };
    const heirloom = renderPoster({ doc, settings: settings(), measure }).svg;
    const edithGap = lineY(heirloom, '1901 – 1988') - lineY(heirloom, 'Ashworth');
    const thomasGap = lineY(heirloom, '1898 – 1971') - lineY(heirloom.slice(heirloom.indexOf('>Thomas<')), 'Ashworth');
    expect(edithGap).toBeGreaterThan(thomasGap);
  });

  it("puts a picture of one's own behind the chart instead of the drawn tree", () => {
    const withPicture = { ...doc, background: { href: 'data:image/png;base64,iVBORw0K', width: 2000, height: 1000, fit: 'cover' as const, opacity: 0.5 } };
    const printed = renderPoster({ doc: withPicture, settings: settings({ showTree: true }), measure });
    expect(printed.svg).toContain('<image href="data:image/png;base64,iVBORw0K"');
    expect(printed.svg).toContain('opacity="0.5"');
    expect(printed.svg).not.toContain('pp-tree-room');
    const without = renderPoster({ doc: withPicture, settings: settings({ showTree: false }), measure });
    expect(without.svg).not.toContain('iVBORw0K');
  });

  it('sizes a page to the tree, and falls back to known styles and papers', () => {
    const fit = renderPoster({ doc, settings: settings({ paper: 'fit' }), measure });
    expect(fit.paper).toBeUndefined();
    expect(fit.svg).not.toContain('mm"');
    const unknown = renderPoster({ doc, settings: settings({ theme: 'watercolour', paper: 'B7' }), measure });
    expect(unknown.theme.id).toBe('heirloom');
    expect(Math.round(unknown.paper!.widthMm)).toBe(420);
    expect(posterTheme('modern').id).toBe('modern');
  });

  it('prints someone whose name nobody knows as Unknown, on a dashed card', () => {
    const unknown = { ...doc, people: doc.people.map((p) => (p.id === 'I16' ? { ...p, name: { ...p.name, given: '' } } : p)) };
    for (const theme of POSTER_THEMES) {
      const known = renderPoster({ doc, settings: settings({ theme: theme.id }), measure });
      const printed = renderPoster({ doc: unknown, settings: settings({ theme: theme.id }), measure });
      expect(printed.svg).toContain('>Unknown<');
      expect(printed.svg).toContain('stroke-dasharray="4 2.6"');
      expect(known.svg).not.toContain('stroke-dasharray="4 2.6"');
    }
    const cs = renderPoster({ doc: { ...unknown, view: { ...unknown.view, language: 'cs' } }, settings: settings(), measure });
    expect(cs.svg).toContain('>Neznámý<');
  });

  it('prints the changes made by hand to the layout', () => {
    const plain = renderPoster({ doc, settings: settings(), measure });
    const arranged = moveCards(doc, ['I18', 'I12'], 200);
    expect(renderPoster({ doc: arranged, settings: settings(), measure }).svg).not.toBe(plain.svg);
    const part = scopeDocument(arranged, new TreeIndex(arranged), { centerId: 'I11', ancestors: 1, descendants: 1, branches: 1 });
    expect(part.doc.arrangement?.moves).toEqual({ I18: 200, I12: 200 });
  });

  it("puts the families' names in a box placed by hand, bigger in a bigger box, and says where they are", () => {
    for (const theme of ['heirloom', 'heraldic', 'modern']) {
      const auto = renderPoster({ doc, settings: settings({ theme }), measure });
      expect(auto.legend?.free).toBe(false);
      expect(auto.svg).not.toContain('pp-legend');
      const small = renderPoster({ doc, settings: settings({ theme, legendBox: { x: 0.05, y: 0.05, w: 0.15, h: 0.06 } }), measure });
      const big = renderPoster({ doc, settings: settings({ theme, legendBox: { x: 0.05, y: 0.05, w: 0.4, h: 0.2 } }), measure });
      expect(small.legend).toEqual({ x: expect.closeTo(0.05), y: expect.closeTo(0.05), w: expect.closeTo(0.15), h: expect.closeTo(0.06), free: true });
      expect(small.svg).toContain('class="pp-legend"');
      const sizeOf = (svg: string) => Number(/class="pp-legend".*?font-size="([\d.]+)"/.exec(svg)?.[1]);
      expect(sizeOf(big.svg)).toBeGreaterThan(sizeOf(small.svg));
      // Each family once: in the box, not under or beside the tree as well.
      const label = /class="pp-legend".*?<text[^>]*>([^<]+)</.exec(small.svg)![1];
      const count = (svg: string) => svg.split(`>${label}<`).length - 1;
      expect(count(small.svg)).toBe(count(auto.svg));
    }
  });

  it('packs families together on request, never making the cards smaller, without generation numbers', () => {
    const wide = wideFamily(7);
    for (const paper of ['A4', 'A3']) {
      const base = settings({ paper, orientation: 'portrait', showGenerations: true, centerId: undefined });
      const plain = renderPoster({ doc: wide, settings: base, measure });
      const packed = renderPoster({ doc: wide, settings: { ...base, packFamilies: true }, measure });
      expect(packed.namePt).toBeGreaterThanOrEqual(plain.namePt);
      expect(packed.people).toBe(plain.people);
      expect(plain.svg).toMatch(/>I<\/text>/);
      expect(packed.svg).not.toMatch(/>I<\/text>/);
    }
  });

  it('prints cards without emblems narrower, the family in the band along the top', () => {
    for (const theme of ['heirloom', 'heraldic', 'modern']) {
      const withEmblems = renderPoster({ doc, settings: settings({ theme }), measure });
      const without = renderPoster({ doc, settings: settings({ theme, showEmblems: false }), measure });
      expect(without.namePt).toBeGreaterThanOrEqual(withEmblems.namePt);
      // The initials were only ever in the emblem.
      const initials = withEmblems.svg.match(/font-weight="700"[^>]*>[A-ZÁ-Ž?]{1,3}</g)?.length ?? 0;
      const left = without.svg.match(/font-weight="700"[^>]*>[A-ZÁ-Ž?]{1,3}</g)?.length ?? 0;
      expect(left).toBeLessThan(initials);
    }
  });

  it("gives the tree the room of the families' names once they are moved", () => {
    // Six generations, one couple each: the height decides the size.
    const b = new DocBuilder();
    for (let g = 0; g < 6; g++) {
      b.person(`A${g}`, `Adam${g}`, 'Line', 'male');
      b.person(`B${g}`, `Beth${g}`, `Wife${g}`, 'female');
      if (g) b.family(`F${g}`, [`A${g - 1}`, `B${g - 1}`], [`A${g}`]);
    }
    const deep = b.build('Deep');
    const base = settings({ theme: 'heraldic', orientation: 'landscape' });
    const below = renderPoster({ doc: deep, settings: base, measure });
    const moved = renderPoster({ doc: deep, settings: { ...base, legendBox: { x: 0.02, y: 0.02, w: 0.2, h: 0.1 } }, measure });
    expect(moved.namePt).toBeGreaterThan(below.namePt);
  });

  it('keeps the title in proportion to the names, and says how big a card is', () => {
    const result = renderPoster({ doc, settings: settings({ paper: 'A0', theme: 'heraldic' }), measure });
    const escaped = doc.meta.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const title = Number(new RegExp(`font-size="([\\d.]+)"[^>]*>${escaped}<`).exec(result.svg)?.[1]);
    // The names' size on the page, in its units (namePt is in points).
    const nameSize = result.namePt / 0.75;
    expect(title).toBeGreaterThan(0);
    expect(title).toBeLessThan(nameSize * 4);
    expect(result.cardMm.w).toBeGreaterThan(result.cardMm.h);
    expect(result.cardMm.h).toBeGreaterThan(0);
  });

  it('prints a smaller part of the tree bigger', () => {
    const all = renderPoster({ doc, settings: settings(), measure });
    const close = renderPoster({ doc, settings: settings({ ancestors: 1, descendants: 1, branches: 0 }), measure });
    expect(close.people).toBeLessThan(all.people);
    expect(close.namePt).toBeGreaterThan(all.namePt);
  });
});

describe('PDF', () => {
  it('writes a valid one-page file around the image', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const blob = pdfFromJpeg(jpeg, 10, 20, 595.3, 841.9, 'Rodokmen Nováků');
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 595.3 841.9]');
    expect(text).toContain('/Width 10 /Height 20');
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
