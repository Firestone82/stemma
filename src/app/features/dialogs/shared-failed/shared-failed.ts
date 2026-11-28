import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n/i18n';

/**
 * A shared link (`?drive=<file id>`) could not open its tree: the file is not shared with anyone who has the link (or
 * is gone), or Google Drive could not be reached.
 */
@Component({
  selector: 'stemma-shared-failed',
  template: `
    <div class="dialog-body">
      <h2>{{ t('dialog.sharedFailed.title') }}</h2>
      <p>{{ t(reason() === 'private' ? 'dialog.sharedFailed.private' : 'dialog.sharedFailed.failed') }}</p>
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn primary" (click)="done.emit()">{{ t('common.close') }}</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    p {
      max-width: 62ch;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedFailed {
  protected readonly t = inject(I18n).t;
  readonly reason = input.required<'private' | 'failed'>();
  readonly done = output<void>();
}
