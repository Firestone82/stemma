import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';
import { DocumentActions } from '../../state/document-actions';
import { PersonActions } from '../../state/person-actions';

/**
 * The start page, shown while the tree is empty: how to begin, and the files opened lately. A tree from a file is
 * never reopened on its own on the next visit (see Autosave); it is opened again from here, read afresh from the file.
 */
@Component({
  selector: 'stemma-empty-state',
  imports: [Icon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-labelledby': 'empty-title' },
})
export class EmptyState {
  protected readonly documents = inject(DocumentActions);
  private readonly people = inject(PersonActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly recent = this.documents.recentFiles;
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.i18n.locale().intl, { dateStyle: 'medium', timeStyle: 'short' }));

  /** When the file was last opened or saved here. */
  protected when(at: number): string {
    return this.dateFormat().format(at);
  }

  protected addFirst(): void {
    this.people.addLoosePerson({ given: '' });
  }
}
