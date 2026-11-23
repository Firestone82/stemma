import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TreeStore } from './core/store/tree-store';
import { Dialogs } from './features/dialogs/dialogs';
import { EmptyState } from './features/empty-state/empty-state';
import { PrintRoute } from './features/print-studio/print-route';
import { PrintStudio } from './features/print-studio/print-studio';
import { ReviewBar } from './features/review-bar/review-bar';
import { SampleNote } from './features/sample-note/sample-note';
import { SidePanel } from './features/side-panel/side-panel';
import { Toasts } from './features/toasts/toasts';
import { TopBar } from './features/top-bar/top-bar';
import { TreeChart } from './features/tree-chart/tree-chart';
import { DocumentActions } from './state/document-actions';
import { FamilyView } from './state/family-view';
import { Shortcuts } from './state/shortcuts';
import { Theme } from './state/theme';
import { SurnameRules } from './state/surname-rules';
import { UiState } from './state/ui-state';

/** The app: a bar on top, the chart with the side panel, and the dialogs over them; or the print studio in their place. */
@Component({
  selector: 'app-root',
  imports: [TopBar, TreeChart, EmptyState, SampleNote, SidePanel, Toasts, Dialogs, PrintStudio, ReviewBar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'shortcuts.handle($event)',
    '(document:pointerdown)': 'shortcuts.pointer($event)',
    '(window:pagehide)': 'documents.flush()',
    '(window:beforeunload)': 'documents.beforeUnload($event)',
  },
})
export class App {
  private readonly store = inject(TreeStore);
  protected readonly ui = inject(UiState);
  protected readonly shortcuts = inject(Shortcuts);
  protected readonly documents = inject(DocumentActions);

  protected readonly isEmpty = computed(() => this.store.doc().people.length === 0);

  constructor() {
    // Started with the app, so the light or dark choice applies from the first frame, #/print opens the studio
    // and #/family/… the family view once the tree is read.
    inject(Theme);
    inject(SurnameRules);
    inject(PrintRoute);
    inject(FamilyView);
    this.documents.restore();
  }
}
