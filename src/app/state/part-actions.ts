import { Injectable, inject } from '@angular/core';
import { MergePlan } from '../core/part/merge';
import { PartScope, partDocument } from '../core/part/part';
import { FileIo, PickerType, datedFilename } from '../core/services/file-io';
import { ToastService } from '../core/services/toast';
import { TreeStore } from '../core/store/tree-store';
import { XmlFormatError, parseTree } from '../core/xml/parser';
import { serializeTree } from '../core/xml/serializer';
import { I18n } from '../i18n/i18n';
import { UiState } from './ui-state';

const XML_ACCEPT = '.xml,application/xml,text/xml';
const XML_TYPE: PickerType = { description: 'Stemma family tree (XML)', accept: { 'application/xml': ['.xml'] } };

/** Parts of the tree taken out to a file of their own, for someone else to fill in, and merged back (see core/part). */
@Injectable({ providedIn: 'root' })
export class PartActions {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly files = inject(FileIo);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18n);

  /** Asks which part to take out (the part-export dialog), then savePart. */
  exportPart(): void {
    this.ui.closeMenu();
    if (!this.store.doc().people.length) {
      this.toast.show(this.i18n.t('file.gedcomEmpty'));
      return;
    }
    this.ui.dialog.set({ kind: 'part-export' });
  }

  /** Saves the part around `scope.centerId` as a tree file of its own. The tree on screen stays tied to its own file. */
  async savePart(scope: PartScope): Promise<void> {
    const doc = this.store.doc();
    const center = this.store.index().person(scope.centerId);
    const title = this.i18n.t('part.title', { tree: doc.meta.title, name: this.i18n.name(center) });
    const part = partDocument(doc, this.store.index(), { ...scope, title });
    const xml = serializeTree({ ...part, view: { ...part.view, language: this.i18n.code() } });
    const filename = datedFilename(title, 'xml');
    if (!this.files.canSave(filename)) {
      this.ui.dialog.set({ kind: 'xml', xml, filename });
      return;
    }
    const outcome = await this.files.save(filename, xml, 'application/xml');
    if (outcome === 'saved') this.toast.show(this.i18n.t('part.saved', { name: filename, count: part.people.length }));
    else if (outcome === 'unsupported') this.ui.dialog.set({ kind: 'xml', xml, filename });
    else if (outcome === 'failed') this.toast.error(this.i18n.t('file.saveFailed'));
  }

  /** Picks a tree file (a part taken out earlier, or any other) and shows what merging it in would do (the part-merge dialog). */
  async importPart(): Promise<void> {
    this.ui.closeMenu();
    let text: string;
    let name: string;
    try {
      const picked = await this.files.pickWithHandle(XML_TYPE, XML_ACCEPT);
      if (!picked) return;
      text = await picked.file.text();
      name = picked.file.name;
    } catch {
      this.toast.error(this.i18n.t('file.unreadable'));
      return;
    }
    this.openPart(text, name);
  }

  openPart(xml: string, name: string): void {
    try {
      const part = parseTree(xml).doc;
      if (!part.people.length) {
        this.toast.show(this.i18n.t('part.empty', { name }));
        return;
      }
      this.ui.dialog.set({ kind: 'part-merge', part, name });
    } catch (e) {
      const why = e instanceof XmlFormatError ? ` ${this.i18n.notice(e, 'file.error.')}` : '';
      this.toast.error(`${this.i18n.t('file.openFailed', { name })}${why}`);
    }
  }

  /** Takes the merged tree on as one step to undo. */
  merge(plan: MergePlan): void {
    this.ui.dialog.set(null);
    if (plan.unchanged) return;
    this.store.commit(plan.doc);
    const s = plan.summary;
    this.toast.show(
      this.i18n.t('part.merged', {
        added: this.i18n.t('part.people', { count: s.added }),
        updated: this.i18n.t('part.people', { count: s.updated }),
      }),
    );
  }
}
