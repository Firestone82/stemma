import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';

const STEPS: readonly MessageKey[] = ['dialog.drive.step1', 'dialog.drive.step2', 'dialog.drive.step3', 'dialog.drive.step4', 'dialog.drive.step5'];

/**
 * Shown by the Google Drive items while no Google Cloud project is set up (see google-config.ts): what Drive needs,
 * and the steps for whoever runs this copy of Stemma.
 */
@Component({
  selector: 'stemma-drive-setup',
  templateUrl: './drive-setup.html',
  styleUrl: './drive-setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriveSetup {
  protected readonly t = inject(I18n).t;
  protected readonly steps = STEPS;
  protected readonly origin = typeof location !== 'undefined' ? location.origin : '';

  readonly done = output<void>();
}
