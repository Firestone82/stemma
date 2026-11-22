/** How many numbers each SVG path command takes, and which of them are x and y coordinates (for absolute commands). */
const SHAPES: Record<string, { n: number; x: number[]; y: number[] }> = {
  M: { n: 2, x: [0], y: [1] },
  L: { n: 2, x: [0], y: [1] },
  T: { n: 2, x: [0], y: [1] },
  H: { n: 1, x: [0], y: [] },
  V: { n: 1, x: [], y: [0] },
  C: { n: 6, x: [0, 2, 4], y: [1, 3, 5] },
  S: { n: 4, x: [0, 2], y: [1, 3] },
  Q: { n: 4, x: [0, 2], y: [1, 3] },
  A: { n: 7, x: [5], y: [6] },
  Z: { n: 0, x: [], y: [] },
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * An SVG path moved by dx,dy, written out again: the same shape, drawn without a transform. A transform on each
 * small part of every card splits the chart into many pieces the browser has to put back together at every frame
 * of a drag or zoom; plain coordinates keep it one piece.
 */
export function shiftPath(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let out = '';
  let i = 0;
  let first = true;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    const shape = SHAPES[upper];
    if (!shape) throw new Error(`Unknown path command ${cmd}`);
    out += cmd;
    // A relative command moves from where the pen is, so only the absolute ones (and a path's opening m) shift.
    const absolute = cmd === upper || (first && upper === 'M');
    const firstMoveRelative = first && cmd === 'm';
    first = false;
    if (!shape.n) continue;
    let group = 0;
    while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
      const nums = tokens.slice(i, i + shape.n).map(Number);
      i += shape.n;
      // After a relative m's first pair, the pairs that follow are relative lines.
      if (absolute && !(firstMoveRelative && group > 0)) {
        for (const k of shape.x) nums[k] = r2(nums[k] + dx);
        for (const k of shape.y) nums[k] = r2(nums[k] + dy);
      }
      out += (group ? ' ' : '') + nums.join(',');
      group++;
    }
  }
  return out;
}
