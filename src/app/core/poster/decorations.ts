import { Pt } from '../layout/types';
import { palette } from './heritage';
import { Rect } from './poster-types';
import { el, n } from './svg';

interface Decoration extends Pt {
  radius: number;
}

const rotations = [-12, 25, -9, -30, 14, 18, 22];

/** Place small botanical accents in the gaps left by the final chart and lettering. */
export function drawDecorations(area: Rect, occupied: readonly Rect[], lettering: readonly Rect[], cards: { count: number; width: number }): string {
  const short = Math.min(area.w, area.h);
  if (short <= 0) return '';
  const gap = short * 0.012;
  const minVisible = short * 0.017;
  const minRadius = short * 0.032;
  const maxRadius = Math.min(short * 0.072, Math.max(short * 0.028, cards.width * 0.86));
  const limit = Math.min(rotations.length, 2 + Math.floor(cards.count / 24));
  const columns = Math.min(48, Math.ceil((area.w / short) * 18));
  const rows = Math.min(48, Math.ceil((area.h / short) * 18));
  const candidates: Decoration[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const dx = ((col + 0.5) / columns) * area.w;
      const dy = ((row + 0.5) / rows) * area.h;
      const at = { x: area.x + dx, y: area.y + dy };
      const edge = Math.min(dx, dy, area.w - dx, area.h - dy);
      const paperClearance = clearance(at, lettering, edge) - gap;
      if (paperClearance < minVisible) continue;
      const radius = clearance(at, occupied, paperClearance + gap) - gap;
      if (radius >= minVisible) candidates.push({ ...at, radius });
    }
  }
  candidates.sort((a, b) => b.radius - a.radius);
  const first = candidates[0];
  if (!first) return '';
  if (first.radius < minRadius) {
    return ornament(first, 'watermark', -12);
  }

  const accents: Decoration[] = [];
  for (const at of candidates) {
    if (at.radius < minRadius || accents.length === limit) break;
    // Prefer a different pocket over adding another accent next to the first one in a wide gap.
    if (accents.some((other) => Math.hypot(at.x - other.x, at.y - other.y) < Math.max(short * 0.24, Math.min(short * 0.34, other.radius)))) continue;
    accents.push(at);
  }
  return accents.map((at, i) => ornament({ ...at, radius: Math.min(at.radius, maxRadius * 0.84) }, 'ornament', rotations[i])).join('');
}

/** Distance to the nearest obstacle, capped by the space left at the edge of the sheet. */
function clearance(at: Pt, obstacles: readonly Rect[], limit: number): number {
  let best = limit * limit;
  for (const { x, y, w, h } of obstacles) {
    const dx = Math.max(0, x - at.x, at.x - x - w);
    const dy = Math.max(0, y - at.y, at.y - y - h);
    best = Math.min(best, dx * dx + dy * dy);
    if (best === 0) break;
  }
  return Math.sqrt(best);
}

function ornament(at: Decoration, kind: 'ornament' | 'watermark', angle: number): string {
  return el(
    'g',
    {
      class: `pp-decoration pp-decoration-${kind}`,
      transform: `translate(${n(at.x)},${n(at.y)}) scale(${at.radius / 50}) rotate(${angle})`,
      opacity: kind === 'watermark' ? 0.17 : 0.3,
      'pointer-events': 'none',
      'aria-hidden': 'true',
    },
    el('path', {
      d:
        'M-43,18C-13,17 12,8 34,-18M-20,14Q-17,3 -7,-4M-3,10Q7,19 20,15M14,1Q18,-12 16,-23M24,-8Q33,-6 42,-14' +
        'M-7,-4Q-7,-12 1,-14Q2,-6 -7,-4ZM16,-23Q10,-28 14,-34Q20,-31 16,-23ZM34,-18Q34,-25 40,-27Q42,-21 34,-18Z',
      fill: 'none',
      stroke: palette.muted,
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
    }),
  );
}
