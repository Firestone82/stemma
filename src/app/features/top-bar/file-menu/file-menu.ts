import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { DocumentActions } from '../../../state/document-actions';
import { PartActions } from '../../../state/part-actions';
import { UiState } from '../../../state/ui-state';

/** The File button and its menu: new, close, open, save, Google Drive, export, parts of the tree to fill in elsewhere, print, the example family, the file format. */
@Component({
  selector: 'stemma-file-menu',
  imports: [Icon],
  templateUrl: './file-menu.html',
  styleUrl: './file-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'menu-anchor' },
})
export class FileMenu {
  protected readonly ui = inject(UiState);
  protected readonly documents = inject(DocumentActions);
  protected readonly parts = inject(PartActions);
  protected readonly t = inject(I18n).t;

  protected readonly open = computed(() => this.ui.menu() === 'file');
  /** The file Save writes back to, if the tree came from one; shown as the Save item's tooltip. */
  protected readonly sourceName = computed(() => {
    const source = this.documents.source();
    if (!source) return null;
    return source.kind === 'local' ? source.name : source.file.name;
  });
  /** Save writes back to the tree's file; without one it saves a new file, or shows the XML to copy where .xml cannot be downloaded. */
  protected readonly saveLabel = computed(() => {
    const source = this.documents.source();
    if (this.documents.readOnly()) return this.t('file.saveCopy');
    if (source) return this.t(source.kind === 'drive' ? 'file.saveInDrive' : 'file.saveInPlace');
    return this.t(this.documents.canSaveXml() ? 'file.save' : 'file.saveCopy');
  });

  /** A tree in Google Drive (its own, or one opened from someone's link) can be shared by a link. */
  protected readonly canShare = computed(() => this.documents.source()?.kind === 'drive' || !!this.documents.shared());

  /** Without a Google Cloud project set up, the Drive items say so (and open the steps to set one up). */
  protected readonly driveHint = computed(() => (this.documents.driveReady() ? null : this.t('file.driveNotSetUp')));

  /** Opening the menu starts loading the Google script, so the Drive items can open Google's sign-in straight from a click. */
  protected toggle(): void {
    this.ui.toggleMenu('file');
    if (this.open()) this.documents.prepareDrive();
  }
}
