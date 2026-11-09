import { Injectable, effect, inject } from '@angular/core';
import { chartLanguage } from '../core/lang/language';
import { withMarriedSurnames } from '../core/model/married-surnames';
import { TreeStore } from '../core/store/tree-store';
import { I18n } from '../i18n/i18n';

/**
 * Keeps married women's surnames filled in from their husbands' (see
 * core/model/married-surnames.ts), in the form the app's language gives
 * (Mikulová in Czech, Mikula in English), on every edit and whenever the
 * language changes.
 */
@Injectable({ providedIn: 'root' })
export class SurnameRules {
  private readonly store = inject(TreeStore);
  private readonly i18n = inject(I18n);

  constructor() {
    // Set at once, before the saved tree is restored, then again whenever the language changes.
    const apply = () => {
      const form = chartLanguage(this.i18n.code()).surnameFor;
      this.store.setNormalizer((doc, opened) => withMarriedSurnames(doc, form, opened));
    };
    apply();
    effect(apply);
  }
}
