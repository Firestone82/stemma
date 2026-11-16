import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CardDesign, CardParts, accentOf, cardLines } from '../../../core/card/card-design';
import { Tincture } from '../../../core/colors/tinctures';
import { LayoutCard } from '../../../core/layout/types';
import { I18n } from '../../../i18n/i18n';
import { CardLabel } from '../../../state/chart-model';

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
  /** A ribbon across the corner of someone who has died. */
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

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
