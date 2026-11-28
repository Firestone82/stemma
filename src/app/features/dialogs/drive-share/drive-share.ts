import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DriveFile, DriveRole, DriveSharing, GoogleDrive, driveFilePage, shareLink } from '../../../core/services/google-drive';
import { ToastService } from '../../../core/services/toast';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';

/**
 * The link that opens a tree in Google Drive for anyone (Stemma's address with `?drive=<file id>`), to copy. Drive is
 * asked whether anyone with the link may see the file; where not, the person can let them (on a file of theirs) or go
 * to the file in Drive to share it there.
 */
@Component({
  selector: 'stemma-drive-share',
  imports: [Icon],
  templateUrl: './drive-share.html',
  styleUrl: './drive-share.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriveShare implements OnInit {
  private readonly drive = inject(GoogleDrive);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18n).t;

  readonly file = input.required<DriveFile>();
  /** The file is the person's own tree in Drive (opened from or saved there), not one opened from someone's link. */
  readonly own = input(false);
  readonly done = output<void>();

  protected readonly link = computed(() => shareLink(this.file().id));
  protected readonly drivePage = computed(() => driveFilePage(this.file().id));
  /** `checking` until Drive answers; `null` when it could not be asked. */
  protected readonly sharing = signal<DriveSharing | 'checking'>('checking');
  protected readonly changing = signal(false);

  ngOnInit(): void {
    void this.check();
  }

  protected async check(): Promise<void> {
    this.sharing.set('checking');
    this.sharing.set(await this.drive.sharing(this.file().id));
  }

  protected async makePublic(role: DriveRole): Promise<void> {
    this.changing.set(true);
    try {
      const outcome = await this.drive.sharePublicly(this.file(), role);
      if (outcome.status === 'done') {
        this.sharing.set(role === 'writer' ? 'editable' : 'public');
        this.toast.show(this.t(role === 'writer' ? 'dialog.share.editable' : 'dialog.share.madePublic'));
      } else if (outcome.status === 'denied' || outcome.status === 'missing') {
        this.toast.error(this.t('dialog.share.cannotChange'));
      } else if (outcome.status === 'blocked') {
        this.toast.error(this.t('file.driveBlocked'));
      } else if (outcome.status === 'failed') {
        this.toast.error(this.t('file.driveFailed'));
      }
    } finally {
      this.changing.set(false);
    }
  }

  protected copy(field: HTMLInputElement): void {
    const fallback = () => {
      field.focus();
      field.select();
      this.toast.show(this.t('dialog.share.selected'));
    };
    try {
      navigator.clipboard.writeText(this.link()).then(() => this.toast.show(this.t('dialog.share.copied')), fallback);
    } catch {
      fallback();
    }
  }
}
