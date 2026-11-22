import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CardDesign, CardParts, accentOf, cardLines, ribbonPath } from '../../../core/card/card-design';
import { Tincture } from '../../../core/colors/tinctures';
import { LayoutCard } from '../../../core/layout/types';
import { I18n } from '../../../i18n/i18n';
import { CardLabel } from '../../../state/chart-model';
import { shiftPath } from '../svg-path';

/**
 * One person on the chart, drawn as SVG inside the chart's <svg>: the same card as on prints (see
 * core/card/card-design), in the chart's colours.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg> (or on a <button>), so an attribute selector
  selector: 'g[stemmaCard]',
  templateUrl: './person-card.html',
  styleUrl: './person-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'card',
    role: 'button',
    tabindex: '0',
    '[attr.transform]': 'transform()',
    '[attr.data-person]': 'card().personId',
    '[attr.data-tincture]': 'tincture()',
    '[attr.data-sex]': 'label().sex',
    '[attr.aria-label]': 'label().title',
    '[attr.aria-pressed]': 'selected()',
    '[class.deceased]': 'label().deceased',
    '[class.unknown]': 'label().unknown',
    '[class.ghost]': '!!card().ghost',
    '[class.focus]': 'focus()',
    '[class.tinted]': 'parts().sexAccent',
    '(click)': 'pick.emit($event)',
    '(keydown.enter)': 'pick.emit($event)',
    '(keydown.space)': 'onSpace($event)',
  },
})
export class PersonCard {
  protected readonly t = inject(I18n).t;

  readonly card = input.required<LayoutCard>();
  readonly label = input.required<CardLabel>();
  readonly tincture = input.required<Tincture>();
  readonly design = input.required<CardDesign>();
  readonly parts = input.required<CardParts>();
  readonly selected = input(false);
  /** The person the tree is centred on. */
  readonly focus = input(false);
  /** A ribbon across the top right corner of someone who has died. */
  readonly ribbons = input(true);
  readonly pick = output<Event>();

  protected readonly transform = computed(() => {
    const c = this.card();
    return `translate(${round(c.x)},${round(c.y)})`;
  });
  /** Where each line of text stands on this card. */
  protected readonly lines = computed(() => cardLines(this.design(), this.parts(), { birth: !!this.label().birth }));
  protected readonly accent = computed(() => (this.parts().sexAccent ? accentOf(this.label().sex) : undefined));
  /** The band down the left edge, rounded with the card's corners. */
  protected readonly accentPath = computed(() => {
    const d = this.design();
    const h = this.card().h;
    const r = d.radius;
    return `M${r},0H${d.accent}V${h}H${r}Q0,${h} 0,${h - r}V${r}Q0,0 ${r},0Z`;
  });
  /** The ribbon across the top right corner, for this card's width. */
  protected readonly ribbon = computed(() => ribbonPath(this.design(), this.card().w));
  /** Whether the card shows the ribbon: the mark for someone kept off prints then stands clear of it. */
  protected readonly mourning = computed(() => this.ribbons() && this.label().deceased);
  /**
   * The shield and the badge, drawn where they stand on the card rather than moved there by a transform: every
   * transform splits the chart into more pieces for the browser to put together at each frame of a drag or zoom.
   */
  protected readonly marks = computed(() => {
    const d = this.design();
    return { shield: d.shield ? shiftPath(d.shield.path, d.shield.x, d.shield.y) : '', badge: shiftPath(d.badge.mark, d.badge.x, d.badge.y) };
  });
  /** The crossed out printer of someone kept off prints, clear of the ribbon. */
  protected readonly noPrintMark = computed(() => {
    const d = this.design();
    return shiftPath(NO_PRINT_MARK, this.card().w - (this.mourning() ? 30 + d.ribbonBand.to : 30), 4);
  });
  protected readonly flag = computed<'problem' | 'missing' | null>(() => {
    const l = this.label();
    if (this.card().ghost) return null;
    return l.problem ? 'problem' : l.missing ? 'missing' : null;
  });

  protected onSpace(event: Event): void {
    event.preventDefault();
    this.pick.emit(event);
  }
}

const NO_PRINT_MARK =
  'M4.2 5.1V2.4h6v2.7M4.2 10.2H3a.9.9 0 0 1-.9-.9V6a.9.9 0 0 1 .9-.9h8.4a.9.9 0 0 1 .9.9v3.3a.9.9 0 0 1-.9.9h-1.2M4.2 8.4h6V12h-6zM2.1 2.1l10.2 10.2';

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
