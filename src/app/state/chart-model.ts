import { Injectable, computed, inject } from '@angular/core';
import { ColorAssignment, Tincture, assignColors, preferredSpelling } from '../core/colors/tinctures';
import { Kin, kinship } from '../core/kinship/kinship';
import { ChartLanguage, chartLanguage, kinLabel, surnameLinesIn } from '../core/lang/language';
import { CardDesign, CardParts, cardDesign } from '../core/card/card-design';
import { Layouter } from '../core/layout/engine';
import { chartAnchor } from '../core/layout/structure';
import { fitLayout } from '../core/layout/fit';
import { LAYOUT, LayoutOptions, LayoutResult } from '../core/layout/types';
import { displayName, initials, nameUnknown, surnameKey, unitingOf } from '../core/model/names';
import { FamilyBalloon, familyBalloons, familyViewScope, isPortal, withPortals } from '../core/model/family-view';
import { isBrokenUp, relationshipStatus } from '../core/model/relationship';
import { birthGroupOf } from '../core/model/births';
import { birthSurname, birthSurnameUnknown } from '../core/model/surnames';
import { diedAtBirth } from '../core/model/completeness';
import { missingText } from '../shared/missing';
import { DataChecks } from './data-checks';
import { RELATIVES, Relatives, Scope, ScopeOptions, relativesOf, relativesSettings, scopeDocument } from '../core/poster/scope';
import { TreeIndex } from '../core/model/tree-index';
import { Sex, TreeDocument, ViewSettings } from '../core/model/types';
import { TextMeasurer } from '../core/services/text-measure';
import { TreeStore } from '../core/store/tree-store';
import { I18n } from '../i18n/i18n';
import { FamilyView } from './family-view';

export interface CardLabel {
  given: string;
  surname: string;
  /** The surname at birth when it differs from the surname: "née Barlow". */
  birth: string;
  dates: string;
  initials: string;
  /** Full name and dates, for tooltips and screen readers. */
  title: string;
  sex: Sex;
  deceased: boolean;
  /** Nobody knows the given name: the card says "Unknown" and is drawn dashed. */
  unknown: boolean;
  /** Left out of prints: a small crossed-out printer in the card's corner. */
  hiddenFromPrint: boolean;
  /** Died the day they were born: a white ribbon instead of the black one. */
  diedAtBirth: boolean;
  /** What still has to be filled in ("To fill in: year of birth"); empty when nothing. Flagged on the card. */
  missing: string;
  /** Dates on this person's record that cannot be right (see DataChecks), one a line; empty when none. */
  problem: string;
  /** How they are related to the person in the middle ("Aunt"), for the line at the top of the card; empty without it. */
  kin: string;
}

/** The room the chart is shaped for. It suits a screen and a hand that moves it sideways: wider than a screen is, and low. */
const SCREEN = { w: 2400, h: 1000, centred: 0 };

/**
 * Everything the chart draws, derived from the store: the layout, colours,
 * relationship names and card labels. The layout is only recomputed when the
 * shape of the tree changes, not when someone edits a name or a date. It is the
 * same whoever the tree is centred on: centring on someone else changes only
 * what the cards say about how everyone is related to them.
 */
@Injectable({ providedIn: 'root' })
export class ChartModel {
  private readonly store = inject(TreeStore);
  private readonly measure = inject(TextMeasurer);
  private readonly i18n = inject(I18n);
  private readonly familyView = inject(FamilyView);
  private readonly checks = inject(DataChecks);

  readonly view = computed<ViewSettings>(() => this.store.doc().view, { equal: shallowEqual });
  /**
   * The words on the chart (relationship names, couples, dates) are in the
   * app's language: one setting for both. The `language` a file carries is
   * written when the tree is saved, for older versions.
   */
  readonly language = computed<ChartLanguage>(() => chartLanguage(this.i18n.code()));

  /** Which parts the cards have: as the view settings say, with a line for the surname at birth when anyone has one. */
  readonly parts = computed<CardParts>(
    () => {
      const v = this.view();
      return {
        emblem: v.showEmblems,
        emblemTop: v.emblemAlign === 'top',
        birthName: v.showBirthNames && this.birthRow(),
        dates: v.dates !== 'none',
        sexAccent: v.sexColors,
        kin: v.showRelationships,
      };
    },
    { equal: shallowEqual },
  );

  /** Where everything sits on a card (see core/card/card-design): the same card as on prints. */
  readonly design = computed<CardDesign>(() => cardDesign(this.parts()));

  readonly options = computed<LayoutOptions>(
    () => {
      const d = this.design();
      return { ...LAYOUT, cardWidth: d.width, cardHeight: d.height };
    },
    { equal: (a, b) => a.cardWidth === b.cardWidth && a.cardHeight === b.cardHeight },
  );

  /**
   * The person the tree is centred on: relationship names are relative to them, and the Relatives setting
   * reaches out from them. The chart is not drawn around them (see `layout`).
   */
  readonly focusId = computed<string | undefined>(() => {
    const doc = this.store.doc();
    const index = this.store.index();
    return index.person(doc.meta.homePersonId) ? doc.meta.homePersonId : doc.people[0]?.id;
  });

  /** The focus person's current partner, who shares the middle of the chart with them. */
  readonly focusPartnerId = computed<string | undefined>(() => currentPartner(this.store.index(), this.focusId()));

  readonly kin = computed<ReadonlyMap<string, Kin>>(() => kinship(this.store.index(), this.focusId()));

  /** Twins (triplets…) of the person in the middle: how many were born together, by person. */
  readonly focusBornWith = computed<ReadonlyMap<string, number>>(() => {
    const id = this.focusId();
    const group = id ? birthGroupOf(this.store.doc(), id) : undefined;
    return new Map(group ? group.memberIds.filter((m) => m !== id).map((m) => [m, group.memberIds.length]) : []);
  });

  /**
   * The part of the tree the chart shows by the Relatives setting, around the
   * person in the middle and their partner. Undefined when that is everyone.
   */
  private readonly scope = computed<Scope | undefined>(() => {
    const family = this.familyScope();
    if (family) return family;
    // As the setting reads: a file's second cousins (branches 3) count as everyone.
    const { branches, inLawFamilies, siblingsOnly } = relativesSettings(relativesOf(this.view()));
    const around = this.around();
    if (!around || (branches === 'all' && inLawFamilies)) return undefined;
    return scopeDocument(this.store.doc(), this.store.index(), { ...around, branches, inLawFamilies, siblingsOnly });
  });

  /** The family each person was born into, as a surnameKey: Šárka née Nováková is a Novák. */
  readonly familyKeyOf = computed<ReadonlyMap<string, string>>(() => {
    const births = this.birthSurnames();
    const united = unitingOf(this.store.doc().view);
    return new Map(this.store.doc().people.map((p) => [p.id, surnameKey(births.get(p.id) || p.name.surname, united)]));
  });

  /** Every family in the tree by key: its name as written (the base form: Novák) and how many were born into it. */
  readonly familyNames = computed<ReadonlyMap<string, { label: string; count: number }>>(() => {
    const births = this.birthSurnames();
    const keyOf = this.familyKeyOf();
    const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
    for (const p of this.store.doc().people) {
      const key = keyOf.get(p.id) ?? '';
      const raw = (births.get(p.id) || p.name.surname).trim();
      const g = groups.get(key) ?? { spellings: new Map<string, number>(), count: 0 };
      if (raw) g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
      g.count++;
      groups.set(key, g);
    }
    const out = new Map<string, { label: string; count: number }>();
    for (const [key, g] of groups) out.set(key, { label: key ? preferredSpelling(g.spellings) : this.i18n.t('overview.noSurname'), count: g.count });
    return out;
  });

  /** The colour of a family's shields; families of one person have none of their own. */
  readonly familyTinctures = computed<ReadonlyMap<string, Tincture>>(
    () =>
      new Map(
        this.colors()
          .legend.filter((e) => e.key)
          .map((e) => [e.key, e.tincture]),
      ),
  );

  /** The families the family view shows that are in the tree; empty for the whole tree. */
  readonly familyKeys = computed<readonly string[]>(
    () => {
      const names = this.familyNames();
      return (this.familyView.keys() ?? []).filter((k) => names.has(k));
    },
    { equal: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );

  /** The part of the tree the family view shows; undefined for the whole tree. */
  private readonly familyScope = computed<Scope | undefined>(() => {
    const keys = this.familyKeys();
    if (!keys.length) return undefined;
    const keyOf = this.familyKeyOf();
    return familyViewScope(this.store.doc(), this.store.index(), new Set(keys), (id) => keyOf.get(id) ?? '', this.focusId());
  });

  /**
   * In a family view of more than one family, the families a click on a line
   * takes back out (by the line's family id): of the families in view among
   * the people the line joins, the ones added last, with any added together
   * with them. With one family in view there is nothing to take out.
   */
  readonly familyCuts = computed<ReadonlyMap<string, readonly string[]>>(() => {
    const keys = this.familyKeys();
    const scope = this.familyScope();
    if (!scope || keys.length < 2) return new Map();
    const keyOf = this.familyKeyOf();
    const batch = new Map(keys.map((k) => [k, this.familyView.batchOf(k)]));
    const out = new Map<string, readonly string[]>();
    for (const f of scope.doc.families) {
      let last = -1;
      for (const id of [...f.partners, ...f.children.map((c) => c.personId)]) last = Math.max(last, batch.get(keyOf.get(id) ?? '') ?? -1);
      if (last < 0) continue;
      const cut = keys.filter((k) => batch.get(k) === last);
      // Taking out every family would leave nothing to show.
      if (cut.length < keys.length) out.set(f.id, cut);
    }
    return out;
  });

  /** In the family view, the families left off that the people on the chart are joined to. */
  readonly balloons = computed<readonly FamilyBalloon[]>(() => {
    const scope = this.familyScope();
    if (!scope) return [];
    const keyOf = this.familyKeyOf();
    return familyBalloons(this.store.doc(), this.store.index(), scope.people, (id) => keyOf.get(id) ?? '');
  });

  /** People the Relatives setting (or the family view) leaves out of the chart. */
  readonly hidden = computed<ReadonlySet<string>>(
    () => {
      const scope = this.scope();
      return scope
        ? new Set(
            this.store
              .doc()
              .people.filter((p) => !scope.people.has(p.id))
              .map((p) => p.id),
          )
        : NOBODY;
    },
    { equal: sameSet },
  );

  /** How many people each step of the Relatives setting shows. Worked out only when asked for. */
  readonly relativesCounts = computed<Readonly<Record<Relatives, number>>>(() => {
    const doc = this.store.doc();
    const around = this.around();
    const counts = {} as Record<Relatives, number>;
    for (const r of RELATIVES) {
      counts[r] = around && r !== 'everyone' ? scopeDocument(doc, this.store.index(), { ...around, ...relativesSettings(r) }).people.size : doc.people.length;
    }
    return counts;
  });

  /** The chart's part of the tree is reckoned from the couple in the middle, all generations up and down. */
  private around(): Omit<ScopeOptions, 'branches' | 'inLawFamilies'> | undefined {
    const centerId = this.focusId();
    return centerId ? { centerId, partnerId: this.focusPartnerId(), ancestors: 'all', descendants: 'all' } : undefined;
  }

  /** What the chart lays out: the people it shows and, in a family view, a stand-in for each family left off. */
  private readonly laidOut = computed(() => {
    const doc = this.scope()?.doc ?? this.store.doc();
    return this.familyScope() ? withPortals(doc, this.store.index(), this.balloons()) : doc;
  });

  private readonly structure = computed(() => structureOf(this.laidOut(), this.store.loadId()), {
    equal: (a, b) => a.key === b.key,
  });

  /**
   * The chart: laid out top to bottom, generation by generation, in the shape that suits a screen (see
   * core/layout), around the person the shape of the tree gives (see chartAnchor) and their partner, not
   * around the one it is centred on: it looks the same whoever that is. Worked out again only when the shape
   * of the tree changes.
   */
  readonly layout = computed<LayoutResult>(() => {
    const s = this.structure();
    const options = this.options();
    const index = new TreeIndex(s.doc);
    const anchor = chartAnchor(index, (id) => !isPortal(id));
    const partner = currentPartner(index, anchor);
    // Families hang together wherever there is room, and no line crosses another.
    const layouter = new Layouter(index, options, anchor, partner && !isPortal(partner) ? partner : undefined);
    // Couples stay side by side on screen, where they are worked on.
    const layout = fitLayout(layouter, options, SCREEN, 'quick', { stack: false }).layout;
    // The stand-ins of a family view are not people: they go with the empty places, where the chart draws their buttons.
    if (!layout.cards.some((c) => isPortal(c.personId))) return layout;
    const ranks = new Map([...layout.ranks].filter(([id]) => !isPortal(id)));
    return {
      ...layout,
      cards: layout.cards.filter((c) => !isPortal(c.personId)),
      placeholders: [
        ...layout.placeholders,
        ...layout.cards.filter((c) => isPortal(c.personId)).map((c) => ({ familyId: c.personId, x: c.x, y: c.y, w: c.w, h: c.h })),
      ],
      ranks,
      generations: new Set(ranks.values()).size,
    };
  });

  /** How each person is related to the one in the middle, as their card says: "Bývalá manželka strýce". */
  private readonly relations = computed<ReadonlyMap<string, string>>(() => {
    const lang = this.language();
    const kin = this.kin();
    const bornWith = this.focusBornWith();
    return new Map(this.store.doc().people.map((p) => [p.id, kinLabel(lang, kin.get(p.id), p.sex, bornWith.get(p.id))]));
  });

  /** `full` when it fits in `max`, otherwise `short`. */
  private fitting(full: string, short: string, font: string, max: number): string {
    return this.measure.fit(full, font, max) === full ? full : short;
  }

  /** The surname each person was born with: as recorded, or their father's in the chart's language. */
  readonly birthSurnames = computed<ReadonlyMap<string, string>>(() => {
    const index = this.store.index();
    const form = this.language().surnameFor;
    return new Map(this.store.doc().people.map((p) => [p.id, birthSurname(index, p, form)]));
  });

  /** Each person's surname line, and the line under it when they were born with another surname. */
  private readonly surnameLines = computed(() => {
    const lang = this.language();
    const births = this.birthSurnames();
    const index = this.store.index();
    const unknown = this.store.doc().view.unknownBirthNames;
    return new Map(this.store.doc().people.map((p) => [p.id, surnameLinesIn(lang, p, births.get(p.id), unknown && birthSurnameUnknown(index, p))]));
  });

  /** Whether anyone has a surname at birth to show: all cards then make room for the line, so all are one size. */
  readonly birthRow = computed(() => [...this.surnameLines().values()].some((l) => !!l.birth));

  /**
   * The colours of the name shields: one per family name, taken from the
   * surname each person was born with. The `colorBy` a file may carry is no
   * longer used.
   */
  readonly colors = computed<ColorAssignment>(() => {
    const births = this.birthSurnames();
    // On the chart every family has a colour, a family of one too (in prints those are "Other families").
    return assignColors(this.store.doc(), 'family', this.layout().ranks, (p) => births.get(p.id) || p.name.surname.trim(), undefined, true);
  });

  readonly labels = computed<ReadonlyMap<string, CardLabel>>(() => {
    this.measure.fontsVersion();
    const doc = this.store.doc();
    const view = this.view();
    const lang = this.language();
    const relations = this.relations();
    const surnames = this.surnameLines();
    const parts = this.parts();
    const d = this.design();
    const font = (f: { family: string; size: number; weight: number; style?: string }) =>
      `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${f.size}px ${f.family}`;
    const fonts = { given: font(d.given), surname: font(d.surname), birth: font(d.birth), dates: font(d.dates), kin: font(d.kin) };
    const problems = this.checks.byPerson();
    const out = new Map<string, CardLabel>();
    for (const p of doc.people) {
      const names = surnames.get(p.id) ?? { surname: p.name.surname.trim(), birth: '' };
      // Dates in full where they fit the card; years otherwise.
      const years = lang.lifespan(p);
      const dates = view.dates === 'full' ? this.fitting(lang.lifespan(p, true), years, fonts.dates, d.textW) : years;
      const relation = relations.get(p.id) ?? '';
      const unknown = nameUnknown(p);
      const title = [displayName(p, lang.unknown(p.sex)), relation, years].filter(Boolean).join(', ');
      // The relationship stays clear of the top right corner: its badge and ribbon, and the mark of someone kept off prints.
      const corner = p.hiddenFromPrint ? 34 + (view.showRibbons && p.death ? d.ribbonBand.to : 0) : 18;
      const kin = parts.kin && relation ? this.measure.fit(relation, fonts.kin, d.width - corner - d.textX, d.kin.size * (d.kin.letterSpacing ?? 0)) : '';
      out.set(p.id, {
        given: this.measure.fit(unknown ? lang.unknown(p.sex) : p.name.given.trim(), fonts.given, d.textW),
        surname: this.measure.fit(names.surname, fonts.surname, d.textW, d.surname.size * (d.surname.letterSpacing ?? 0)),
        birth: parts.birthName ? this.measure.fit(names.birth, fonts.birth, d.textW) : '',
        dates: parts.dates ? this.measure.fit(dates, fonts.dates, d.textW) : '',
        initials: initials(p),
        title,
        sex: p.sex,
        deceased: !!p.death,
        hiddenFromPrint: !!p.hiddenFromPrint,
        diedAtBirth: !!p.death && diedAtBirth(p),
        missing: missingText(this.i18n, p),
        problem: problems.get(p.id) ?? '',
        unknown,
        kin,
      });
    }
    return out;
  });

  readonly stats = computed(() => {
    const doc = this.store.doc();
    return {
      people: doc.people.length,
      families: doc.families.filter((f) => f.partners.length === 2).length,
      generations: this.layout().generations,
    };
  });
}

/** The partner someone is with now: the latest relationship that has not ended, else the latest. */
export function currentPartner(index: TreeIndex, personId: string | undefined): string | undefined {
  if (!personId) return undefined;
  const fams = index.partnerFamilies(personId).filter((f) => f.partners.length === 2);
  if (!fams.length) return undefined;
  const current = [...fams].reverse().find((f) => !isBrokenUp(relationshipStatus(f))) ?? fams[fams.length - 1];
  return current.partners.find((p) => p !== personId);
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b) as (keyof T)[];
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

const NOBODY: ReadonlySet<string> = new Set();

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/**
 * The part of a document the layout depends on. Names, dates and notes do not move anyone, so they are left
 * out and edits to them reuse the layout; so is who the tree is centred on, which moves nobody either.
 */
function structureOf(doc: TreeDocument, loadId: number): { key: string; doc: TreeDocument } {
  const people = doc.people.map((p) => ({ id: p.id, sex: p.sex, name: { given: '', surname: '' } }));
  const families = doc.families.map((f) => {
    const out: TreeDocument['families'][number] = {
      id: f.id,
      kind: f.kind,
      partners: f.partners,
      children: f.children.map((c) => ({ personId: c.personId, relation: c.relation })),
    };
    if (f.start?.date?.value) out.start = { date: { value: f.start.date.value } };
    if (f.end?.reason) out.end = { reason: f.end.reason };
    return out;
  });
  const reduced: TreeDocument = { meta: { title: '' }, view: doc.view, people, families };
  const key = JSON.stringify([loadId, people.map((p) => [p.id, p.sex]), families]);
  return { key, doc: reduced };
}
