import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DriveListing } from '../../../core/services/google-drive';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { DocumentActions } from '../../../state/document-actions';

/**
 * The trees Stemma saved in Google Drive, to open one. Drive shows Stemma only the files it saved there itself (the
 * `drive.file` permission), so a tree put in Drive some other way is opened from the computer and saved here once.
 */
@Component({
  selector: 'stemma-drive-open',
  imports: [Icon],
  templateUrl: './drive-open.html',
  styleUrl: './drive-open.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriveOpen {
  protected readonly documents = inject(DocumentActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly files = input.required<DriveListing[]>();
  readonly done = output<void>();

  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.i18n.locale().intl, { dateStyle: 'medium', timeStyle: 'short' }));

  /** When the file was last changed in Drive. */
  protected when(at: number): string {
    return at ? this.dateFormat().format(at) : '';
  }
}
