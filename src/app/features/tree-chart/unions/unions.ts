import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { roundedPath } from '../../../core/layout/lines';
import { LayoutResult } from '../../../core/layout/types';
import { UnionMark, unionMark } from '../../../core/layout/union-marks';
import { placePath } from '../svg-path';
import { RelationshipStatus, relationshipStatus } from '../../../core/model/relationship';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';

const STATUS_TITLE: Record<RelationshipStatus, MessageKey> = {
  married: 'chart.union.married',
  engaged: 'chart.union.engaged',
  partners: 'chart.union.partners',
  separated: 'chart.union.separated',
  divorced: 'chart.union.divorced',
  annulled: 'chart.union.annulled',
  widowed: 'chart.union.widowed',
  ended: 'chart.union.ended',
  unknown: 'chart.union.unknown',
};

/** Size of the rings in the marker between partners. */
const RING_RADIUS = 4.6;

/**
 * Couples: the line between partners and the marker on it (interlocked rings for a marriage, one ring for
 * partners, a ring with a stone for an engagement; rings apart, with a slash for a divorce, when the couple
 * broke up). What the marker means is in its tooltip. The shapes come from core/layout/union-marks.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg> (or on a <button>), so an attribute selector
  selector: 'g[stemmaUnions]',
  templateUrl: './unions.html',
  styleUrl: './unions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Unions {
  private readonly store = inject(TreeStore);
  private readonly i18n = inject(I18n);

  readonly layout = input.required<LayoutResult>();
  /** In a family view of several families: couples whose line can be clicked, with what the click does as the tooltip. */
  readonly cuts = input<ReadonlyMap<string, string>>(new Map());
  /** A couple was clicked (its family id). */
  readonly pick = output<string>();
  /** The line between a couple was clicked to take a family out of the view (its family id). */
  readonly takeOut = output<string>();

  protected readonly unions = computed(() => {
    const index = this.store.index();
    const t = this.i18n.t;
    return this.layout().unions.map((u) => {
      const fam = index.family(u.familyId);
      const status: RelationshipStatus = fam ? relationshipStatus(fam) : 'unknown';
      return {
        familyId: u.familyId,
        d: roundedPath(u.line, 6),
        at: { x: u.x, y: u.y },
        mark: placed(unionMark(fam?.kind ?? 'unknown', status, RING_RADIUS), u.x, u.y),
        title: `${t(STATUS_TITLE[status])} ${t('chart.union.select')}`,
      };
    });
  });

  protected onCut(familyId: string, event: Event): void {
    event.stopPropagation();
    this.takeOut.emit(familyId);
  }

  protected onPick(familyId: string, event: Event): void {
    event.stopPropagation();
    this.pick.emit(familyId);
  }
}

/**
 * A couple's marker drawn at its place on the chart rather than moved there by a transform, which would split the
 * chart into more pieces for the browser to put back together at each frame of a drag or a zoom.
 */
function placed(m: UnionMark, x: number, y: number): UnionMark {
  return {
    ...m,
    plate: { ...m.plate, x: m.plate.x + x, y: m.plate.y + y },
    rings: m.rings.map((r) => ({ ...r, cx: r.cx + x, cy: r.cy + y })),
    stone: m.stone ? placePath(m.stone, x, y) : m.stone,
    slash: m.slash ? placePath(m.slash, x, y) : m.slash,
  };
}
