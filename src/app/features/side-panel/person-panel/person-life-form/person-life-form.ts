import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { bornLongAgo } from '../../../../core/model/completeness';
import { PersonPatch } from '../../../../core/model/operations';
import { GenDate, LifeEvent, Person } from '../../../../core/model/types';
import { I18n } from '../../../../i18n/i18n';
import { DateField } from '../../../../shared/date-field/date-field';
import { PersonActions } from '../../../../state/person-actions';

type EventKey = 'birth' | 'death';

/**
 * Birth and death. Places, portraits and notes are no longer edited here
 * (those in files are kept). Someone born more than a hundred years ago is marked as
 * having died as soon as the date is entered.
 */
@Component({
  selector: 'stemma-person-life-form',
  imports: [DateField],
  templateUrl: './person-life-form.html',
  styleUrl: './person-life-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel-section' },
})
export class PersonLifeForm {
  private readonly people = inject(PersonActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly person = input.required<Person>();

  private patch(patch: PersonPatch, field: string): void {
    this.people.update(this.person().id, patch, field);
  }

  protected setDate(which: EventKey, date: GenDate | undefined): void {
    const p = this.person();
    // A date entered is no longer unknown.
    const patch: PersonPatch = { [which]: compactEvent({ ...p[which], date, dateUnknown: date ? undefined : p[which]?.dateUnknown }, which === 'death') };
    if (which === 'birth' && !p.death && bornLongAgo(date)) patch.death = {};
    this.patch(patch, `${which}.date`);
  }

  protected setBirthUnknown(event: Event): void {
    const unknown = (event.target as HTMLInputElement).checked;
    this.patch({ birth: compactEvent({ ...this.person().birth, dateUnknown: unknown || undefined }, false) }, 'birth.unknown');
  }

  protected setDeathUnknown(event: Event): void {
    const unknown = (event.target as HTMLInputElement).checked;
    this.patch({ death: compactEvent({ ...this.person().death, dateUnknown: unknown || undefined }, true) }, 'death.unknown');
  }

  protected setDeceased(event: Event): void {
    const died = (event.target as HTMLInputElement).checked;
    this.patch({ death: died ? (this.person().death ?? {}) : undefined }, 'deceased');
  }
}

/** Drops empty fields; an empty birth disappears, an empty death stays (it means the person has died). */
function compactEvent(e: LifeEvent, keepEmpty: boolean): LifeEvent | undefined {
  const out: LifeEvent = {};
  if (e.date && (e.date.value || e.date.text)) out.date = e.date;
  if (e.dateUnknown && !out.date) out.dateUnknown = true;
  if (e.place?.trim()) out.place = e.place;
  if (e.ext) out.ext = e.ext;
  return Object.keys(out).length || keepEmpty ? out : undefined;
}
