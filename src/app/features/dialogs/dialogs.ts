import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { UiState } from '../../state/ui-state';
import { AboutFormat } from './about-format/about-format';
import { ConfirmDelete } from './confirm-delete/confirm-delete';
import { ConfirmNew } from './confirm-new/confirm-new';
import { FamilyExport } from './family-export/family-export';
import { ImportReport } from './import-report/import-report';
import { NewerVersion } from './newer-version/newer-version';
import { XmlExport } from './xml-export/xml-export';
import { DriveOpen } from './drive-open/drive-open';
import { DriveSetup } from './drive-setup/drive-setup';
import { UnsavedChanges } from './unsaved-changes/unsaved-changes';

/** The one modal dialog of the app; what it shows comes from UiState.dialog. */
@Component({
  selector: 'stemma-dialogs',
  imports: [ConfirmDelete, ConfirmNew, FamilyExport, ImportReport, NewerVersion, XmlExport, AboutFormat, UnsavedChanges, DriveSetup, DriveOpen],
  templateUrl: './dialogs.html',
  styleUrl: './dialogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialogs {
  private readonly ui = inject(UiState);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly request = this.ui.dialog;
  protected readonly wide = computed(() => this.request()?.kind === 'xml' || this.request()?.kind === 'about' || this.request()?.kind === 'drive-setup');

  constructor() {
    effect(() => {
      const open = !!this.request();
      const el = this.dialog().nativeElement;
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
    });
  }

  protected close(): void {
    this.ui.dialog.set(null);
  }

  /** Escape closes the native dialog; keep the state in step. */
  protected onClosed(): void {
    if (this.request()) this.ui.dialog.set(null);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
