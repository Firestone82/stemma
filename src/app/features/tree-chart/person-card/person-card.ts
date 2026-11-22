import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CardDesign, CardParts, accentOf, cardLines, ribbonPath } from '../../../core/card/card-design';
import { Tincture } from '../../../core/colors/tinctures';
import { LayoutCard } from '../../../core/layout/types';
import { I18n } from '../../../i18n/i18n';
import { CardLabel } from '../../../state/chart-model';
import { placePath } from '../svg-path';

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

  /**
   * Where the card's top left corner stands on the chart. Everything on the card is drawn at its place on the chart
   * rather than moved there by a transform: every transform splits the chart into more pieces for the browser to
   * put back together at each frame of a drag or a zoom.
   */
  protected readonly at = computed(
    () => {
      const c = this.card();
      return { x: round(c.x), y: round(c.y) };
    },
    { equal: (a, b) => a.x === b.x && a.y === b.y },
  );
  /** Where each line of text stands on this card. */
  protected readonly lines = computed(() => cardLines(this.design(), this.parts(), { birth: !!this.label().birth }));
  protected readonly accent = computed(() => (this.parts().sexAccent ? accentOf(this.label().sex) : undefined));
  /** The band down the left edge, rounded with the card's corners. */
  protected readonly accentPath = computed(() => {
    const d = this.design();
    const h = this.card().h;
    const r = d.radius;
    const { x, y } = this.at();
    return `M${x + r},${y}h${d.accent - r}v${h}h${r - d.accent}q${-r},0 ${-r},${-r}v${2 * r - h}q0,${-r} ${r},${-r}z`;
  });
  /** The ribbon across the top right corner, for this card's width. */
  protected readonly ribbon = computed(() => {
    const { x, y } = this.at();
    return placePath(ribbonPath(this.design(), this.card().w), x, y);
  });
  /** Whether the card shows the ribbon: the mark for someone kept off prints then stands clear of it. */
  protected readonly mourning = computed(() => this.ribbons() && this.label().deceased);
  protected readonly shieldPath = computed(() => {
    const s = this.design().shield;
    const { x, y } = this.at();
    return s ? placePath(s.path, x + s.x, y + s.y) : '';
  });
  protected readonly badgeMark = computed(() => {
    const b = this.design().badge;
    const { x, y } = this.at();
    return placePath(b.mark, x + b.x, y + b.y);
  });
  /** The crossed out printer of someone kept off prints, clear of the ribbon. */
  protected readonly noPrintMark = computed(() => {
    const d = this.design();
    const { x, y } = this.at();
    return placePath(NO_PRINT_MARK, x + this.card().w - (this.mourning() ? 30 + d.ribbonBand.to : 30), y + 4);
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
