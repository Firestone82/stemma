import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { DocumentActions } from '../../../state/document-actions';
import { PartActions } from '../../../state/part-actions';
import { UiState } from '../../../state/ui-state';

/** The File button and its menu: new, close, open, save, export, parts of the tree to fill in elsewhere, print, the example family, the file format. */
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
    return source.name;
  });
  /** Save writes back to the tree's file; without one it saves a new file, or shows the XML to copy where .xml cannot be downloaded. */
  protected readonly saveLabel = computed(() => {
    const source = this.documents.source();
    if (source) return this.t('file.saveInPlace');
    return this.t(this.documents.canSaveXml() ? 'file.save' : 'file.saveCopy');
  });
}
