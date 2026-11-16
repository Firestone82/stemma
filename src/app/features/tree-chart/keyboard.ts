/** Keys on the chart: zooming, showing everything, and moving between relatives with the arrows. */
import { LayoutCard } from '../../core/layout/types';
import { TreeIndex } from '../../core/model/tree-index';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type ChartKey = { kind: 'zoom'; factor: number } | { kind: 'fit' } | { kind: 'move'; direction: Direction } | null;

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** What a key press on the chart asks for; null for keys the chart leaves alone (and inside form fields). */
export function chartKey(e: KeyboardEvent): ChartKey {
  const target = e.target as Element | null;
  if (target?.closest?.('input, textarea, select, stemma-quick-add')) return null;
  if (e.key === '+' || e.key === '=') return { kind: 'zoom', factor: 1.25 };
  if (e.key === '-' || e.key === '_') return { kind: 'zoom', factor: 0.8 };
  if (e.key === '0' || e.key.toLowerCase() === 'f') return { kind: 'fit' };
  const direction = ARROWS[e.key];
  return direction ? { kind: 'move', direction } : null;
}

/** The person to move to: a parent going up, the nearest child going down, the nearest card to the left or right sideways. */
export function neighbour(index: TreeIndex, cards: readonly LayoutCard[], id: string, direction: Direction): string | undefined {
  const me = cards.find((c) => c.personId === id && !c.ghost);
  if (!me) return undefined;
  // Only people on the chart: the Relatives setting may leave a parent out.
  if (direction === 'up') return index.parents(id).find((p) => cards.some((c) => c.personId === p.id && !c.ghost))?.id;
  if (direction === 'down') {
    const kids = index
      .children(id)
      .map((p) => cards.find((c) => c.personId === p.id && !c.ghost))
      .filter((c): c is LayoutCard => !!c);
    kids.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x));
    return kids[0]?.personId;
  }
  // Sideways: the nearest card on that side, one at about the same height before one far above or below.
  const sign = direction === 'left' ? -1 : 1;
  let best: LayoutCard | undefined;
  let bestCost = Infinity;
  for (const c of cards) {
    const dx = (c.x - me.x) * sign;
    if (c === me || c.ghost || dx <= 0) continue;
    const cost = dx + Math.abs(c.y - me.y) * 4;
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best?.personId;
}
