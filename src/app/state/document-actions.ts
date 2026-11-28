import { toGedcom } from '../core/gedcom/gedcom';
import { Injectable, computed, inject, signal } from '@angular/core';
import { updateMeta, updateView } from '../core/model/operations';
import { sampleDocument } from '../core/model/sample';
import { ChildRelation, emptyDocument } from '../core/model/types';
import { Autosave } from './autosave';
import { ChartModel } from './chart-model';
import { LegendEntry, familyDocument } from '../core/family-document/family-document';
import { ChartLanguage } from '../core/lang/language';
import { familyOutline, linkedFamilies } from '../core/family-document/outline';
import { FileIo, PickerType, SaveOutcome, datedFilename } from '../core/services/file-io';
import { DriveFile, DriveOutcome, DriveProgress, GoogleDrive, SHARE_PARAM, sharedFileId } from '../core/services/google-drive';
import { LocalDetails, RecentFile, RecentFiles } from '../core/services/recent-files';
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

/**
 * A file being opened: where Save will write (if anywhere) and what the recent files list keeps of it. A tree opened
 * from a shared link has neither: it is `shared`, and only the link leads back to it.
 */
type PendingOpen =
  | {
      source: TreeSource | null;
      recent: ({ kind: 'local'; name: string; handle?: FileSystemFileHandle } & LocalDetails) | { kind: 'drive'; file: DriveFile };
    }
  | { shared: DriveFile };

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
  private readonly recent = inject(RecentFiles);

  /** Where Save writes the tree (see TreeSource). */
  readonly source = signal<TreeSource | null>(null);
  /**
   * The tree belongs to a file: it was opened from one or saved to one, on the computer or in Google Drive, even where
   * the browser cannot write back to it. Such a tree is not kept in the browser for the next visit (see Autosave).
   */
  readonly fileBacked = signal(false);
  /**
   * The tree came from a Drive link. It starts in read-only mode until Drive grants editing to the signed-in account.
   * Closing a shared tree brings back the tree previously kept in this browser.
   */
  readonly shared = signal<DriveFile | null>(null);
  readonly readOnly = this.store.readOnly.asReadonly();
  readonly connecting = signal(false);
  readonly canEditShared = computed(() => !!this.shared() && this.drive.configured && this.drive.picks);
  /** The tree's revision when it was last opened or saved. */
  private readonly savedRevision = signal(-1);
  /** The tree belongs to a file and has changes the file does not have yet: leaving the page asks first. */
  readonly unsaved = computed(() => this.fileBacked() && this.store.revision() !== this.savedRevision());
  /** The file being opened, taken on once it opens (after the newer-version dialog, if that comes first). */
  private pending: PendingOpen | null = null;

  /** The files opened and saved lately, newest first. */
  readonly recentFiles = this.recent.list;

  /**
   * Reopens the tree from the last visit, or shows the example family the first time. A tree that came from a file is
   * never reopened from the browser's copy: the start page offers the recent files instead, which read the file afresh.
   */
  restore(): void {
    const id = typeof location === 'undefined' ? null : sharedFileId(location.search);
    if (id) {
      void this.openShared(id);
      return;
    }
    this.restoreOwn();
  }

  /** The tree kept in the browser (see `restore`), without looking at the page's address. */
  private restoreOwn(): void {
    const saved = this.autosave.read();
    if (saved === 'closed') {
      this.closeQuietly();
      this.autosave.enable();
      return;
    }
    if (saved instanceof Promise) {
      // A big tree kept in IndexedDB: the chart waits for it rather than flashing the empty state.
      this.ui.restoring.set(true);
      void saved.then((xml) => this.reopen(xml)).finally(() => this.ui.restoring.set(false));
      return;
    }
    this.reopen(saved);
  }

  private reopen(saved: string | null): void {
    let doc = null;
    if (saved) {
      try {
        doc = parseTree(saved).doc;
      } catch {
        // A damaged copy should not block the app; fall back to the example.
      }
    }
    // Loaded before the tie to a file goes, so a shared tree being closed is not written over the browser's copy.
    this.store.load(doc ?? sampleDocument());
    this.ui.home.set(false);
    this.forgetFile();
    if (!doc) this.ui.showSampleNote.set(!this.prefs.read().sampleNoteDismissed);
    this.autosave.enable();
  }

  /**
   * Opens the tree a shared link points to, read from Google Drive without signing in, while the chart waits for it as
   * at a reload. Where it cannot be read (not shared with anyone who has the link, gone, or Drive out of reach) a
   * dialog says why and the person's own tree opens as usual.
   */
  private async openShared(id: string): Promise<void> {
    this.ui.restoring.set(true);
    let outcome: DriveOutcome<{ file: DriveFile; text: string }>;
    try {
      outcome = await this.drive.readShared(id, (file, loaded, total) => this.ui.driveLoading.set({ name: file.name, loaded, total }));
    } finally {
      this.ui.driveLoading.set(null);
      this.ui.restoring.set(false);
    }
    if (outcome.status === 'done') {
      this.pending = { shared: outcome.value.file };
      if (this.drive.picks) this.prepareDrive();
      this.openXml(outcome.value.text, outcome.value.file.name);
      this.autosave.enable();
      // Opened, or waiting on the newer-version dialog; a tree that could not be read leaves the person's own one.
      if (this.shared() || this.pending) return;
    } else {
      this.ui.dialog.set({ kind: 'shared-failed', reason: outcome.status === 'missing' ? 'private' : 'failed' });
    }
    this.restoreOwn();
  }

  /** The tree is no longer tied to a file: a new tree, the example family. The browser keeps a copy of it again. */
  private forgetFile(): void {
    this.leaveShared();
    this.pending = null;
    this.source.set(null);
    this.fileBacked.set(false);
    this.autosave.setFileBacked(false);
  }

  /** The tree on screen now is the file's content: Save writes there, and the browser keeps no copy of it. */
  private takeFile(source: TreeSource | null, revision = this.store.revision()): void {
    this.leaveShared();
    this.source.set(source);
    this.store.readOnly.set(source?.kind === 'drive' && source.file.canEdit === false);
    this.fileBacked.set(true);
    this.savedRevision.set(revision);
    this.autosave.setFileBacked(true);
  }

  /** The tree on screen is the one a shared link points to (see `shared`). */
  private takeShared(file: DriveFile): void {
    this.source.set(null);
    this.fileBacked.set(true);
    this.savedRevision.set(this.store.revision());
    this.autosave.setAside();
    this.shared.set(file);
    this.store.readOnly.set(!file.canEdit);
    if (file.canEdit) this.enableSharedEditing(file);
  }

  /** Another tree takes the shared one's place: the address no longer points to it, so a reload does not bring it back. */
  private leaveShared(): void {
    this.shared.set(null);
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.search);
    if (!params.has(SHARE_PARAM)) return;
    params.delete(SHARE_PARAM);
    const search = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  }

  /**
   * Runs `action` at once, or, when the tree has changes its file does not have yet, after the person chose to save
   * them first or to let them go (the unsaved dialog). The dialog's buttons run it from a click, so pickers still open.
   */
  private async whenSaved(action: () => unknown): Promise<void> {
    if (!this.unsaved()) {
      await action();
      return;
    }
    this.ui.dialog.set({ kind: 'unsaved', proceed: action });
  }

  /** Saves the tree (see saveXml) and then runs `action` if nothing is left unsaved. */
  async saveThen(action: () => unknown): Promise<void> {
    this.ui.dialog.set(null);
    await this.saveXml();
    if (!this.unsaved()) await action();
  }

  /** Lets the changes go and runs `action`. */
  async discardThen(action: () => unknown): Promise<void> {
    this.ui.dialog.set(null);
    await action();
  }

  goHome(): void {
    this.ui.closeMenu();
    this.ui.home.set(true);
  }

  async editShared(): Promise<void> {
    const file = this.shared();
    if (!file || !this.drive.configured || !this.drive.picks || this.connecting()) return;
    this.connecting.set(true);
    try {
      const picked = await this.drive.pick('file', this.i18n.code(), this.i18n.t('drive.pickShared'), file.id);
      if (picked.status !== 'done') {
        this.driveProblem(picked);
        return;
      }
      const result = await this.readFromDrive(picked.value);
      if (this.shared()?.id !== file.id) return;
      if (result.status !== 'done') {
        this.driveProblem(result);
        return;
      }
      if (!result.value.file.canEdit) {
        this.toast.error(this.i18n.t('file.driveDenied'));
        return;
      }
      this.pending = { shared: result.value.file };
      this.openXml(result.value.text, result.value.file.name);
    } finally {
      this.connecting.set(false);
    }
  }

  private enableSharedEditing(file: DriveFile): void {
    this.source.set({ kind: 'drive', file });
    this.store.readOnly.set(false);
  }

  /** Closes the tree and goes back to the start page with the recent files. */
  closeTree(): void {
    this.ui.closeMenu();
    // A shared tree was only borrowed: closing it brings back the person's own tree from the browser.
    void this.whenSaved(() => (this.shared() ? this.restoreOwn() : this.closeQuietly()));
  }

  /**
   * The link that opens the tree for anyone, and whether Drive lets anyone with it see the file (see DriveShare). Offered
   * for a tree in Google Drive: one opened from or saved there, or one opened from a shared link.
   */
  shareTree(): void {
    this.ui.closeMenu();
    const source = this.source();
    const own = source?.kind === 'drive' ? source.file : null;
    const file = own ?? this.shared();
    if (file) this.ui.dialog.set({ kind: 'drive-share', file, own: !!own && !this.readOnly() });
  }

  /** The start page: an empty tree in the app's language, tied to no file. */
  private closeQuietly(): void {
    const doc = emptyDocument(this.i18n.t('tree.newTitle'));
    this.store.load({ ...doc, view: { ...doc.view, language: this.i18n.code() } });
    this.ui.home.set(false);
    this.forgetFile();
    this.ui.adding.set(null);
    this.ui.showSampleNote.set(false);
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
    this.closeQuietly();
    this.ui.dialog.set(null);
  }

  loadSample(): void {
    this.ui.closeMenu();
    void this.whenSaved(() => {
      this.store.load(sampleDocument());
      this.ui.home.set(false);
      this.forgetFile();
      this.ui.showSampleNote.set(true);
      this.toast.show(this.i18n.t('file.sampleOpened'));
    });
  }

  dismissSampleNote(): void {
    this.ui.showSampleNote.set(false);
    this.prefs.set({ sampleNoteDismissed: true });
  }

  /** Opens a tree from the computer. Where the browser allows it, Save then writes back to the same file. */
  async openFile(): Promise<void> {
    this.ui.closeMenu();
    await this.whenSaved(() => this.pickFile());
  }

  private async pickFile(): Promise<void> {
    let text: string;
    let name: string;
    let handle: FileSystemFileHandle | undefined;
    let saved: number;
    try {
      const picked = await this.files.pickWithHandle(XML_TYPE, XML_ACCEPT);
      if (!picked) return;
      text = await picked.file.text();
      name = picked.file.name;
      handle = picked.handle;
      saved = picked.file.lastModified;
    } catch {
      this.toast.error(this.i18n.t('file.unreadable'));
      return;
    }
    this.pending = { source: handle ? { kind: 'local', handle, name } : null, recent: { kind: 'local', name, handle, saved } };
    this.openXml(text, name);
  }

  /**
   * True where the Google Drive items are offered: everywhere but inside a viewer, which runs the page in a frame
   * where Google's sign-in does not work. Without a Google Cloud project set up they explain what is missing.
   */
  offersDrive(): boolean {
    return !this.files.hosted;
  }

  /** True when a Google Cloud project is set up, so the Drive items open Google's sign-in (see google-config.ts). */
  driveReady(): boolean {
    return this.drive.configured;
  }

  /** Loads the Google scripts ahead of a click on a Drive item, so the click opens the sign-in at once. */
  prepareDrive(): void {
    if (this.offersDrive() && this.drive.configured) this.drive.prepare();
  }

  /**
   * Signs in to Google Drive (straight from the click, so the pop-up is not blocked) and shows the Google Picker, where
   * any tree the person can see is picked, shared ones too. Without the Picker (no API key) it lists the trees saved
   * there by Stemma instead, to pick one from (`openDriveFile`).
   */
  async openFromDrive(): Promise<void> {
    this.ui.closeMenu();
    if (!this.drive.configured) {
      this.ui.dialog.set({ kind: 'drive-setup' });
      return;
    }
    if (this.drive.picks) {
      const picked = await this.drive.pick('file', this.i18n.code(), this.i18n.t('drive.pickTree'));
      if (picked.status === 'done') await this.openDriveFile(picked.value);
      else this.driveProblem(picked);
      return;
    }
    const outcome = await this.drive.list();
    if (outcome.status === 'done') this.ui.dialog.set({ kind: 'drive-open', files: outcome.value });
    else this.driveProblem(outcome);
  }

  /** Opens a tree picked from the Google Drive list. Save then writes back to that file. */
  async openDriveFile(file: DriveFile): Promise<void> {
    this.ui.dialog.set(null);
    await this.whenSaved(async () => {
      const outcome = await this.readFromDrive(file);
      if (outcome.status === 'done') this.openFromText(outcome.value.text, outcome.value.file);
      else this.driveProblem(outcome);
    });
  }

  /** Reads a tree from Drive, showing how far along it is once the sign-in (if any) is done. */
  private async readFromDrive(file: DriveFile): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    try {
      return await this.drive.read(file, (loaded, total) => this.ui.driveLoading.set({ name: file.name, loaded, total }));
    } finally {
      this.ui.driveLoading.set(null);
    }
  }

  private openFromText(text: string, file: DriveFile): void {
    this.pending = { source: { kind: 'drive', file }, recent: { kind: 'drive', file } };
    this.openXml(text, file.name);
  }

  /**
   * Opens a file from the recent files, read afresh from where it is: the computer (the browser asks again for
   * permission to the file) or Google Drive. Where the browser kept no handle, the file is picked again.
   */
  async openRecent(entry: RecentFile): Promise<void> {
    this.ui.closeMenu();
    if (entry.kind === 'drive' && !this.drive.configured) {
      this.ui.dialog.set({ kind: 'drive-setup' });
      return;
    }
    await this.whenSaved(() => this.readRecent(entry));
  }

  private async readRecent(entry: RecentFile): Promise<void> {
    if (entry.kind === 'drive') {
      const outcome = await this.readFromDrive(entry.file);
      if (outcome.status === 'done') this.openFromText(outcome.value.text, outcome.value.file);
      else if (outcome.status === 'missing') this.recentMissing(entry);
      else this.driveProblem(outcome);
      return;
    }
    if (!entry.handle) {
      await this.pickFile();
      return;
    }
    const outcome = await this.files.readHandle(entry.handle);
    if (outcome.status === 'missing') {
      this.recentMissing(entry);
      return;
    }
    if (outcome.status === 'failed') this.toast.error(this.i18n.t('file.unreadable'));
    if (outcome.status !== 'done') return;
    let text: string;
    try {
      text = await outcome.file.text();
    } catch {
      this.toast.error(this.i18n.t('file.unreadable'));
      return;
    }
    const name = outcome.file.name;
    this.pending = {
      source: { kind: 'local', handle: entry.handle, name },
      recent: { kind: 'local', name, handle: entry.handle, saved: outcome.file.lastModified },
    };
    this.openXml(text, name);
  }

  /** A recent file that is gone is taken off the list. */
  private recentMissing(entry: RecentFile): void {
    void this.recent.forget(entry.key);
    this.toast.error(this.i18n.t('file.recentMissing', { name: entry.name }));
  }

  /** Takes a file off the recent files list. The file itself stays where it is. */
  forgetRecent(entry: RecentFile): void {
    void this.recent.forget(entry.key);
  }

  openXml(xml: string, name?: string, force = false): void {
    const fileName = name ?? this.i18n.t('file.theFile');
    try {
      const result = parseTree(xml, { force });
      this.store.load(result.doc);
      this.ui.home.set(false);
      const pending = this.pending;
      this.pending = null;
      if (pending && 'shared' in pending) {
        this.takeShared(pending.shared);
      } else if (pending) {
        this.takeFile(pending.source);
        void this.recent.remember({ ...pending.recent, title: this.store.doc().meta.title });
        if (pending.recent.kind === 'drive') this.describeDrive(pending.recent.file);
      } else {
        this.forgetFile();
      }
      this.ui.showSampleNote.set(false);
      this.ui.dialog.set(null);
      if (result.warnings.length || result.upgrades.length) {
        this.ui.dialog.set({ kind: 'import-report', title: result.doc.meta.title, notes: result.warnings, upgrades: result.upgrades });
      } else {
        this.toast.show(this.i18n.t(this.shared() ? 'file.openedShared' : 'file.opened', { title: result.doc.meta.title }));
      }
    } catch (e) {
      if (e instanceof XmlFormatError && e.code === 'newer-major') {
        this.ui.dialog.set({ kind: 'newer-version', notice: e, xml, name: fileName });
        return;
      }
      this.pending = null;
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
    const revision = this.store.revision();
    if (source?.kind === 'local') {
      const outcome = await this.files.writeTo(source.handle, new Blob([this.xml()], { type: 'application/xml' }));
      if (outcome === 'saved') this.saved({ kind: 'local', handle: source.handle, name: source.name }, revision);
      this.reportSave(outcome, source.name);
    } else if (source?.kind === 'drive' && !this.readOnly()) {
      const xml = this.xml();
      await this.writeDrive(source.file.name, (progress) => this.drive.update(source.file, xml, progress));
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
    const revision = this.store.revision();
    const saved = await this.files.saveAs(filename, xml, 'application/xml', XML_TYPE);
    if (saved.outcome === 'saved') {
      // A download (no handle) belongs to its file too: the next visit offers it in the recent files, to pick again.
      this.takeFile(saved.handle ? { kind: 'local', handle: saved.handle, name: saved.name } : null, revision);
      void this.recent.remember({
        kind: 'local',
        name: saved.name,
        handle: saved.handle,
        title: this.store.doc().meta.title,
        saved: Date.now(),
        downloaded: !saved.handle,
      });
    }
    if (saved.outcome === 'unsupported') this.ui.dialog.set({ kind: 'xml', xml, filename });
    else this.reportSave(saved.outcome, saved.name);
  }

  /** Saves the tree as a new file in Google Drive, in a folder picked in the Google Picker where there is one. Save then writes there. */
  async saveToDrive(): Promise<void> {
    this.ui.closeMenu();
    if (this.ui.driveSaving()) return;
    const loadId = this.store.loadId();
    if (!this.drive.configured) {
      this.ui.dialog.set({ kind: 'drive-setup' });
      return;
    }
    let folder: DriveFile | undefined;
    if (this.drive.picks) {
      const picked = await this.drive.pick('folder', this.i18n.code(), this.i18n.t('drive.pickFolder'));
      if (picked.status !== 'done') {
        this.driveProblem(picked);
        return;
      }
      folder = picked.value;
    }
    if (this.store.loadId() !== loadId) return;
    const name = datedFilename(this.store.doc().meta.title, 'xml');
    const xml = this.xml();
    await this.writeDrive(name, (progress) => this.drive.create(name, xml, folder, progress));
  }

  private async writeDrive(name: string, write: (progress: DriveProgress) => Promise<DriveOutcome<DriveFile>>): Promise<void> {
    if (this.ui.driveSaving()) return;
    const revision = this.store.revision();
    const loadId = this.store.loadId();
    const progress: DriveProgress = (loaded, total) => this.ui.driveSaving.set({ name, loaded, total });
    progress(0, null);
    try {
      const outcome = await write(progress);
      if (outcome.status !== 'done') {
        this.driveProblem(outcome);
        return;
      }
      if (this.store.loadId() === loadId) {
        if (this.shared()?.id === outcome.value.id) {
          this.savedRevision.set(revision);
        } else {
          this.saved({ kind: 'drive', file: outcome.value }, revision);
        }
      }
      this.toast.show(this.i18n.t('file.savedToDrive', { name: outcome.value.name }));
    } finally {
      this.ui.driveSaving.set(null);
    }
  }

  /** The tree was written to `source` as it stood at `revision`; the recent files put it on top, with its title now. */
  private saved(source: TreeSource, revision: number): void {
    this.takeFile(source, revision);
    const title = this.store.doc().meta.title;
    void this.recent.remember(
      source.kind === 'drive'
        ? { kind: 'drive', file: source.file, title }
        : { kind: 'local', name: source.name, handle: source.handle, title, saved: Date.now() },
    );
    if (source.kind === 'drive') this.describeDrive(source.file);
  }

  /** Asks Drive again about each Drive file in the recent files, where the sign-in is still kept (no pop-up). */
  refreshRecentDrive(): void {
    if (!this.drive.configured) return;
    for (const entry of this.recent.list()) if (entry.kind === 'drive') this.describeDrive(entry.file);
  }

  /** Asks Drive when a file in the recent files was last changed and which folder it is in, without signing in again. */
  private describeDrive(file: DriveFile): void {
    void this.drive.details(file).then((details) => (details ? this.recent.describeDrive(file.id, details) : undefined));
  }

  private reportSave(outcome: SaveOutcome, name: string): void {
    if (outcome === 'saved') this.toast.show(this.i18n.t('file.saved', { name }));
    else if (outcome === 'failed' || outcome === 'unsupported') this.toast.error(this.i18n.t('file.saveFailed'));
  }

  /** Nothing to say when the person closed the sign-in themselves. */
  private driveProblem(outcome: DriveOutcome<unknown>): void {
    if (outcome.status === 'blocked') this.toast.error(this.i18n.t('file.driveBlocked'));
    else if (outcome.status === 'missing') this.toast.error(this.i18n.t('file.driveMissing'));
    else if (outcome.status === 'denied') this.toast.error(this.i18n.t('file.driveDenied'));
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

  /** Before the page goes away: the browser asks the person to stay when the tree has changes its file does not have. */
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.unsaved()) return;
    event.preventDefault();
    // Older browsers ask only when returnValue is set.
    event.returnValue = '';
  }
}
