import { toGedcom } from '../core/gedcom/gedcom';
import { Injectable, inject, signal } from '@angular/core';
import { updateMeta, updateView } from '../core/model/operations';
import { sampleDocument } from '../core/model/sample';
import { ChildRelation, emptyDocument } from '../core/model/types';
import { Autosave } from './autosave';
import { ChartModel } from './chart-model';
import { LegendEntry, familyDocument } from '../core/family-document/family-document';
import { ChartLanguage } from '../core/lang/language';
import { familyOutline, linkedFamilies } from '../core/family-document/outline';
import { FileIo, PickerType, SaveOutcome, datedFilename } from '../core/services/file-io';
import { DriveFile, DriveOutcome, GoogleDrive } from '../core/services/google-drive';
import { ToastService } from '../core/services/toast';
import { TreeStore } from '../core/store/tree-store';
import { XmlFormatError, parseTree } from '../core/xml/parser';
import { serializeTree } from '../core/xml/serializer';
import { I18n } from '../i18n/i18n';
import { MessageKey } from '../i18n/locales';
import { Preferences } from './preferences';
import { UiState } from './ui-state';

/** The family document's words for a son, a daughter, a child, by how they are a child. */
const CHILD_WORDS: Record<ChildRelation, readonly [MessageKey, MessageKey, MessageKey]> = {
  biological: ['familyDocument.son', 'familyDocument.daughter', 'familyDocument.child'],
  unknown: ['familyDocument.son', 'familyDocument.daughter', 'familyDocument.child'],
  adopted: ['familyDocument.adoptedSon', 'familyDocument.adoptedDaughter', 'familyDocument.adoptedChild'],
  step: ['familyDocument.stepSon', 'familyDocument.stepDaughter', 'familyDocument.stepChild'],
  foster: ['familyDocument.fosterSon', 'familyDocument.fosterDaughter', 'familyDocument.fosterChild'],
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XML_ACCEPT = '.xml,application/xml,text/xml';
const XML_TYPE: PickerType = { description: 'Stemma family tree (XML)', accept: { 'application/xml': ['.xml'] } };

/**
 * Where the tree on screen was opened from or last saved to, so Save writes back there: a file on the computer
 * the browser gave a handle for, or a file in Google Drive. None for a new tree, the example family, the copy kept
 * in the browser, or a file opened where the browser cannot write back.
 */
export type TreeSource = { kind: 'local'; handle: FileSystemFileHandle; name: string } | { kind: 'drive'; file: DriveFile };

/** Whole trees: starting, opening, saving, the example family and the print studio. */
@Injectable({ providedIn: 'root' })
export class DocumentActions {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly files = inject(FileIo);
  private readonly drive = inject(GoogleDrive);
  private readonly toast = inject(ToastService);
  private readonly autosave = inject(Autosave);
  private readonly prefs = inject(Preferences);
  private readonly i18n = inject(I18n);
  private readonly chart = inject(ChartModel);

  /** Where Save writes the tree (see TreeSource). */
  readonly source = signal<TreeSource | null>(null);
  /** The source of a file being opened, taken on once it opens (after the newer-version dialog, if that comes first). */
  private pendingSource: TreeSource | null = null;

  /** Reopens the tree from the last visit, or shows the example family the first time. */
  restore(): void {
    const saved = this.autosave.read();
    if (saved instanceof Promise) {
      // A big tree kept in IndexedDB: the chart waits for it rather than flashing the empty state.
      this.ui.restoring.set(true);
      void saved.then((xml) => this.reopen(xml)).finally(() => this.ui.restoring.set(false));
      return;
    }
    this.reopen(saved);
  }

  private reopen(saved: string | null): void {
    this.source.set(null);
    if (saved) {
      try {
        this.store.load(parseTree(saved).doc);
        this.autosave.enable();
        return;
      } catch {
        // A damaged copy should not block the app; fall back to the example.
      }
    }
    this.store.load(sampleDocument());
    this.ui.showSampleNote.set(!this.prefs.read().sampleNoteDismissed);
    this.autosave.enable();
  }

  newTree(): void {
    this.ui.closeMenu();
    if (!this.store.doc().people.length) {
      this.startEmpty();
      return;
    }
    this.ui.dialog.set({ kind: 'confirm-new' });
  }

  /** An empty tree whose chart speaks the app's language. */
  startEmpty(): void {
    const doc = emptyDocument(this.i18n.t('tree.newTitle'));
    this.store.load({ ...doc, view: { ...doc.view, language: this.i18n.code() } });
    this.source.set(null);
    this.ui.adding.set(null);
    this.ui.showSampleNote.set(false);
    this.ui.dialog.set(null);
  }

  loadSample(): void {
    this.ui.closeMenu();
    this.store.load(sampleDocument());
    this.source.set(null);
    this.ui.showSampleNote.set(true);
    this.toast.show(this.i18n.t('file.sampleOpened'));
  }

  dismissSampleNote(): void {
    this.ui.showSampleNote.set(false);
    this.prefs.set({ sampleNoteDismissed: true });
  }

  /** Opens a tree from the computer. Where the browser allows it, Save then writes back to the same file. */
  async openFile(): Promise<void> {
    this.ui.closeMenu();
    let text: string;
    let name: string;
    let handle: FileSystemFileHandle | undefined;
    try {
      const picked = await this.files.pickWithHandle(XML_TYPE, XML_ACCEPT);
      if (!picked) return;
      text = await picked.file.text();
      name = picked.file.name;
      handle = picked.handle;
    } catch {
      this.toast.error(this.i18n.t('file.unreadable'));
      return;
    }
    this.pendingSource = handle ? { kind: 'local', handle, name } : null;
    this.openXml(text, name);
  }

  /** True when trees can be opened from and saved to Google Drive: a Google client is set up and the app is not inside a viewer. */
  canUseDrive(): boolean {
    return this.drive.configured && !this.files.hosted;
  }

  /** Loads the Google scripts while the File menu is open, so a click on a Drive item opens the sign-in at once. */
  prepareDrive(): void {
    if (this.canUseDrive()) this.drive.prepare();
  }

  /** Opens a tree from Google Drive, through the Google Picker. Save then writes back to that file. */
  async openFromDrive(): Promise<void> {
    this.ui.closeMenu();
    const outcome = await this.drive.open(this.i18n.code());
    if (outcome.status !== 'done') {
      this.driveProblem(outcome);
      return;
    }
    this.pendingSource = { kind: 'drive', file: outcome.value.file };
    this.openXml(outcome.value.text, outcome.value.file.name);
  }

  openXml(xml: string, name?: string, force = false): void {
    const fileName = name ?? this.i18n.t('file.theFile');
    try {
      const result = parseTree(xml, { force });
      this.store.load(result.doc);
      this.source.set(this.pendingSource);
      this.pendingSource = null;
      this.ui.showSampleNote.set(false);
      this.ui.dialog.set(null);
      if (result.warnings.length || result.upgrades.length) {
        this.ui.dialog.set({ kind: 'import-report', title: result.doc.meta.title, notes: result.warnings, upgrades: result.upgrades });
      } else {
        this.toast.show(this.i18n.t('file.opened', { title: result.doc.meta.title }));
      }
    } catch (e) {
      if (e instanceof XmlFormatError && e.code === 'newer-major') {
        this.ui.dialog.set({ kind: 'newer-version', notice: e, xml, name: fileName });
        return;
      }
      this.pendingSource = null;
      if (e instanceof XmlFormatError) {
        this.toast.error(`${this.i18n.t('file.openFailed', { name: fileName })} ${this.i18n.notice(e, 'file.error.')}`);
      } else {
        this.toast.error(this.i18n.t('file.openFailed', { name: fileName }));
      }
    }
  }

  /** The tree as XML. It records the language of the chart, for older versions of Stemma, which draw the chart in it. */
  xml(): string {
    return serializeTree(updateView(this.store.doc(), { language: this.i18n.code() }));
  }

  /** Saves back to the file the tree came from (on the computer or in Google Drive), or else as a new file (`saveXmlAs`). */
  async saveXml(): Promise<void> {
    this.ui.closeMenu();
    const source = this.source();
    if (source?.kind === 'local') {
      const outcome = await this.files.writeTo(source.handle, new Blob([this.xml()], { type: 'application/xml' }));
      this.reportSave(outcome, source.name);
    } else if (source?.kind === 'drive') {
      const outcome = await this.drive.update(source.file, this.xml());
      if (outcome.status === 'done') {
        this.source.set({ kind: 'drive', file: outcome.value });
        this.toast.show(this.i18n.t('file.savedToDrive', { name: outcome.value.name }));
      } else {
        this.driveProblem(outcome);
      }
    } else {
      await this.saveXmlAs();
    }
  }

  /**
   * Saves as a new file: where the browser asks where to save it, Save writes there from then on; elsewhere it is
   * downloaded, or the XML is shown to copy where downloads of .xml are not allowed.
   */
  async saveXmlAs(): Promise<void> {
    this.ui.closeMenu();
    const xml = this.xml();
    const filename = datedFilename(this.store.doc().meta.title, 'xml');
    if (!this.files.canSave(filename)) {
      this.ui.dialog.set({ kind: 'xml', xml, filename });
      return;
    }
    const saved = await this.files.saveAs(filename, xml, 'application/xml', XML_TYPE);
    if (saved.handle) this.source.set({ kind: 'local', handle: saved.handle, name: saved.name });
    if (saved.outcome === 'unsupported') this.ui.dialog.set({ kind: 'xml', xml, filename });
    else this.reportSave(saved.outcome, saved.name);
  }

  /** Saves the tree as a new file in Google Drive. Save then writes there. */
  async saveToDrive(): Promise<void> {
    this.ui.closeMenu();
    const outcome = await this.drive.create(datedFilename(this.store.doc().meta.title, 'xml'), this.xml());
    if (outcome.status === 'done') {
      this.source.set({ kind: 'drive', file: outcome.value });
      this.toast.show(this.i18n.t('file.savedToDrive', { name: outcome.value.name }));
    } else {
      this.driveProblem(outcome);
    }
  }

  private reportSave(outcome: SaveOutcome, name: string): void {
    if (outcome === 'saved') this.toast.show(this.i18n.t('file.saved', { name }));
    else if (outcome === 'failed' || outcome === 'unsupported') this.toast.error(this.i18n.t('file.saveFailed'));
  }

  /** Nothing to say when the person closed the sign-in or the picker themselves. */
  private driveProblem(outcome: DriveOutcome<unknown>): void {
    if (outcome.status === 'blocked') this.toast.error(this.i18n.t('file.driveBlocked'));
    else if (outcome.status === 'failed') this.toast.error(this.i18n.t('file.driveFailed'));
  }

  async saveXmlAsText(xml: string, filename: string): Promise<void> {
    const name = filename.replace(/\.xml$/i, '') + '.xml.txt';
    const outcome = await this.files.save(name, xml, 'text/plain');
    if (outcome === 'saved') this.toast.show(this.i18n.t('file.savedAsText', { name }));
    else if (outcome !== 'declined') this.toast.error(this.i18n.t('file.saveUnavailable'));
  }

  /**
   * Saves the tree as a GEDCOM file (.ged), the format genealogy programs and
   * sites read. Where .ged downloads are not allowed, it is saved as .ged.txt
   * to be renamed.
   */
  async exportGedcom(): Promise<void> {
    this.ui.closeMenu();
    if (!this.store.doc().people.length) {
      this.toast.show(this.i18n.t('file.gedcomEmpty'));
      return;
    }
    const filename = datedFilename(this.store.doc().meta.title, 'ged');
    const name = this.files.canSave(filename) ? filename : `${filename}.txt`;
    const outcome = await this.files.save(name, toGedcom(this.store.doc(), { filename }), 'text/plain;charset=utf-8');
    if (outcome === 'saved') this.toast.show(this.i18n.t(name === filename ? 'file.gedcomSaved' : 'file.gedcomSavedAsText', { name }));
    else if (outcome !== 'declined') this.toast.error(this.i18n.t('file.saveFailed'));
  }

  /**
   * Saves the family document: a Word file (.docx) to print, with a table for each family setting out its
   * branches, children under their parents (see core/family-document).
   */
  async exportFamilyDocument(): Promise<void> {
    this.ui.closeMenu();
    const doc = this.store.doc();
    if (!doc.people.length) {
      this.toast.show(this.i18n.t('file.gedcomEmpty'));
      return;
    }
    if (!this.files.canSave(datedFilename(doc.meta.title, 'docx'))) {
      this.toast.error(this.i18n.t('file.familyDocumentUnavailable'));
      return;
    }
    // First the families to set out (see FamilyExport), then saveFamilyDocument.
    this.ui.dialog.set({ kind: 'family-export' });
  }

  /**
   * Saves the family document of the families `keys`, set out in full, and of the families they lead into
   * (a daughter's children carry on her husband's), with only the people they lead to.
   */
  async saveFamilyDocument(keys: readonly string[]): Promise<void> {
    const doc = this.store.doc();
    const filename = datedFilename(doc.meta.title, 'docx');
    const t = this.i18n.t;
    const language = this.chart.language();
    const names = this.chart.familyNames();
    const now = new Date();
    const families = familyOutline({
      doc,
      index: this.store.index(),
      keyOf: this.chart.familyKeyOf(),
      labelOf: (key) => names.get(key)?.label ?? key,
      birthSurnames: this.chart.birthSurnames(),
      language,
      compare: this.i18n.compare,
      keys,
      partial: linkedFamilies(this.store.index(), this.chart.familyKeyOf(), keys),
    });
    const bytes = familyDocument({
      title: doc.meta.title,
      description: doc.meta.description,
      families,
      language: this.i18n.code(),
      now,
      words: {
        heading: t('familyDocument.heading'),
        date: language.longDate(now),
        contents: t('familyDocument.contents'),
        number: t('familyDocument.number'),
        name: t('familyDocument.name'),
        born: t('familyDocument.born'),
        died: t('familyDocument.died'),
        child: (sex, relation) => t(CHILD_WORDS[relation][sex === 'male' ? 0 : sex === 'female' ? 1 : 2]),
        summary: (people, generations) => t('overview.generations', { count: generations, people: t('overview.people', { count: people }) }),
        with: (name) => t('familyDocument.with', { name }),
        withUnknown: t('familyDocument.withUnknown'),
        continuesIn: (family) => t('familyDocument.continuesIn', { family }),
        see: (number) => t('familyDocument.see', { number }),
        legend: { heading: t('familyDocument.legend'), entries: this.legend(language) },
      },
    });
    const blob = new Blob([bytes], { type: DOCX_MIME });
    const outcome = await this.files.save(filename, blob, DOCX_MIME);
    if (outcome === 'saved') this.toast.show(t('file.familyDocumentSaved', { name: filename }));
    else if (outcome === 'unsupported') this.toast.error(t('file.familyDocumentUnavailable'));
    else if (outcome === 'failed') this.toast.error(t('file.saveFailed'));
  }

  /** What the family document's shortcuts and symbols mean, in the app's language. */
  private legend(language: ChartLanguage): LegendEntry[] {
    const t = this.i18n.t;
    // "s (a)" says "adopted" with "(a)".
    const mark = (key: MessageKey) => /\(.*\)/.exec(t(key))?.[0] ?? t(key);
    // "b. 1955" and "† 1971" on the partners' lines: the marks as the language writes them.
    const born = language
      .lifespan({ birth: { date: { value: '1955' } } })
      .replace('1955', '')
      .trim();
    const died = language
      .lifespan({ death: { date: { value: '1971' } } })
      .replace('1971', '')
      .trim();
    return [
      { symbol: t('familyDocument.son'), meaning: t('familyDocument.legend.son') },
      { symbol: t('familyDocument.daughter'), meaning: t('familyDocument.legend.daughter') },
      { symbol: t('familyDocument.child'), meaning: t('familyDocument.legend.child') },
      { symbol: mark('familyDocument.adoptedSon'), meaning: t('familyDocument.legend.adopted') },
      { symbol: mark('familyDocument.stepSon'), meaning: t('familyDocument.legend.step') },
      { symbol: mark('familyDocument.fosterSon'), meaning: t('familyDocument.legend.foster') },
      { symbol: '∞', meaning: t('familyDocument.legend.partner') },
      { symbol: language.bornAs('', 'female').trim(), meaning: t('familyDocument.legend.bornAs') },
      { symbol: t('familyDocument.see', { number: 12 }), meaning: t('familyDocument.legend.number') },
      { symbol: born, meaning: t('familyDocument.legend.born') },
      { symbol: died, meaning: t('familyDocument.legend.died') },
      { symbol: '?', meaning: t('familyDocument.legend.unknown') },
      { symbol: t('familyDocument.legend.colourSample'), meaning: t('familyDocument.legend.colours'), colours: true },
    ];
  }

  /** True when an .xml download can be offered directly. */
  canSaveXml(): boolean {
    return this.files.canSave('tree.xml');
  }

  openPrint(): void {
    this.ui.closeMenu();
    if (!this.store.doc().people.length) {
      this.toast.show(this.i18n.t('print.needPeople'));
      return;
    }
    this.ui.printOpen.set(true);
  }

  showAbout(): void {
    this.ui.closeMenu();
    this.ui.dialog.set({ kind: 'about' });
  }

  /** Renames the tree; typing is merged into one undo step. */
  setTitle(title: string): void {
    this.store.update((doc) => updateMeta(doc, { title }), 'meta:title');
  }

  /** Tidies the name when the person leaves the field: no stray spaces, never empty. */
  finishTitle(title: string): void {
    const clean = title.trim() || this.i18n.t('tree.newTitle');
    if (clean !== this.store.doc().meta.title) this.store.update((doc) => updateMeta(doc, { title: clean }), 'meta:title');
  }

  setDescription(text: string): void {
    this.store.update((doc) => updateMeta(doc, { description: text.trim() ? text : undefined }), 'meta:description');
  }

  /** Keeps the copy in this browser up to date before the page goes away. */
  flush(): void {
    this.autosave.flush();
  }
}
