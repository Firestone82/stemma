import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { surnameKey, unitingOf } from '../../core/model/names';
import { Keep, familyBackgrounds, paintBackgrounds, squareOff } from './family-patches';
import { FONT_SANS } from '../../core/card/card-design';
import { LayoutCard } from '../../core/layout/types';
import { TextMeasurer } from '../../core/services/text-measure';
import { FamilyView } from '../../state/family-view';
import { TreeStore } from '../../core/store/tree-store';
import { I18n } from '../../i18n/i18n';
import { balloonIdOf, isPortal } from '../../core/model/family-view';
import { ChartModel } from '../../state/chart-model';
import { ChartBusy } from '../../state/chart-busy';
import { PersonActions } from '../../state/person-actions';
import { Relation, UiState } from '../../state/ui-state';
import { ContextMenu, ContextMenuItem } from './context-menu/context-menu';
import { FamilyLines } from './family-lines/family-lines';
import { FamilyBalloons, FamilySlot } from './family-balloons/family-balloons';
import { FamilyBar } from './family-bar/family-bar';
import { Screen, coupleCentre, fitView, floatOver, revealView } from './framing';
import { ChartGestures } from './gestures';
import { chartKey, neighbour } from './keyboard';
import { LayoutMotion } from './layout-motion';
import { PersonCard } from './person-card/person-card';
import { Placeholders } from './placeholders/placeholders';
import { QuickAdd } from './quick-add/quick-add';
import { RelativesFilter } from './relatives-filter/relatives-filter';
import { Unions } from './unions/unions';
import { ChartViewport, clampZoom } from './viewport';
import { ZoomControls } from './zoom-controls/zoom-controls';

/**
 * The family tree chart: an SVG canvas that can be dragged and zoomed. It
 * shows the layout from the chart model and turns clicks and keys into
 * selections. Moving the view (viewport, gestures, framing), gliding between
 * layouts (layout-motion) and the keys (keyboard) live in their own files.
 */
@Component({
  selector: 'stemma-chart',
  imports: [FamilyLines, Unions, Placeholders, PersonCard, QuickAdd, ZoomControls, RelativesFilter, ContextMenu, FamilyBalloons, FamilyBar],
  templateUrl: './tree-chart.html',
  styleUrl: './tree-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-panning]': 'gestures.panning()',
    '(keydown)': 'onKey($event)',
  },
})
export class TreeChart {
  protected readonly store = inject(TreeStore);
  protected readonly model = inject(ChartModel);
  protected readonly ui = inject(UiState);
  private readonly people = inject(PersonActions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18n);
  private readonly measure = inject(TextMeasurer);
  protected readonly familyView = inject(FamilyView);
  protected readonly chartBusy = inject(ChartBusy);
  protected readonly t = this.i18n.t;

  /** Space covered by overlays (the bottom sheet on phones), kept clear when fitting. */
  readonly insetBottom = input(0);

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly viewport = new ChartViewport(this.reduceMotion);
  private readonly motion = new LayoutMotion(this.viewport, this.reduceMotion);
  protected readonly gestures = new ChartGestures(
    this.viewport,
    () => this.svgRef().nativeElement,
    () => (this.motion.userMoved = true),
  );
  protected readonly size = signal<Screen>({ w: 0, h: 0 });
  /** The layout on screen; between two layouts it is an in-between frame. */
  protected readonly displayed = this.motion.displayed;
  protected readonly flashId = signal<string | null>(null);

  /** The layout the chart draws. */
  protected readonly shown = this.displayed;

  protected readonly worldTransform = computed(() => {
    const { x, y, k } = this.viewport.view();
    return `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${k.toFixed(4)})`;
  });
  protected readonly dotTransform = computed(() => {
    const { x, y } = this.viewport.view();
    return `translate(${x.toFixed(1)},${y.toFixed(1)})`;
  });
  protected readonly zoomPercent = computed(() => Math.round(this.viewport.view().k * 100));
  protected readonly isEmpty = computed(() => this.store.doc().people.length === 0);

  protected readonly selectedId = computed(() => {
    const s = this.store.selection();
    return s?.kind === 'person' ? s.id : null;
  });

  protected readonly selectedCard = computed<LayoutCard | undefined>(() => {
    const id = this.selectedId();
    return id ? this.shown().cards.find((c) => c.personId === id && !c.ghost) : undefined;
  });

  protected readonly selectedUnion = computed(() => {
    const s = this.store.selection();
    if (s?.kind !== 'family') return null;
    const u = this.shown().unions.find((x) => x.familyId === s.id);
    return u ? { x: u.x, y: u.y } : null;
  });

  /** The person whose card the pointer is on: their families' lines light up. */
  protected readonly hoverId = signal<string | null>(null);

  // -- the family view's balloons -------------------------------------------

  /** In the family view: the chart shows some families, not the whole tree. */
  protected readonly familyActive = computed(() => this.model.familyKeys().length > 0);

  /** The words and shields on each balloon, short enough for a card. */
  private readonly balloonTexts = computed<ReadonlyMap<string, { text: string; width: number; shields: string[] }>>(() => {
    this.measure.fontsVersion();
    const names = this.model.familyNames();
    const tinctures = this.model.familyTinctures();
    const width = (text: string) => this.measure.width(text, BALLOON_FONT);
    const out = new Map<string, { text: string; width: number; shields: string[] }>();
    for (const b of this.model.balloons()) {
      const labels = b.keys.map((k) => names.get(k)?.label ?? k);
      const shields = b.keys.slice(0, 3).map((k) => tinctures.get(k) ?? 'argent');
      const room = this.model.design().width - 18 - shields.length * 13;
      // All the names; then the first two and how many more; then the first; then as much of it as fits.
      const tries = [labels.join(', ')];
      if (labels.length > 2) tries.push(`${labels[0]}, ${labels[1]} +${labels.length - 2}`);
      if (labels.length > 1) tries.push(`${labels[0]} +${labels.length - 1}`);
      let text = tries.find((t) => width(t) <= room);
      if (text === undefined) {
        let cut = tries[tries.length - 1];
        while (cut.length > 1 && width(`${cut}…`) > room) cut = cut.slice(0, -1);
        text = `${cut}…`;
      }
      out.set(b.id, { text, width: width(text), shields });
    }
    return out;
  });

  /** What each balloon says to a screen reader and in its tooltip. */
  protected readonly balloonLabels = computed<ReadonlyMap<string, string>>(() => {
    const index = this.store.index();
    const names = this.model.familyNames();
    return new Map(
      this.model.balloons().map((b) => {
        const families = this.i18n.list(b.keys.map((k) => names.get(k)?.label ?? k));
        const name = this.i18n.name(index.person(b.personId));
        return [b.id, this.t(`familyView.balloon.${b.kind}`, { name, families })];
      }),
    );
  });

  protected readonly showFamilies = (count: number) => this.t('familyView.show', { count });

  /** The families left off, each where the layout put its stand-in: the place its first card would have. */
  protected readonly familySlots = computed<FamilySlot[]>(() => {
    const balloons = new Map(this.model.balloons().map((b) => [b.id, b]));
    const texts = this.balloonTexts();
    return this.shown().placeholders.flatMap((p) => {
      if (!isPortal(p.familyId)) return [];
      const b = balloons.get(balloonIdOf(p.familyId));
      const text = b && texts.get(b.id);
      return b && text ? [{ id: b.id, kind: b.kind, x: p.x, y: p.y, w: p.w, h: p.h, ...text }] : [];
    });
  });

  /** A balloon brings its families onto the chart, with the nearest of them (the father, the first child, the partner) in view. */
  protected onBalloonPick(id: string): void {
    if (this.gestures.swallowClick()) return;
    const balloon = this.model.balloons().find((b) => b.id === id);
    if (balloon) this.familyView.add(balloon.keys, balloon.people[0]);
  }

  /** What a click on each line takes out of the family view, as its tooltip (by family id). */
  protected readonly cutTitles = computed<ReadonlyMap<string, string>>(() => {
    const names = this.model.familyNames();
    const label = (keys: readonly string[]) => {
      const labels = keys.map((k) => names.get(k)?.label ?? k);
      return labels.length === 1 ? this.t('familyView.remove', { name: labels[0] }) : this.t('familyView.removeMany', { names: this.i18n.list(labels) });
    };
    return new Map([...this.model.familyCuts()].map(([familyId, keys]) => [familyId, label(keys)]));
  });

  /** A line in a family view takes the families it brought in back out. */
  protected onCut(familyId: string): void {
    if (this.gestures.swallowClick()) return;
    const keys = this.model.familyCuts().get(familyId);
    if (keys) this.familyView.remove(keys);
  }

  /** Where the quick-add buttons float, in screen pixels. */
  protected readonly quickAdd = computed(() => {
    const c = this.selectedCard();
    const person = this.store.selectedPerson();
    if (!c || !person || this.gestures.panning() || this.ui.adding() || this.ui.narrow()) return null;
    const view = this.viewport.view();
    // Zoomed far out the buttons would cover the neighbours; the panel has the same actions.
    if (view.k < 0.5) return null;
    return {
      ...floatOver(c, view),
      parentsFull: (this.store.index().primaryParentFamily(person.id)?.partners.length ?? 0) >= 2,
      isFocus: person.id === this.model.focusId(),
      name: this.i18n.name(person),
    };
  });

  private pendingFit = true;

  constructor() {
    effect(() => {
      const target = this.model.layout();
      const loadId = this.store.loadId();
      untracked(() => {
        // Keep the person being worked on still while the chart rearranges.
        const anchors = [this.selectedId(), this.ui.adding()?.personId].filter((x): x is string => !!x);
        if (this.motion.show(target, loadId, anchors)) {
          this.pendingFit = true;
          if (this.size().w) this.initialView();
        }
      });
    });
    effect(() => {
      const req = this.ui.focusRequest();
      if (req) untracked(() => this.centreOnPerson(req.personId));
    });
    effect(() => {
      const req = this.ui.centreRequest();
      if (req) untracked(() => this.centreOnCouple(req.personId));
    });
    let firstFit = true;
    effect(() => {
      this.ui.fitRequest();
      if (firstFit) {
        firstFit = false;
        return;
      }
      untracked(() => this.fit(this.ui.fitAnimated));
    });
    effect(() => {
      const f = this.ui.flash();
      if (!f) return;
      untracked(() => {
        this.flashId.set(f.personId);
        setTimeout(() => {
          if (this.flashId() === f.personId) this.flashId.set(null);
        }, 1400);
      });
    });
    // Keep the selected person in view when the selection changes.
    effect(() => {
      const id = this.selectedId();
      if (id) untracked(() => setTimeout(() => this.ensureVisible(id), 0));
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => this.attach(destroyRef));
  }

  // -- view -----------------------------------------------------------------

  /** The part of the chart not covered by the bottom sheet. */
  private visible(): Screen {
    const { w, h } = this.size();
    return { w, h: Math.max(120, h - this.insetBottom()) };
  }

  /**
   * The first view of a tree: everything when that is readable, otherwise the
   * home person at a comfortable zoom (a wide tree on a phone would be specks).
   */
  private initialView(): void {
    this.fit(false);
    if (this.viewport.view().k >= 0.45) return;
    const doc = this.store.doc();
    const id = doc.meta.homePersonId ?? doc.people[0]?.id;
    const c = id ? this.model.layout().cards.find((x) => x.personId === id && !x.ghost) : undefined;
    if (!c) return;
    const { w, h } = this.visible();
    this.viewport.centreOn(c.x + c.w / 2, c.y + c.h / 2, 0.72, w, h, false);
  }

  protected fit(animate: boolean): void {
    const screen = this.visible();
    if (!screen.w || !screen.h) {
      this.pendingFit = true;
      return;
    }
    this.pendingFit = false;
    const layout = this.model.layout();
    this.viewport.go(fitView(layout.bounds, screen), animate);
  }

  private centreOnPerson(personId: string): void {
    const c = this.model.layout().cards.find((x) => x.personId === personId && !x.ghost);
    if (!c) return;
    const { w, h } = this.visible();
    this.viewport.centreOn(c.x + c.w / 2, c.y + c.h / 2, Math.max(this.viewport.view().k, 0.75), w, h, true);
  }

  /** Brings a person and their partner to the middle of the view. */
  private centreOnCouple(personId: string): void {
    const centre = coupleCentre(this.model.layout(), this.store.index(), personId);
    if (!centre) return;
    const { w, h } = this.visible();
    this.motion.userMoved = true;
    this.viewport.centreOn(centre.x, centre.y, clampZoom(Math.min(Math.max(this.viewport.view().k, 0.6), 1.1)), w, h, true);
  }

  private ensureVisible(personId: string): void {
    const c = this.model.layout().cards.find((x) => x.personId === personId && !x.ghost);
    const view = c ? revealView(c, this.viewport.view(), this.visible()) : null;
    if (view) this.viewport.go(view, true);
  }

  protected zoom(factor: number): void {
    const { w, h } = this.visible();
    this.viewport.zoomAt(factor, w / 2, h / 2, true);
  }

  private attach(destroyRef: DestroyRef): void {
    const host = this.host.nativeElement;
    const svg = this.svgRef().nativeElement;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const prev = this.size();
      this.size.set({ w: rect.width, h: rect.height });
      if (this.pendingFit || (!prev.w && rect.width)) this.initialView();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    if (!ro) measure();
    const wheel = (e: WheelEvent) => this.gestures.wheel(e);
    svg.addEventListener('wheel', wheel, { passive: false });
    destroyRef.onDestroy(() => {
      ro?.disconnect();
      svg.removeEventListener('wheel', wheel);
      this.viewport.stop();
      this.motion.stop();
    });
  }

  // -- pointer ----------------------------------------------------------------

  protected onPointerDown(e: PointerEvent): void {
    this.gestures.down(e);
  }

  protected onPointerMove(e: PointerEvent): void {
    this.gestures.move(e);
  }

  protected onPointerUp(e: PointerEvent): void {
    this.gestures.up(e);
  }

  // -- picking ----------------------------------------------------------------

  protected onBackgroundClick(): void {
    if (this.gestures.swallowClick()) return;
    this.ui.adding.set(null);
    this.store.selectPerson(null);
  }

  protected onCardPick(personId: string, event: Event): void {
    event.stopPropagation();
    if (this.gestures.swallowClick()) return;
    if (this.ui.adding()?.personId !== personId) this.ui.adding.set(null);
    this.store.selectPerson(personId);
    // On a phone, a person tapped while zoomed far out is brought up close.
    if (this.ui.narrow() && this.viewport.view().k < 0.5) this.centreOnPerson(personId);
  }

  /** Double click centres the tree on someone; their relatives are then named from them. */
  protected onCardDoubleClick(personId: string, event: Event): void {
    event.stopPropagation();
    this.store.selectPerson(personId);
    this.people.centreOn(personId);
  }

  protected onUnionPick(familyId: string): void {
    if (this.gestures.swallowClick()) return;
    this.people.openFamily(familyId);
  }

  protected onPlaceholderPick(familyId: string): void {
    if (this.gestures.swallowClick()) return;
    const first = this.store.index().family(familyId)?.children[0]?.personId;
    if (first) this.people.startAdd('parent', first);
  }

  protected startAdd(relation: Relation): void {
    const id = this.selectedId();
    if (id) this.people.startAdd(relation, id);
  }

  protected centreHere(): void {
    const id = this.selectedId();
    if (id) this.people.centreOn(id);
  }

  // -- the menu on a right click ---------------------------------------------

  /** The menu open on the chart: at a point, for a person or for the chart itself. */
  protected readonly menu = signal<{ x: number; y: number; personId?: string } | null>(null);

  protected readonly menuTitle = computed(() => {
    const m = this.menu();
    const person = m?.personId ? this.store.index().person(m.personId) : undefined;
    return person ? this.i18n.name(person) : '';
  });

  protected readonly menuItems = computed<ContextMenuItem[]>(() => {
    const m = this.menu();
    if (!m) return [];
    const t = this.t;
    const names = this.model.familyNames();
    const familyName = (key: string) => names.get(key)?.label ?? key;
    if (!m.personId) {
      const items: ContextMenuItem[] = [
        { id: 'add', label: t('overview.addPerson'), icon: 'plus' },
        { id: 'fit', label: t('zoom.fit'), icon: 'fit' },
      ];
      if (this.familyActive()) items.push({ id: 'whole', label: t('familyView.wholeTree'), icon: 'people', separated: true });
      return items;
    }
    const index = this.store.index();
    const parentsFull = (index.primaryParentFamily(m.personId)?.partners.length ?? 0) >= 2;
    const items: ContextMenuItem[] = [{ id: 'open', label: t('common.open'), icon: 'person' }];
    if (!parentsFull) items.push({ id: 'parent', label: t('menu.addParent'), icon: 'parent', separated: true });
    items.push(
      { id: 'partner', label: t('menu.addPartner'), icon: 'partner', separated: parentsFull },
      { id: 'child', label: t('menu.addChild'), icon: 'child' },
      { id: 'sibling', label: t('menu.addSibling'), icon: 'sibling' },
    );
    if (m.personId !== this.model.focusId()) items.push({ id: 'centre', label: t('person.centreHere'), icon: 'target', separated: true });
    // From the whole tree a family view starts with this person's family; in one, it is added.
    const key = this.model.familyKeyOf().get(m.personId) ?? '';
    const shown = this.model.familyKeys();
    if (!shown.includes(key)) {
      const label = shown.length ? t('familyView.add', { name: familyName(key) }) : t('familyView.showOnly', { name: familyName(key) });
      items.push({ id: 'family', label, icon: 'tree', separated: m.personId === this.model.focusId() });
    }
    const hidden = !!index.person(m.personId)?.hiddenFromPrint;
    items.push({
      id: 'print',
      label: t(hidden ? 'person.showOnPrint' : 'person.hideFromPrint'),
      icon: hidden ? 'printer' : 'noPrint',
      separated: m.personId === this.model.focusId() && !items.some((i) => i.id === 'family'),
    });
    items.push({ id: 'delete', label: t('person.delete'), icon: 'trash', danger: true });
    return items;
  });

  /** A right click (or a long press) on a card or on the chart opens the menu there. */
  protected onContextMenu(event: MouseEvent, personId?: string): void {
    event.preventDefault();
    event.stopPropagation();
    const box = this.host.nativeElement.getBoundingClientRect();
    if (personId) {
      if (this.ui.adding()?.personId !== personId) this.ui.adding.set(null);
      this.store.selectPerson(personId);
    }
    this.menu.set({ x: event.clientX - box.left, y: event.clientY - box.top, personId });
  }

  protected onMenuPick(id: string): void {
    const m = this.menu();
    this.menu.set(null);
    if (!m) return;
    if (!m.personId) {
      if (id === 'add') this.people.addLoosePerson();
      else if (id === 'fit') this.fit(true);
      else if (id === 'whole') this.familyView.exit();
      return;
    }
    switch (id) {
      case 'open':
        this.people.select(m.personId);
        this.ui.sheetExpanded.set(true);
        break;
      case 'parent':
      case 'partner':
      case 'child':
      case 'sibling':
        this.people.startAdd(id, m.personId);
        break;
      case 'centre':
        this.people.centreOn(m.personId);
        break;
      case 'print': {
        const hidden = !!this.store.index().person(m.personId)?.hiddenFromPrint;
        this.people.update(m.personId, { hiddenFromPrint: hidden ? undefined : true }, 'hiddenFromPrint');
        break;
      }
      case 'family':
        this.familyView.add(this.model.familyKeyOf().get(m.personId) ?? '', m.personId);
        break;
      case 'delete':
        this.people.askDelete(m.personId);
        break;
    }
  }

  // -- keyboard ---------------------------------------------------------------

  protected onKey(e: KeyboardEvent): void {
    const key = chartKey(e);
    if (!key) return;
    if (key.kind === 'zoom') this.zoom(key.factor);
    else if (key.kind === 'fit') this.fit(true);
    else {
      const id = this.selectedId();
      const next = id ? neighbour(this.store.index(), this.displayed().cards, id, key.direction) : undefined;
      if (!next) return;
      this.store.selectPerson(next);
      queueMicrotask(() => this.host.nativeElement.querySelector<SVGElement>(`[data-person="${next}"]`)?.focus({ preventScroll: true }));
    }
    e.preventDefault();
  }

  /**
   * Behind the cards of each family (ViewSettings.familyBackgrounds): boxes round the cards of the family that
   * stand together, filled out unit by unit (see familyBackgrounds), as rectangles that never overlap (see
   * paintBackgrounds): plain shapes, so a zoom only scales them.
   */
  protected readonly clusters = computed(() => {
    if (!this.model.view().familyBackgrounds) return { painted: [], stripes: [] };
    const layout = this.shown();
    const index = this.store.index();
    // Everyone in their own family; and whoever married into a family, in that family too (the couple stands in
    // one box, and only the one who married in is striped in the colours of both).
    const of = new Map<string, Set<string>>();
    const born = this.model.familyKeyOf();
    const united = unitingOf(this.store.doc().view);
    const nowIn = (id: string) => surnameKey(index.person(id)?.name.surname, united);
    /** Of a couple, the one who married into the other's family: who took the other's name; or else the wife. */
    const marriedIn = (a: string, b: string): string | undefined => {
      const took = (x: string, y: string) => !!born.get(y) && nowIn(x) === born.get(y) && born.get(x) !== born.get(y);
      if (took(a, b)) return a;
      if (took(b, a)) return b;
      const sex = (x: string) => index.person(x)?.sex;
      if (sex(a) === 'female' && sex(b) === 'male') return a;
      if (sex(b) === 'female' && sex(a) === 'male') return b;
      return undefined;
    };
    const add = (personId: string, tincture: string) => {
      if (tincture === 'argent') return;
      const set = of.get(personId) ?? new Set<string>();
      set.add(tincture);
      of.set(personId, set);
    };
    for (const c of layout.cards) add(c.personId, this.tinctureOf(c.personId));
    for (const u of layout.unions) {
      const [a, b] = index.family(u.familyId)?.partners ?? [];
      if (!a || !b) continue;
      const into = marriedIn(a, b);
      if (into) add(into, this.tinctureOf(into === a ? b : a));
    }
    // A child and its parents: one patch of their family, however far apart they stand.
    const at = new Map<string, number[]>();
    layout.cards.forEach((c, i) => at.set(c.personId, [...(at.get(c.personId) ?? []), i]));
    const links: [number, number][] = [];
    for (const l of layout.lines)
      for (const parent of index.family(l.familyId)?.partners ?? [])
        for (const a of at.get(l.childId) ?? []) for (const b of at.get(parent) ?? []) links.push([a, b]);
    // Squared off where a gap in a family's background is small and empty: the cards, and every line, stay
    // clear of the families they are not in.
    const keep: Keep[] = [
      ...layout.cards.map((c) => ({ box: c, tinctures: [...(of.get(c.personId) ?? [])] })),
      ...layout.placeholders.map((h) => ({ box: h, tinctures: [] })),
      ...layout.lines.flatMap((l) => {
        const tinctures = [l.childId, ...(index.family(l.familyId)?.partners ?? [])].flatMap((id) => [...(of.get(id) ?? [])]);
        return l.points.slice(1).map((b, i) => ({ box: lineBox(l.points[i], b), tinctures }));
      }),
      ...layout.unions.flatMap((u) => {
        const tinctures = (index.family(u.familyId)?.partners ?? []).flatMap((id) => [...(of.get(id) ?? [])]);
        return u.line.slice(1).map((b, i) => ({ box: lineBox(u.line[i], b), tinctures }));
      }),
    ];
    const o = this.model.options();
    const painted = squareOff(
      paintBackgrounds(
        familyBackgrounds(
          layout.cards,
          layout.cards.map((c) => [...(of.get(c.personId) ?? [])]),
          CLUSTER_PAD,
          links,
        ),
      ),
      keep,
      o.cardWidth,
      CLUSTER_PAD * 5,
    );
    const pairs = new Map<string, { id: string; a: string; b: string }>();
    for (const p of painted) if (p.with) pairs.set(`${p.tincture}-${p.with}`, { id: `stemma-stripes-${p.tincture}-${p.with}`, a: p.tincture, b: p.with });
    return { painted, stripes: [...pairs.values()] };
  });

  protected tinctureOf(personId: string) {
    return this.model.colors().byPerson.get(personId) ?? 'argent';
  }
}

const BALLOON_FONT = `500 14px ${FONT_SANS}`;
/** The box a straight stretch of a line takes, a hair thick. */
function lineBox(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x) - 1;
  const y = Math.min(a.y, b.y) - 1;
  return { x, y, w: Math.abs(a.x - b.x) + 2, h: Math.abs(a.y - b.y) + 2 };
}

/** How far a family's background reaches round each of its cards: about half the room between cards standing together. */
const CLUSTER_PAD = 10;
