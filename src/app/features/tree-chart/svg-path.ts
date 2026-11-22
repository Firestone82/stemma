/** How many numbers each SVG path command takes. */
const ARITY: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A path as where it starts and the rest of it drawn from there: moving it only changes the start. */
interface Placeable {
  x: number;
  y: number;
  rest: string;
}

const cache = new Map<string, Placeable>();

/**
 * The SVG path `d` moved by dx,dy, drawn without a transform. Each transform on the chart (one on every card, every
 * shield, every badge) splits it into more pieces that the browser puts back together at each frame of a drag or a
 * zoom; plain coordinates keep the chart in few pieces. The path is turned into one drawn from its start once
 * (and remembered), so moving it is cheap enough for every frame of a glide.
 */
export function placePath(d: string, dx: number, dy: number): string {
  let p = cache.get(d);
  if (!p) {
    p = relative(d);
    if (cache.size > 500) cache.clear();
    cache.set(d, p);
  }
  return `M${r3(p.x + dx)},${r3(p.y + dy)}${p.rest}`;
}

/** The path drawn with relative commands after its opening move. */
function relative(d: string): Placeable {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let start: { x: number; y: number } | null = null;
  let rest = '';
  const num = () => Number(tokens[i++]);
  const more = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const up = cmd.toUpperCase();
    const n = ARITY[up];
    if (n === undefined) throw new Error(`Unknown path command ${cmd}`);
    const abs = cmd === up;
    if (up === 'Z') {
      rest += 'z';
      cx = sx;
      cy = sy;
      continue;
    }
    let first = true;
    do {
      const v = Array.from({ length: n }, num);
      // Every coordinate pair, relative to where the pen is before this segment.
      const ox = abs ? cx : 0;
      const oy = abs ? cy : 0;
      let out: number[];
      let ex: number;
      let ey: number;
      if (up === 'H') {
        out = [v[0] - ox];
        ex = cx + out[0];
        ey = cy;
      } else if (up === 'V') {
        out = [v[0] - oy];
        ex = cx;
        ey = cy + out[0];
      } else if (up === 'A') {
        out = [v[0], v[1], v[2], v[3], v[4], v[5] - ox, v[6] - oy];
        ex = cx + out[5];
        ey = cy + out[6];
      } else {
        out = v.map((x, k) => x - (k % 2 ? oy : ox));
        ex = cx + out[n - 2];
        ey = cy + out[n - 1];
      }
      if (up === 'M' && first) {
        if (!start) start = { x: ex, y: ey };
        else rest += `m${out.map(r3).join(',')}`;
        sx = ex;
        sy = ey;
      } else {
        // The pairs after a move are lines.
        const c = up === 'M' ? 'l' : up.toLowerCase();
        rest += `${first || up === 'M' ? c : ' '}${out.map(r3).join(',')}`;
      }
      cx = ex;
      cy = ey;
      first = false;
    } while (more());
  }
  return { x: start?.x ?? 0, y: start?.y ?? 0, rest };
}
