import { LayoutConnector, LayoutPass, LayoutUnion, Pt } from './layout-types';
import { connectorPaths, unionLabelPoint, unionLinePath } from './paths';

/** The straight pieces of a path ('M', 'L' and the ends of curves), as segments. */
function straightSegments(d: string): { from: Pt; to: Pt }[] {
  const out: { from: Pt; to: Pt }[] = [];
  let at: Pt = { x: 0, y: 0 };
  for (const [, cmd, args] of d.matchAll(/([MLCQ])([^MLCQ]*)/g)) {
    const nums = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const end = { x: nums[nums.length - 2], y: nums[nums.length - 1] };
    if (cmd === 'L') out.push({ from: at, to: end });
    at = end;
  }
  return out;
}

const horizontal = (s: { from: Pt; to: Pt }) => Math.abs(s.to.y - s.from.y) < 0.5 && Math.abs(s.to.x - s.from.x) > 0.5;

describe('line paths', () => {
  // A family whose second child stands two rows down, past a row with other people in it.
  const connector: LayoutConnector = {
    familyId: 'F',
    stem: { x: 100, y: 40 },
    clearY: 70,
    barY: 109,
    drops: [
      { childId: 'A', relation: 'biological', x: 40, points: [{ x: 40, y: 148 }] },
      {
        childId: 'B',
        relation: 'biological',
        x: 260,
        points: [
          { x: 260, y: 257 },
          { x: 330, y: 257 },
          { x: 330, y: 296 },
        ],
        through: [{ x: 260, from: 148, to: 218 }],
      },
    ],
  };

  it('draws square lines along the bar, with rounded corners', () => {
    const [, far] = connectorPaths(connector, 'square');
    expect(straightSegments(far.d).some(horizontal)).toBe(true);
  });

  it('draws curved lines as one spline each, straight only through the rows they pass', () => {
    for (const p of connectorPaths(connector, 'curved')) {
      expect(straightSegments(p.d).some(horizontal), p.d).toBe(false);
      expect(p.d).toContain('C');
    }
    const [, far] = connectorPaths(connector, 'curved');
    // Straight down between the cards of the row it passes, and into the child's card from above.
    expect(far.d).toContain('L260,218');
    expect(far.d.endsWith('330,296')).toBe(true);
  });

  it('sweeps a curved line through a row where nothing stands under it', () => {
    const pass = (flags: Partial<LayoutPass>): LayoutConnector => ({
      ...connector,
      drops: [connector.drops[0], { ...connector.drops[1], through: [{ x: 260, from: 148, to: 218, ...flags }] }],
    });
    // Free on both sides: one curve from the parents to the child.
    const both = connectorPaths(pass({ clearAbove: true, clearBelow: true }), 'curved')[1].d;
    expect(both).not.toContain('260,');
    expect(both.endsWith('330,296')).toBe(true);
    // Free only above: the curve comes down through the row to the bottom of the pass, then on.
    const above = connectorPaths(pass({ clearAbove: true }), 'curved')[1].d;
    expect(above).toContain('260,218');
    expect(above).not.toContain('260,148');
    // Free only below: straight to the top of the pass, then one curve through the row to the child.
    const below = connectorPaths(pass({ clearBelow: true }), 'curved')[1].d;
    expect(below).toContain('260,148');
    expect(below).not.toContain('L260,218');
    // Square lines keep their route.
    expect(connectorPaths(pass({ clearAbove: true, clearBelow: true }), 'square')[1].d).toBe(connectorPaths(connector, 'square')[1].d);
  });

  it('arches the line of partners with someone between them, when lines are curved', () => {
    const bridge: LayoutUnion = {
      familyId: 'F2',
      mode: 'bridge',
      kind: 'marriage',
      ended: false,
      cx: 380,
      cy: 35,
      rank: 0,
      line: [
        { x: 100, y: 0 },
        { x: 100, y: -15 },
        { x: 380, y: -15 },
        { x: 380, y: 35 },
        { x: 400, y: 35 },
      ],
    };
    const square = unionLinePath(bridge);
    const curved = unionLinePath(bridge, 'curved');
    expect(square).not.toContain('C');
    expect(curved.startsWith('M100,0C')).toBe(true);
    expect(straightSegments(curved).some((s) => horizontal(s) && s.from.y < 0)).toBe(false);
    // It still comes down beside the partner and runs on to their card.
    expect(curved.endsWith('L380,35L400,35')).toBe(true);
  });

  it('puts the note about a couple right under their marker', () => {
    const gap: LayoutUnion = { familyId: 'F', mode: 'gap', kind: 'marriage', ended: false, cx: 200, cy: 35, rank: 0, line: [] };
    expect(unionLabelPoint(gap)).toEqual({ x: 200, y: 48 });
    const split: LayoutUnion = {
      ...gap,
      mode: 'split',
      line: [
        { x: 100, y: 35 },
        { x: 300, y: 183 },
      ],
    };
    expect(unionLabelPoint(split)).toEqual({ x: 200, y: 122 });
    expect(unionLabelPoint({ ...gap, mode: 'single' })).toBeNull();
  });
});
