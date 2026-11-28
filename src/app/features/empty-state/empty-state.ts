import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RecentFile } from '../../core/services/recent-files';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';
import { DocumentActions } from '../../state/document-actions';
import { UiState } from '../../state/ui-state';
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
  readonly canResume = input(false);
  protected readonly ui = inject(UiState);
  protected readonly documents = inject(DocumentActions);
  private readonly people = inject(PersonActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly recent = this.documents.recentFiles;
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.i18n.locale().intl, { dateStyle: 'medium', timeStyle: 'short' }));

  /** When the file was last saved (for a file in Drive, last changed there); for older entries, when it was last opened. */
  protected when(at: number): string {
    return this.dateFormat().format(at);
  }

  /**
   * Where the file is. In Drive, the folders down from My Drive. On the computer the browser never tells the page
   * which folder a file is in, so only a downloaded file is known to be in the downloads folder.
   */
  protected where(entry: RecentFile): string {
    if (entry.kind === 'local') return this.t(entry.downloaded ? 'recent.downloads' : 'recent.computer');
    if (!entry.folders) return this.t('recent.drive');
    const folders = entry.folders;
    const unknown = folders[0] === '…';
    let top: string[];
    if (entry.top === 'shared') top = [this.t('recent.sharedWithMe'), ...(unknown && folders.length === 1 ? [] : folders)];
    else if (entry.top === 'shared-drive' || unknown) top = folders;
    else top = [this.t('recent.myDrive'), ...folders];
    return [this.t('recent.drive'), ...top].join(' / ');
  }

  constructor() {
    // Where the Google sign-in is still kept, the Drive files' times and folders are brought up to date.
    this.documents.refreshRecentDrive();
  }

  protected addFirst(): void {
    this.ui.home.set(false);
    this.people.addLoosePerson({ given: '' });
  }
}
