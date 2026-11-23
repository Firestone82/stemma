import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { DocumentActions } from '../../../state/document-actions';

/** "Save your changes first?", before opening another tree over one with changes its file does not have yet. */
@Component({
  selector: 'stemma-unsaved-changes',
  imports: [Icon],
  templateUrl: './unsaved-changes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
})
export class UnsavedChanges {
  protected readonly documents = inject(DocumentActions);
  protected readonly t = inject(I18n).t;

  /** What to do once the changes are saved or let go. */
  readonly proceed = input.required<() => unknown>();
  readonly done = output<void>();

  /** The file the changes belong to, when Save writes back to one. */
  protected readonly fileName = computed(() => {
    const source = this.documents.source();
    if (!source) return null;
    return source.name;
  });
}
