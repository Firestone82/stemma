import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, untracked } from '@angular/core';
import { marriedSurnames } from '../../../../core/model/married-surnames';
import { birthFather } from '../../../../core/model/surnames';
import { PersonName, Person, Sex } from '../../../../core/model/types';
import { TreeStore } from '../../../../core/store/tree-store';
import { I18n } from '../../../../i18n/i18n';
import { ChartModel } from '../../../../state/chart-model';
import { SegmentOption, Segmented } from '../../../../shared/segmented/segmented';
import { SuggestField, Suggestion } from '../../../../shared/suggest-field/suggest-field';
import { PersonActions } from '../../../../state/person-actions';
import { UiState } from '../../../../state/ui-state';

type NameField = 'given' | 'surname' | 'birthSurname';

/** Given names, surnames and sex. */
@Component({
  selector: 'stemma-person-name-form',
  imports: [Segmented, SuggestField],
  templateUrl: './person-name-form.html',
  styleUrl: './person-name-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel-section' },
})
export class PersonNameForm {
  private readonly people = inject(PersonActions);
  private readonly ui = inject(UiState);
  private readonly store = inject(TreeStore);
  private readonly model = inject(ChartModel);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly person = input.required<Person>();

  /**
   * For a woman married more than once, her husbands' surnames in her form, first marriage first: the surname
   * field suggests them as she types, or all of them from its arrow. Empty for anyone else.
   */
  private readonly surnameChoices = computed(() => {
    const choices = marriedSurnames(this.store.index(), this.person(), this.model.language().surnameFor);
    return choices.length > 1 ? choices : [];
  });

  /** The same as suggestions: the surname, and whose it is. */
  protected readonly surnameSuggestions = computed<Suggestion[]>(() =>
    this.surnameChoices().map((c) => ({ id: c.familyId, label: c.surname, detail: this.i18n.name(c.husband) })),
  );

  /** The marriage whose surname she bears now, marked in the list. */
  protected readonly surnameCurrent = computed(() => {
    const surname = this.person().name.surname.trim();
    return this.surnameChoices().find((c) => c.surname === surname)?.familyId ?? '';
  });

  /** Whose surname she bears, when it is taken from a husband. */
  protected readonly surnameSource = computed(() => {
    if (!this.person().name.derived) return '';
    const husband = this.surnameChoices().find((c) => c.familyId === this.surnameCurrent())?.husband;
    return husband ? this.t('name.fromHusbandNamed', { name: this.i18n.name(husband) }) : this.t('name.fromHusband');
  });

  /** Unless written in, the surname at birth is the father's: "Nováková (from the father)". */
  protected readonly birthSurnameHint = computed(() => {
    const p = this.person();
    if (!birthFather(this.store.index(), p.id)) return this.t('name.birthSurnamePlaceholder');
    const name = this.model.birthSurnames().get(p.id);
    return name ? this.t('name.birthSurnameFromFather', { name }) : this.t('name.birthSurnamePlaceholder');
  });

  protected readonly sexes = computed<SegmentOption<Sex>[]>(() => [
    { value: 'female', label: this.t('sex.female') },
    { value: 'male', label: this.t('sex.male') },
    { value: 'other', label: this.t('sex.other') },
    { value: 'unknown', label: this.t('sex.unknown') },
  ]);

  constructor() {
    // Focus the name field when asked (after adding a person).
    effect(() => {
      const field = this.ui.focusField();
      this.person();
      if (!field) return;
      untracked(() =>
        setTimeout(() => {
          const el = this.host.nativeElement.querySelector<HTMLElement>(`#person-${field}`);
          el?.focus();
          if (el instanceof HTMLInputElement) el.select();
          this.ui.focusField.set(null);
        }, 30),
      );
    });
  }

  protected setName(field: NameField, event: Event): void {
    this.writeName(field, (event.target as HTMLInputElement).value);
  }

  protected writeName(field: NameField, value: string): void {
    const optional = field === 'birthSurname';
    this.people.update(this.person().id, { name: { [field]: optional && !value.trim() ? undefined : value } as Partial<PersonName> }, field);
  }

  /**
   * A surname taken from the suggestions: her husband's in that marriage, kept up to date with his (see
   * married-surnames.ts). One undo step with what was typed to find it.
   */
  protected chooseSurname(familyId: string): void {
    this.people.update(this.person().id, { name: { surname: '', surnameFrom: familyId } }, 'surname');
  }

  /** Stray spaces are removed when the person leaves the field. */
  protected trimName(field: NameField, event: Event): void {
    this.trimValue(field, (event.target as HTMLInputElement).value);
  }

  protected trimValue(field: NameField, value: string): void {
    if (value === value.trim()) return;
    const trimmed = value.trim() || (field === 'given' || field === 'surname' ? '' : undefined);
    this.people.update(this.person().id, { name: { [field]: trimmed } as Partial<PersonName> }, field);
  }

  /** Nobody knows the given name: the card says so and it is not flagged as missing. */
  protected setGivenUnknown(event: Event): void {
    const unknown = (event.target as HTMLInputElement).checked;
    this.people.update(this.person().id, { name: { givenUnknown: unknown || undefined } }, 'given-unknown');
  }

  protected setSex(sex: Sex): void {
    this.people.update(this.person().id, { sex }, 'sex');
  }
}
