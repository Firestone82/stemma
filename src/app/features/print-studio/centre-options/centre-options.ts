import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GAP_PERCENT } from '../../../core/model/types';
import { LAYOUT, TIGHT_LAYOUT } from '../../../core/layout/types';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { Icon } from '../../../shared/icon/icon';
import { SearchOption, SearchSelect } from '../../../shared/search-select/search-select';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

type ArrangeKey = 'tight' | 'fill' | 'stackCouples' | 'amidPartners';

const ARRANGEMENT: readonly { key: ArrangeKey; label: MessageKey; hint: MessageKey }[] = [
  { key: 'tight', label: 'print.tight', hint: 'print.tightHint' },
  { key: 'fill', label: 'print.fill', hint: 'print.fillHint' },
  { key: 'stackCouples', label: 'print.stackCouples', hint: 'print.stackCouplesHint' },
  { key: 'amidPartners', label: 'print.amidPartners', hint: 'print.amidPartnersHint' },
];

/** Who stands in the middle of the page, with which partner, and how the families are arranged around them. */
@Component({
  selector: 'stemma-centre-options',
  imports: [Switch, SearchSelect, Icon],
  templateUrl: './centre-options.html',
  styleUrl: './centre-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-middle' },
})
export class CentreOptions {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly people = computed<SearchOption[]>(() => this.model.people().map((p) => ({ id: p.id, label: p.name, detail: p.dates })));

  protected readonly partners = computed<SearchOption[]>(() => [
    ...this.model.partners().map((p) => ({ id: p.id, label: p.label })),
    { id: '', label: this.t('print.nobody') },
  ]);

  protected readonly range = GAP_PERCENT;

  /**
   * The gap between cards and the room round lines, in hundredths of a card's width; empty for what the page
   * takes (shown in the field), which is less with `tight`.
   */
  protected readonly gaps = computed(() => {
    const s = this.model.settings();
    const base = { ...LAYOUT, ...(s.tight ? TIGHT_LAYOUT : {}) };
    const auto = (v: number) => String(Math.round((v / LAYOUT.cardWidth) * 1000) / 10);
    return [
      { key: 'cardGap' as const, label: 'print.cardGap' as const, value: s.cardGap, auto: auto(base.siblingGap) },
      { key: 'lineGap' as const, label: 'print.lineGap' as const, value: s.lineGap, auto: auto(base.stem) },
    ];
  });

  protected setGap(key: 'cardGap' | 'lineGap', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(',', '.').trim();
    const v = Number(raw);
    this.model.set({ [key]: raw && Number.isFinite(v) ? Math.min(GAP_PERCENT.max, Math.max(GAP_PERCENT.min, v)) : undefined });
  }

  protected readonly arrangement = computed(() => ARRANGEMENT.map((o) => ({ ...o, on: this.model.settings()[o.key] })));

  /** The other arrangements of the tree that come out about as well (when the page has any), to pick between. */
  protected readonly layouts = computed(() => {
    const p = this.model.poster();
    if (!p || p.layouts.length < 2) return [];
    // Cards come out in proportion to the ratio: what the drawn layout gives, scaled to each of the others.
    const base = p.layouts[p.layoutChoice].ratio;
    return p.layouts.map((l, i) => ({
      i,
      percent: Math.round(l.ratio * 100),
      on: i === p.layoutChoice,
      w: Math.round((p.cardMm.w * l.ratio) / base),
      h: Math.round((p.cardMm.h * l.ratio) / base),
    }));
  });

  protected pick(choice: number): void {
    this.model.set({ layoutChoice: choice || undefined });
  }

  protected arrange(key: ArrangeKey, on: boolean): void {
    this.model.set({ [key]: on });
  }

  protected setCenter(id: string): void {
    this.model.chooseMiddle(id);
  }

  protected setPartner(id: string): void {
    this.model.set({ partnerId: id ? id : null });
  }

  protected readonly middleName = computed(() => this.model.nameOf(this.model.centerId()));

  /** The partner goes to the middle, and the person in the middle becomes the partner. */
  protected swap(): void {
    const centerId = this.model.centerId();
    const partnerId = this.model.poster()?.partnerId;
    if (centerId && partnerId) this.model.set({ centerId: partnerId, partnerId: centerId });
  }
}
