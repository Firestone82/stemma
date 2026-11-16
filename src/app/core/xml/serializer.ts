import { CardSettings, Extensions, Family, LifeEvent, Person, PrintSettings, Reach, TreeDocument } from '../model/types';
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

  extElements(w, doc.ext);
  w.close();
  return w.toString();
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
  w.open('family', [['id', f.id], ['type', f.kind], ...extAttrs(f.ext)]);
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
    ['center', p.centerId],
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
    ...cardAttrs(p),
    ['showHidden', p.showHidden ? 'true' : undefined],
    ['tight', p.tight ? 'true' : undefined],
    ['fill', p.fill ? 'true' : undefined],
    ['stackCouples', p.stackCouples ? 'true' : undefined],
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
            .map(([id, at]) => `${id}:${Number(at.x.toFixed(1))},${Number(at.y.toFixed(1))}`)
            .join(' ')
        : undefined,
    ],
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
