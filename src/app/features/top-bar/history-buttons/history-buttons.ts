import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { PersonActions } from '../../../state/person-actions';
import { UiState } from '../../../state/ui-state';

/** Undo and redo: of the tree, and in the print studio also of the people clicked away there. */
@Component({
  selector: 'stemma-history-buttons',
  imports: [Icon],
  templateUrl: './history-buttons.html',
  styleUrl: './history-buttons.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryButtons {
  private readonly store = inject(TreeStore);
  private readonly people = inject(PersonActions);
  private readonly ui = inject(UiState);
  protected readonly t = inject(I18n).t;

  protected readonly canUndo = computed(() => (this.ui.printOpen() ? this.ui.canUndoInPrint() : this.store.canUndo()));
  protected readonly canRedo = computed(() => (this.ui.printOpen() ? this.ui.canRedoInPrint() : this.store.canRedo()));

  protected undo(): void {
    if (this.ui.printOpen()) this.ui.undoInPrint();
    else this.people.undo();
  }

  protected redo(): void {
    if (this.ui.printOpen()) this.ui.redoInPrint();
    else this.people.redo();
  }
}
