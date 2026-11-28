import { palette } from './heritage';
import { Rect } from './poster-types';
import { el, n } from './svg';

interface EdgePlacement {
  box: Rect;
  scale: number;
  reverse: boolean;
}

const TREE_W = 136;
const TREE_H = 224;
const FOOT_W = 274;
const FOOT_H = 66;

/** Place fine branch linework along the open sides and foot of the page. */
export function drawBotanicalBorder(area: Rect, occupied: readonly Rect[], lettering: readonly Rect[]): string {
  const short = Math.min(area.w, area.h);
  if (short <= 0) return '';
  const stops = [0, 1, 0.5, 0.25, 0.75, 0.125, 0.875, 0.375, 0.625, 0.0625, 0.1875, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375];
  const obstacles = [...occupied, ...lettering];
  const choose = (candidates: readonly EdgePlacement[]) =>
    candidates.reduce<EdgePlacement | undefined>((best, at) => (!best || at.scale > best.scale ? at : best), undefined);
  const place = (box: Rect, scale: number, reverse: boolean, reserved: readonly Rect[] = []): EdgePlacement[] => {
    const buffer = short * 0.012;
    const padded = { x: box.x - buffer, y: box.y - buffer, w: box.w + buffer * 2, h: box.h + buffer * 2 };
    if (obstacles.some((r) => overlaps(padded, r)) || reserved.some((r) => overlaps(padded, r))) return [];
    return [{ box, scale, reverse }];
  };

  const tree = choose(
    [0.42, 0.34, 0.27, 0.2, 0.15].flatMap((fraction) => {
      const scale = (fraction * short) / TREE_H;
      const w = TREE_W * scale;
      const h = TREE_H * scale;
      return [false, true].flatMap((reverse) =>
        stops.flatMap((stop) => {
          const x = area.x + (reverse ? area.w - w : 0);
          const y = area.y + (area.h - h) * (0.12 + stop * 0.88);
          return place({ x, y, w, h }, scale, reverse);
        }),
      );
    }),
  );
  const foot = (blockers: readonly Rect[]) =>
    [0.59, 0.46, 0.34, 0.26, 0.19].flatMap((fraction) => {
      const scale = (fraction * short) / FOOT_W;
      const w = FOOT_W * scale;
      const h = FOOT_H * scale;
      return stops.flatMap((stop) => {
        const x = area.x + (area.w - w) * stop;
        const y = area.y + area.h - h;
        return place({ x, y, w, h }, scale, stop > 0.5, blockers);
      });
    });
  const treeBoxes = tree ? [tree.box] : [];
  const first = choose(foot(treeBoxes));
  const second = first && choose(foot([...treeBoxes, first.box]));
  return (
    (tree ? inkAt(tree, 'edge-branch', sideBranch()) : '') +
    (first ? inkAt(first, 'footer-branch', footBranch()) : '') +
    (second ? inkAt(second, 'footer-branch', footBranch(true)) : '')
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inkAt(at: EdgePlacement, subject: string, drawing: string): string {
  const { x, y, w } = at.box;
  return el(
    'g',
    {
      class: 'pp-decoration pp-decoration-border',
      'data-decoration': subject,
      transform: `translate(${n(x + (at.reverse ? w : 0))},${n(y)}) scale(${at.reverse ? -at.scale : at.scale},${at.scale})`,
      fill: 'none',
      stroke: palette.muted,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0.35,
      'pointer-events': 'none',
      'aria-hidden': 'true',
    },
    drawing,
  );
}

function sideBranch(): string {
  return (
    el('path', {
      d:
        'M0,221C11,194 9,165 30,135C49,106 79,73 98,55C108,45 115,31 117,16' +
        'M31,133C51,116 70,120 90,112Q111,103 129,87M55,101C64,84 65,63 58,47Q53,38 47,32',
      'stroke-width': 1.8,
    }) +
    el('path', {
      d:
        'M0,188Q10,164 24,153Q37,143 55,140M63,77Q69,50 82,39M73,114Q84,103 90,91' +
        'M99,106Q117,107 132,98M87,65Q101,64 112,56M108,44Q109,32 105,24M32,133Q34,117 28,107',
      'stroke-width': 1.06,
    }) +
    el('path', {
      d:
        'M47,32Q38,27 39,18Q48,22 47,32ZM82,39Q81,27 91,23Q94,32 82,39ZM117,16Q115,7 124,4Q127,13 117,16Z' +
        'M129,87Q124,79 132,73Q136,81 129,87ZM90,91Q87,82 96,78Q98,87 90,91ZM55,140Q58,131 68,133Q64,141 55,140Z',
      'stroke-width': 0.9,
      opacity: 0.74,
    })
  );
}

function footBranch(alternate = false): string {
  const d = alternate
    ? 'M3,64C55,61 100,48 153,47Q207,47 252,22M62,57Q88,49 104,32M118,49Q151,37 162,24M145,48Q171,55 193,51M200,42Q212,27 227,16'
    : 'M1,65C40,58 83,63 131,46C169,33 212,37 264,13M63,59Q87,49 103,35M117,50Q145,53 164,44M149,41Q172,33 185,19M211,30Q229,33 242,27';
  const leaves = alternate
    ? 'M104,32Q104,24 113,21Q114,30 104,32ZM162,24Q161,17 169,14Q171,22 162,24ZM227,16Q228,8 237,7Q235,15 227,16Z'
    : 'M103,35Q103,26 111,23Q113,31 103,35ZM185,19Q185,11 194,8Q195,17 185,19ZM264,13Q264,5 272,3Q273,11 264,13Z';
  return el('path', { d, 'stroke-width': 1.22 }) + el('path', { d: leaves, 'stroke-width': 0.9, opacity: 0.74 });
}
