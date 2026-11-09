import { computeLayout } from './layout';
import { LayoutOptions, LayoutResult } from './layout-types';

/** The generation (0 = the oldest) whose row takes the most width, among those not yet drawn in two tiers. */
export function widestRow(layout: LayoutResult, except: readonly number[]): number | undefined {
  let best: number | undefined;
  let bestWidth = 0;
  layout.rows.forEach((row, generation) => {
    if (except.includes(generation)) return;
    const cards = layout.cards.filter((c) => c.rank === row.rank);
    if (cards.length < 4) return;
    const width = Math.max(...cards.map((c) => c.x + c.w)) - Math.min(...cards.map((c) => c.x));
    if (width > bestWidth) {
      bestWidth = width;
      best = generation;
    }
  });
  return best;
}

/**
 * A layout for the screen with the widest generations drawn in two tiers, as
 * long as the tree is much wider than it is tall (more than `ratio` times) and
 * each stacking narrows it enough to be worth the height. The rows are tried
 * widest first, at most `attempts` of them.
 */
export function tallLayout(
  doc: Parameters<typeof computeLayout>[0],
  options: LayoutOptions,
  hint: Parameters<typeof computeLayout>[2],
  widths: Parameters<typeof computeLayout>[3],
  ratio = 1.6,
  attempts = 4,
): LayoutResult {
  let layout = computeLayout(doc, { ...options, tierGenerations: undefined }, hint, widths);
  const tiers: number[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { w, h } = layout.bounds;
    if (w <= h * ratio) break;
    const widest = widestRow(layout, tiers);
    if (widest === undefined) break;
    const trial = computeLayout(doc, { ...options, tierGenerations: [...tiers, widest] }, hint, widths);
    // Worth it when the tree gets narrower by more than it gets taller, in proportion.
    if (trial.bounds.w / trial.bounds.h >= (w / h) * 0.92) break;
    layout = trial;
    tiers.push(widest);
  }
  return layout;
}
