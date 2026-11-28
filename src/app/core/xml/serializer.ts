import { CardSettings, Extensions, Family, LifeEvent, PartInfo, Person, PrintSettings, Reach, TreeDocument } from '../model/types';
import { CURRENT_FORMAT, GENERATOR, ROOT_ELEMENT, XML_NAMESPACE, formatVersionString } from './format';
import { Attrs, XmlWriter } from './xml-writer';

export interface SerializeOptions {
  /** Written to the `generator` attribute. */
  generator?: string;
}

/** Serialises a tree to the current XML file format. */
export function serializeTree(doc: TreeDocument, options: SerializeOptions = {}): string {
  const w = new XmlWriter();
  w.declaration();
  w.open(ROOT_ELEMENT, [
    ['xmlns', XML_NAMESPACE],
    ['formatVersion', formatVersionString(CURRENT_FORMAT)],
    ['generator', options.generator ?? GENERATOR],
    ...extAttrs(doc.ext),
  ]);

  writeMeta(w, doc);
  writeView(w, doc);

  const peopleExt = doc.sectionExt?.people;
  w.open('people', extAttrs(peopleExt));
  for (const person of doc.people) writePerson(w, person);
  extElements(w, peopleExt);
  w.close();

  const familiesExt = doc.sectionExt?.families;
  w.open('families', extAttrs(familiesExt));
  for (const family of doc.families) writeFamily(w, family);
  extElements(w, familiesExt);
  w.close();

  // Elements added in a minor version go after the existing ones, where an
  // older app that keeps them as unknown content would write them back.
  if (doc.print) writePrint(w, doc.print);
  // Later in 1.9: print settings kept for particular people (whoever is still in the tree).
  const ids = new Set(doc.people.map((p) => p.id));
  const saved = (doc.savedPrints ?? []).filter((s) => s.centerId === null || (!!s.centerId && ids.has(s.centerId)));
  if (saved.length) {
    w.open('savedPrints', []);
    for (const s of saved) writePrint(w, s);
    w.close();
  }
  if (doc.part) writePart(w, doc.part);

  extElements(w, doc.ext);
  w.close();
  return w.toString();
}

/**
 * Later in 1.9: how a part of a tree was when it was taken out (see core/part). Records of people and families
 * since deleted from the file stay: they tell a merge that they were deleted.
 */
function writePart(w: XmlWriter, part: PartInfo): void {
  w.open('part', [
    ['source', part.source],
    ['exported', part.exported],
    ['root', part.rootId],
  ]);
  for (const [id, fields] of Object.entries(part.people))
    w.element('person', [
      ['ref', id],
      ['base', fields],
    ]);
  for (const [id, f] of Object.entries(part.families)) {
    w.element('family', [
      ['ref', id],
      ['base', f.fields],
      ['partners', f.partners.join(' ') || undefined],
      ['children', f.children.join(' ') || undefined],
    ]);
  }
  w.close();
}

function writeMeta(w: XmlWriter, doc: TreeDocument): void {
  const m = doc.meta;
  w.open('meta', extAttrs(m.ext));
  w.element('title', [], m.title);
  if (m.description) w.element('description', [], m.description);
  if (m.created) w.element('created', [], m.created);
  if (m.modified) w.element('modified', [], m.modified);
  if (m.homePersonId) w.element('homePerson', [['ref', m.homePersonId]]);
  extElements(w, m.ext);
  w.close();
}

/** What the cards show: the same attributes on <view> and <print>. */
function cardAttrs(c: CardSettings): Attrs {
  return [
    ['showEmblems', c.showEmblems],
    ['showBirthNames', c.showBirthNames],
    ['unknownBirthNames', c.unknownBirthNames ? undefined : 'false'],
    ['dates', c.dates],
    ['emblemAlign', c.emblemAlign === 'center' ? undefined : c.emblemAlign],
    ['sexColors', c.sexColors],
    ['showRibbons', c.showRibbons],
  ];
}

function writeView(w: XmlWriter, doc: TreeDocument): void {
  const v = doc.view;
  const attrs: Attrs = [
    ...cardAttrs(v),
    ['language', v.language],
    ['branches', reach(v.branches)],
    ['inLawFamilies', v.inLawFamilies],
    ['siblingsOnly', v.siblingsOnly ? 'true' : undefined],
    ['uniteSpellings', v.uniteSpellings ? undefined : 'false'],
    ['uniteForeign', v.uniteForeign ? undefined : 'false'],
    ['familyBackgrounds', v.familyBackgrounds ? 'true' : undefined],
    ['showRelationships', v.showRelationships ? undefined : 'false'],
    ...extAttrs(v.ext),
  ];
  if (v.ext?.elements?.length) {
    w.open('view', attrs);
    extElements(w, v.ext);
    w.close();
  } else {
    w.element('view', attrs);
  }
}

function writePerson(w: XmlWriter, p: Person): void {
  w.open('person', [['id', p.id], ['sex', p.sex], ['print', p.hiddenFromPrint ? 'hidden' : undefined], ...extAttrs(p.ext)]);
  const nameAttrs: Attrs = [
    ['given', p.name.given],
    ['givenUnknown', p.name.givenUnknown ? 'true' : undefined],
    ['surname', p.name.derived ? undefined : p.name.surname],
    // A surname taken from a husband is left out; which marriage it comes from is kept, when one was chosen.
    ['surnameFrom', p.name.derived ? p.name.surnameFrom : undefined],
    ['birthSurname', p.name.birthSurname],
    ['nickname', p.name.nickname],
    ...extAttrs(p.name.ext),
  ];
  if (p.name.ext?.elements?.length) {
    w.open('name', nameAttrs);
    extElements(w, p.name.ext);
    w.close();
  } else {
    w.element('name', nameAttrs);
  }
  if (p.birth) writeEvent(w, 'birth', p.birth);
  if (p.death) writeEvent(w, 'death', p.death);
  if (p.occupation) w.element('occupation', [], p.occupation);
  if (p.photo) writePhoto(w, p.photo);
  if (p.notes) w.element('notes', [], p.notes);
  extElements(w, p.ext);
  w.close();
}

function writePhoto(w: XmlWriter, photo: string): void {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(photo);
  if (m)
    w.element(
      'photo',
      [
        ['mediaType', m[1]],
        ['encoding', 'base64'],
      ],
      m[2],
    );
  else w.element('photo', [['href', photo]]);
}

function writeFamily(w: XmlWriter, f: Family): void {
  w.open('family', [['id', f.id], ['type', f.kind], ['checked', f.checked], ...extAttrs(f.ext)]);
  for (const partner of f.partners) w.element('partner', [['ref', partner]]);
  if (f.start) writeEvent(w, 'start', f.start);
  if (f.end) writeEvent(w, 'end', f.end, [['reason', f.end.reason]]);
  for (const child of f.children) {
    const attrs: Attrs = [
      ['ref', child.personId],
      ['relation', child.relation === 'biological' ? undefined : child.relation],
      ['birthGroup', child.birthGroup],
      ...extAttrs(child.ext),
    ];
    if (child.ext?.elements?.length) {
      w.open('child', attrs);
      extElements(w, child.ext);
      w.close();
    } else {
      w.element('child', attrs);
    }
  }
  if (f.notes) w.element('notes', [], f.notes);
  if (f.engagement) writeEvent(w, 'engagement', f.engagement);
  extElements(w, f.ext);
  w.close();
}

function writePrint(w: XmlWriter, p: PrintSettings): void {
  const attrs: Attrs = [
    ['paper', p.paper],
    ['orientation', p.orientation],
    ['center', p.centerId ?? undefined],
    ['wholeFamily', p.centerId === null ? true : undefined],
    ['partner', p.partnerId ?? undefined],
    ['withPartner', p.partnerId === null ? false : undefined],
    ['ancestors', reach(p.ancestors)],
    ['descendants', reach(p.descendants)],
    ['branches', reach(p.branches)],
    ['inLawFamilies', p.inLawFamilies],
    ['siblingsOnly', p.siblingsOnly ? 'true' : undefined],
    ['title', p.title],
    ['subtitle', p.subtitle],
    ['showTitle', p.showTitle],
    ['showLegend', p.showLegend],
    ['showFrame', p.showFrame],
    ['showDecorations', p.showDecorations ? 'true' : undefined],
    ...cardAttrs(p),
    ['showHidden', p.showHidden ? 'true' : undefined],
    ['tight', p.tight ? 'true' : undefined],
    ['cardGap', p.cardGap !== undefined ? String(Math.round(p.cardGap * 10) / 10) : undefined],
    ['lineGap', p.lineGap !== undefined ? String(Math.round(p.lineGap * 10) / 10) : undefined],
    ['fill', p.fill ? 'true' : undefined],
    ['stackCouples', p.stackCouples ? 'true' : undefined],
    ['legendHeading', p.legendHeading ? undefined : 'false'],
    ['legendHeadAlign', p.legendHeadAlign && p.legendHeadAlign !== 'center' ? p.legendHeadAlign : undefined],
    ['legendHeadWidth', p.legendHeadWidth ? String(Math.round(p.legendHeadWidth * 100) / 100) : undefined],
    ['legendBlocks', p.legendBlocks ? 'true' : undefined],
    ['legendFrameClear', p.legendFrameClear ? 'true' : undefined],
    ['settingsPage', p.settingsPage ? undefined : 'false'],
    ['layoutChoice', p.layoutChoice ? String(p.layoutChoice) : undefined],
    ['amidPartners', p.amidPartners ? undefined : 'false'],
    ['largeText', p.largeText ? 'true' : undefined],
    ['strongLines', p.strongLines ? 'true' : undefined],
    ['freeWidths', p.freeWidths ? 'true' : undefined],
    ['legendAnchor', p.legendAnchor],
    ['legendAlign', p.legendAlign && p.legendAlign !== 'center' ? p.legendAlign : undefined],
    ['titleAnchor', p.titleAnchor],
    ['unionText', p.unionText ? 'true' : undefined],
    ['titleAt', p.titleAt ? [p.titleAt.x, p.titleAt.y].map((v) => Number(v.toFixed(4))).join(' ') : undefined],
    [
      'moves',
      p.moves && Object.keys(p.moves).length
        ? Object.entries(p.moves)
            .map(([id, at]) => `${id}:${[at.x, at.y, ...(at.sx || at.sy ? [at.sx ?? 0, at.sy ?? 0] : [])].map((v) => Number(v.toFixed(1))).join(',')}`)
            .join(' ')
        : undefined,
    ],
    [
      'lineBends',
      p.lineBends && Object.keys(p.lineBends).length
        ? Object.entries(p.lineBends)
            .map(([key, points]) => `${key}:${points.map((q) => `${Number(q.x.toFixed(1))},${Number(q.y.toFixed(1))}`).join(';')}`)
            .join(' ')
        : undefined,
    ],
    [
      'gaps',
      p.gaps && Object.keys(p.gaps).length
        ? Object.entries(p.gaps)
            .map(([key, by]) => `${key}:${Number(by.toFixed(1))}`)
            .join(' ')
        : undefined,
    ],
    ['added', p.added?.length ? p.added.join(' ') : undefined],
    ['flipped', p.flipped?.length ? p.flipped.join(' ') : undefined],
    ['tiles', p.tiles || undefined],
    ['tilesBorderless', p.tilesBorderless ? 'true' : undefined],
    ['titleSize', p.titleSize ? String(Math.round(p.titleSize * 100) / 100) : undefined],
    ['legendSize', p.legendSize ? String(Math.round(p.legendSize * 100) / 100) : undefined],
    ['legendGap', p.legendGap !== undefined ? String(Math.round(p.legendGap * 100) / 100) : undefined],
    ['legendBox', p.legendBox ? [p.legendBox.x, p.legendBox.y, p.legendBox.w, p.legendBox.h].map((v) => Number(v.toFixed(4))).join(' ') : undefined],
    ...extAttrs(p.ext),
  ];
  if (p.ext?.elements?.length) {
    w.open('print', attrs);
    extElements(w, p.ext);
    w.close();
  } else {
    w.element('print', attrs);
  }
}

function reach(r: Reach): string {
  return r === 'all' ? 'all' : String(r);
}

function writeEvent(w: XmlWriter, name: string, e: LifeEvent, extra: Attrs = []): void {
  const attrs: Attrs = [
    ...extra,
    ['date', e.date?.value],
    ['dateQualifier', e.date?.value ? e.date.qualifier : undefined],
    ['dateText', e.date?.value ? undefined : e.date?.text],
    ['dateUnknown', e.dateUnknown ? 'true' : undefined],
    ['place', e.place],
    ...extAttrs(e.ext),
  ];
  if (e.ext?.elements?.length) {
    w.open(name, attrs);
    extElements(w, e.ext);
    w.close();
  } else {
    w.element(name, attrs);
  }
}

function extAttrs(ext: Extensions | undefined): Attrs {
  if (!ext?.attrs) return [];
  return Object.entries(ext.attrs);
}

function extElements(w: XmlWriter, ext: Extensions | undefined): void {
  for (const xml of ext?.elements ?? []) w.raw(xml);
}
