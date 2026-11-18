import { sampleDocument } from '../model/sample';
import { DEFAULT_PRINT, DEFAULT_VIEW, TreeDocument } from '../model/types';
import { CURRENT_FORMAT } from './format';
import { XmlMigration } from './migrations';
import { parseLegendBox, parseTree, XmlFormatError } from './parser';
import { serializeTree } from './serializer';
import { SAVED_BY_1_0 } from './fixtures/saved-by-1-0';

const NS = 'urn:stemma:family-tree';

function roundTrip(doc: TreeDocument): TreeDocument {
  return parseTree(serializeTree(doc)).doc;
}

describe('XML format', () => {
  it('round-trips the sample family without loss', () => {
    const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
    const back = roundTrip(doc);
    expect(back).toEqual(doc);
  });

  it('writes the version, namespace and generator', () => {
    const xml = serializeTree(sampleDocument());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(`xmlns="${NS}"`);
    expect(xml).toContain(`formatVersion="${CURRENT_FORMAT.major}.${CURRENT_FORMAT.minor}"`);
    expect(xml).toMatch(/generator="Stemma \d+\.\d+\.\d+"/);
  });

  it('escapes special characters and keeps non-Latin text', () => {
    const doc = sampleDocument();
    doc.people[0].name.given = 'Tom "Tiny" <O\'Brien> & Šárka 漢字';
    doc.people[0].notes = 'Line one\nLine two & more <tags>';
    doc.meta.title = 'Quotes " and \u0001 control';
    const xml = serializeTree(doc);
    expect(xml).not.toContain('\u0001');
    const back = parseTree(xml).doc;
    expect(back.people[0].name.given).toBe('Tom "Tiny" <O\'Brien> & Šárka 漢字');
    expect(back.people[0].notes).toBe('Line one\nLine two & more <tags>');
    expect(back.meta.title).toBe('Quotes " and  control');
  });

  it('keeps partial and approximate dates and free-text dates', () => {
    const doc = sampleDocument();
    doc.people[0].birth = { date: { value: '1898-03', qualifier: 'about' }, place: 'Leeds' };
    doc.people[1].birth = { date: { value: '', text: 'Easter 1901' } };
    const back = roundTrip(doc);
    expect(back.people[0].birth).toEqual({ date: { value: '1898-03', qualifier: 'about' }, place: 'Leeds' });
    expect(back.people[1].birth).toEqual({ date: { value: '', text: 'Easter 1901' } });
  });

  it('keeps photos as embedded data', () => {
    const doc = sampleDocument();
    doc.people[0].photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    const xml = serializeTree(doc);
    expect(xml).toContain('<photo mediaType="image/jpeg" encoding="base64">/9j/4AAQSkZJRgABAQ==</photo>');
    expect(parseTree(xml).doc.people[0].photo).toBe(doc.people[0].photo);
  });

  describe('format 1.7', () => {
    it('round-trips a given name and a date of birth nobody knows', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.people = doc.people.map((p) => (p.id === 'I12' ? { ...p, name: { ...p.name, given: '', givenUnknown: true }, birth: { dateUnknown: true } } : p));
      const xml = serializeTree(doc);
      expect(xml).toContain('givenUnknown="true"');
      expect(xml).toContain('<birth dateUnknown="true"/>');
      expect(xml.match(/Unknown="true"/g)).toHaveLength(2);
      expect(roundTrip(doc)).toEqual(doc);
    });
  });

  describe('format 1.6', () => {
    it('round-trips who is hidden from prints', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.people = doc.people.map((p) => (p.id === 'I12' ? { ...p, hiddenFromPrint: true } : p));
      const xml = serializeTree(doc);
      expect(xml).toContain('<person id="I12" sex="female" print="hidden">');
      expect(xml.match(/print="hidden"/g)).toHaveLength(1);
      expect(roundTrip(doc)).toEqual(doc);
    });

    it('round-trips printing the hidden people and brothers and sisters only', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      expect(serializeTree(doc)).not.toMatch(/showHidden|siblingsOnly/);
      doc.print = { ...DEFAULT_PRINT, showHidden: true, siblingsOnly: true };
      doc.view = { ...doc.view, siblingsOnly: true };
      expect(serializeTree(doc)).toMatch(/<print [^>]*siblingsOnly="true"[^>]*showHidden="true"/);
      expect(serializeTree(doc)).toMatch(/<view [^>]*siblingsOnly="true"/);
      expect(roundTrip(doc)).toEqual(doc);
    });
  });

  describe('format 1.8', () => {
    it("round-trips the families' names placed by hand, and ignores a box that makes no sense", () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      expect(serializeTree(doc)).not.toMatch(/legendBox/);
      doc.print = { ...DEFAULT_PRINT, legendBox: { x: 0.05, y: 0.8, w: 0.3, h: 0.12 } };
      expect(serializeTree(doc)).toMatch(/<print [^>]*legendBox="0.05 0.8 0.3 0.12"/);
      expect(roundTrip(doc)).toEqual(doc);
      expect(parseLegendBox('0.9 0.9 0.5 0.5')).toEqual({ x: 0.9, y: 0.9, w: expect.closeTo(0.1), h: expect.closeTo(0.1) });
      expect(parseLegendBox('1 2 3')).toBeUndefined();
      expect(parseLegendBox('0 0 0 0.2')).toBeUndefined();
    });

    it('round-trips the line heights of the title and the family names, within what makes sense', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      expect(serializeTree(doc)).not.toMatch(/titleSize|legendSize/);
      doc.print = { ...DEFAULT_PRINT, titleSize: 2.5, legendSize: 0.8 };
      expect(serializeTree(doc)).toMatch(/<print [^>]*titleSize="2.5" legendSize="0.8"/);
      expect(roundTrip(doc)).toEqual(doc);
      const read = parseTree(serializeTree(doc).replace(/titleSize="2.5"/, 'titleSize="40"')).doc.print!;
      expect(read.titleSize).toBe(12);
    });
  });

  describe('format 1.9', () => {
    it('round-trips what the cards show and which parts the page has', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.view = {
        ...doc.view,
        showEmblems: false,
        showBirthNames: false,
        dates: 'full',
        emblemAlign: 'top',
        sexColors: false,
        showRibbons: false,
      };
      doc.print = { ...DEFAULT_PRINT, dates: 'none', showTitle: false, showLegend: false, showFrame: false };
      const xml = serializeTree(doc);
      expect(xml).toMatch(/<view showEmblems="false" showBirthNames="false" dates="full" emblemAlign="top" sexColors="false" showRibbons="false"/);
      expect(xml).toMatch(/<print [^>]*showTitle="false" showLegend="false" showFrame="false" [^>]*dates="none"/);
      expect(roundTrip(doc)).toEqual(doc);
    });

    it('round-trips how the families of a print are arranged, written only where it is not as it comes', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.print = { ...DEFAULT_PRINT, tight: true, fill: true, stackCouples: true, amidPartners: false };
      const xml = serializeTree(doc);
      expect(xml).toMatch(/<print [^>]*tight="true" fill="true" stackCouples="true" amidPartners="false"/);
      expect(roundTrip(doc)).toEqual(doc);
      doc.print = { ...DEFAULT_PRINT };
      expect(serializeTree(doc)).not.toMatch(/tight|fill=|stackCouples|amidPartners/);
      expect(roundTrip(doc).print).toMatchObject({ fill: false, stackCouples: false, amidPartners: true });
    });

    it('round-trips bigger text and cards of their own width, written only when on', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.print = { ...DEFAULT_PRINT, largeText: true, freeWidths: true };
      expect(serializeTree(doc)).toMatch(/<print [^>]*largeText="true" freeWidths="true"/);
      expect(roundTrip(doc)).toEqual(doc);
      doc.print = { ...DEFAULT_PRINT };
      expect(serializeTree(doc)).not.toMatch(/largeText|freeWidths/);
      expect(roundTrip(doc).print).toMatchObject({ largeText: false, freeWidths: false });
    });

    it('round-trips where the title and the family names are held, and where the names stand in their box', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.print = {
        ...DEFAULT_PRINT,
        titleAnchor: 'top-right',
        legendAnchor: 'bottom-left',
        legendAlign: 'top-left',
        legendBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 },
      };
      expect(serializeTree(doc)).toMatch(/<print [^>]*legendAnchor="bottom-left" legendAlign="top-left" titleAnchor="top-right"/);
      expect(roundTrip(doc)).toEqual(doc);
      // In the middle of the box is how it comes: not written.
      doc.print = { ...DEFAULT_PRINT, legendAlign: 'center' };
      expect(serializeTree(doc)).not.toMatch(/legendAnchor|legendAlign|titleAnchor/);
      expect(roundTrip(doc).print?.legendAlign).toBeUndefined();
      // legendTop, written for a short while: the names from the top of their box. An anchor that is not one is left out, with a warning.
      const old = serializeTree(doc).replace('<print ', '<print legendTop="true" titleAnchor="upstairs" ');
      const read = parseTree(old);
      expect(read.doc.print).toMatchObject({ legendAlign: 'top' });
      expect(read.doc.print?.titleAnchor).toBeUndefined();
      expect(read.warnings.some((w) => JSON.stringify(w).includes('upstairs'))).toBe(true);
      expect(serializeTree(read.doc)).toMatch(/legendAlign="top"/);
      expect(serializeTree(read.doc)).not.toMatch(/legendTop/);
    });

    it('round-trips what is arranged by hand in a print: moved cards, the title, the options', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.print = {
        ...DEFAULT_PRINT,
        tight: true,
        unionText: true,
        titleAt: { x: 0.25, y: 0.9 },
        moves: { I7: { x: 30, y: -14.5 }, I12: { x: 0, y: 66 } },
        added: ['I14', 'I3'],
        flipped: ['I11'],
      };
      const xml = serializeTree(doc);
      expect(xml).toMatch(/<print [^>]*tight="true" unionText="true" titleAt="0.25 0.9" moves="I7:30,-14.5 I12:0,66" added="I14 I3" flipped="I11"/);
      expect(roundTrip(doc)).toEqual(doc);
      // None of it is written for a print left as it comes, and what is not a place is dropped.
      doc.print = { ...DEFAULT_PRINT };
      expect(serializeTree(doc)).not.toMatch(/tight|unionText|titleAt|moves|added|flipped/);
      const odd = parseTree(xml.replace('I12:0,66', 'I12:left,66').replace('titleAt="0.25 0.9"', 'titleAt="2 x"')).doc.print!;
      expect(odd.moves).toEqual({ I7: { x: 30, y: -14.5 } });
      expect(odd.titleAt).toBeUndefined();
    });

    it('no longer has the arrangement of single families chosen by hand: the layout is found on its own', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.9"><meta><title>T</title></meta><people/><families/><print familyLayouts="F1:row" paper="A2"/></familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(serializeTree(doc)).not.toMatch(/familyLayouts/);
    });

    it('keeps what is switched off about family names and unknown surnames at birth, and writes nothing while they are on', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      expect(serializeTree(doc)).not.toMatch(/uniteSpellings|unknownBirthNames/);
      doc.view = { ...doc.view, uniteSpellings: false, unknownBirthNames: false };
      doc.print = { ...DEFAULT_PRINT, unknownBirthNames: false };
      const xml = serializeTree(doc);
      expect(xml).toMatch(/<view [^>]*unknownBirthNames="false"[^>]*uniteSpellings="false"/);
      expect(xml).toMatch(/<print [^>]*unknownBirthNames="false"/);
      expect(roundTrip(doc)).toEqual(doc);
    });

    it('no longer has generations in rows or children beside their parents: read without a word, gone once saved', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.9"><meta><title>T</title></meta><people/><families/><view generationRows="true"/><print generationRows="true" childrenBeside="true" paper="A2"/></familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(doc.print?.paper).toBe('A2');
      expect(serializeTree(doc)).not.toMatch(/generationRows|childrenBeside/);
    });

    it('no longer has the setting that kept the couple near the middle of the page', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.9"><meta><title>T</title></meta><people/><families/><print centered="false" paper="A2"/></familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(doc.print).toEqual({ ...DEFAULT_PRINT, paper: 'A2' });
      expect(serializeTree(doc)).not.toMatch(/centered/);
    });

    it('has no setting for the badge on mistakes: always on the chart, never in a print', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.9"><meta><title>T</title></meta>
  <view showBadges="false"/>
  <people/><families/>
  <print showBadges="true" paper="A2"/>
</familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(doc.view).toEqual(DEFAULT_VIEW);
      expect(doc.print).toEqual({ ...DEFAULT_PRINT, paper: 'A2' });
      expect(serializeTree(doc)).not.toMatch(/showBadges/);
    });

    it('reads how an earlier version said what the cards show, once', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.8"><meta><title>Old</title></meta>
  <view showDates="true" fullDates="true" showSex="false" sexColors="true"/>
  <people/><families/>
  <print theme="heraldic" showDates="false" showEmblems="false" paper="A2"/>
</familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      // The sex as a symbol is no longer a setting: read, and gone.
      expect(doc.view).toEqual({ ...DEFAULT_VIEW, dates: 'full' });
      expect(serializeTree(doc)).not.toMatch(/showSex/);
      expect(doc.print).toEqual({ ...DEFAULT_PRINT, dates: 'none', showEmblems: false, paper: 'A2' });
    });

    it('leaves the settings of the earlier ways of drawing, the background and the arrangement out of what it saves', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.8"><meta><title>Old</title></meta>
  <view style="night" colorBy="sex" lines="curved" density="compact" showGenerations="true" showRelationships="true" showTree="true" tallGenerations="true"/>
  <people><person id="I1" sex="male"><name given="Ada" surname="Old"/></person></people><families/>
  <print theme="modern" compactCouples="true" tallGenerations="true" packFamilies="true" sidewaysBranches="true" sidewaysOn="I1" portrait="square" showTree="true"/>
  <background mediaType="image/png" encoding="base64" width="10" height="10" fit="cover" opacity="1">AAAA</background>
  <arrangement><move person="I1" dx="40"/></arrangement>
</familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(doc.view.ext).toBeUndefined();
      expect(doc.print?.ext).toBeUndefined();
      expect(doc.ext).toBeUndefined();
      const again = serializeTree(doc);
      expect(again).not.toMatch(
        /theme=|compactCouples|tallGenerations|packFamilies|sideways|portrait|showTree|showGenerations|showRelationships|colorBy|density|<background|<arrangement/,
      );
      // The people are as they were.
      expect(again).toContain('<name given="Ada" surname="Old"/>');
    });
  });

  describe('format 1.1', () => {
    it('round-trips engagements, chart language and print settings', () => {
      const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
      doc.view = { ...doc.view, language: 'cs' };
      doc.print = {
        ...DEFAULT_PRINT,
        paper: 'A2',
        orientation: 'landscape',
        centerId: 'I11',
        partnerId: null,
        ancestors: 2,
        descendants: 'all',
        branches: 1,
        title: 'Rodina Ashworthových',
      };
      const xml = serializeTree(doc);
      expect(xml).toContain('<engagement date="2024-12-24" place="Prague, Czechia"/>');
      expect(xml).toMatch(
        /<print paper="A2" orientation="landscape" center="I11" withPartner="false" ancestors="2" descendants="all" branches="1" inLawFamilies="true" title="Rodina Ashworthových"/,
      );
      expect(parseTree(xml).doc).toEqual(doc);
    });

    it('writes new elements after the ones older versions know', () => {
      const doc = sampleDocument();
      doc.families[10].notes = 'Met in Prague.';
      const xml = serializeTree(doc);
      const family = xml.slice(xml.indexOf('<family id="F11"'), xml.indexOf('</family>', xml.indexOf('<family id="F11"')));
      expect(family.indexOf('<notes>')).toBeLessThan(family.indexOf('<engagement'));
      expect(xml.indexOf('</families>')).toBeLessThan(xml.indexOf('<print') === -1 ? Infinity : xml.indexOf('<print'));
    });

    it('reads a 1.0 file with the new settings at their defaults', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.0"><meta><title>Old</title></meta>
  <view style="auto" colorBy="family" lines="square" density="comfortable" showDates="true" showPlaces="false" showPhotos="true" showGenerations="true"/>
  <people/><families/></familyTree>`;
      const { doc, warnings } = parseTree(xml);
      expect(warnings).toEqual([]);
      expect(doc.view).toEqual({ ...DEFAULT_VIEW });
      expect(doc.print).toBeUndefined();
    });

    it('reads a 1.1 file that went through Stemma 1.0 without losing anything', () => {
      const doc = sampleDocument(new Date('2026-10-10T08:00:00Z'));
      doc.print = { ...DEFAULT_PRINT, centerId: 'I11', descendants: 2, branches: 1 };
      // Settings added in 1.2 were not in the file; they read as their defaults.
      doc.view = { ...doc.view, sexColors: DEFAULT_VIEW.sexColors };
      const result = parseTree(SAVED_BY_1_0);
      expect(result.fileVersion).toBe('1.0');
      expect(result.warnings).toEqual([]);
      expect(result.doc).toEqual(doc);
    });

    it('keeps papers and languages it does not have', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.4"><meta><title>Newer</title></meta>
  <view language="de"/>
  <people/><families/>
  <print theme="watercolour" paper="B2" ancestors="3"/>
</familyTree>`;
      const { doc } = parseTree(xml);
      expect(doc.view.language).toBe('de');
      expect(doc.print?.paper).toBe('B2');
      const again = serializeTree(doc);
      expect(again).toContain('language="de"');
      expect(again).toContain('paper="B2"');
    });
  });

  describe('compatibility between versions', () => {
    const newerMinor = `<?xml version="1.0" encoding="UTF-8"?>
<familyTree xmlns="${NS}" xmlns:x="urn:example:other" formatVersion="1.12" generator="Stemma 1.12.0" x:origin="import" futureRootAttr="yes">
  <meta>
    <title>Future file</title>
    <colour>teal</colour>
  </meta>
  <view style="night" colorBy="family" lines="curved" density="compact" showDates="true" showPlaces="true" showPhotos="false" showGenerations="false" zoom="1.5"/>
  <people>
    <person id="I1" sex="female" confidence="high">
      <name given="Ada" surname="Lovelace" title="Countess"/>
      <birth date="1815-12-10" place="London" source="S1"/>
      <dna haplogroup="H1"/>
      <x:note>From another tool</x:note>
    </person>
    <person id="I2" sex="male">
      <name given="William" surname="King"/>
    </person>
  </people>
  <families>
    <family id="F1" type="marriage">
      <partner ref="I1"/>
      <partner ref="I2"/>
      <start date="1835-07-08"/>
      <child ref="I3" relation="biological"/>
      <witness ref="I9"/>
    </family>
  </families>
  <sources>
    <source id="S1">Parish register</source>
  </sources>
</familyTree>`;

    it('reads a file from a newer minor version and says so', () => {
      const result = parseTree(newerMinor);
      expect(result.fromNewerVersion).toBe(true);
      expect(result.fileVersion).toBe('1.12');
      expect(result.warnings.some((w) => w.code === 'xml.newer-minor' && w.text.includes('newer version'))).toBe(true);
      expect(result.doc.people[0].name.given).toBe('Ada');
    });

    it('writes unknown content back unchanged', () => {
      const first = parseTree(newerMinor).doc;
      const xml = serializeTree(first);
      for (const fragment of [
        'confidence="high"',
        'title="Countess"',
        'source="S1"',
        '<dna',
        'haplogroup="H1"',
        '<x:note',
        'From another tool',
        '<witness ref="I9"',
        '<sources',
        'Parish register',
        '<colour',
        'zoom="1.5"',
        'futureRootAttr="yes"',
        'x:origin="import"',
        'xmlns:x="urn:example:other"',
      ]) {
        expect(xml).toContain(fragment);
      }
      // The written file reads back to the same model, so nothing drifts over repeated saves.
      expect(parseTree(xml).doc).toEqual(first);
      // And it is well-formed XML.
      const dom = new DOMParser().parseFromString(xml, 'application/xml');
      expect(dom.getElementsByTagName('parsererror')).toHaveLength(0);
    });

    it('keeps data other tools add in their own namespace', () => {
      const xml = `<familyTree xmlns="${NS}" xmlns:dna="urn:example:dna" formatVersion="1.0">
  <meta><title>T</title></meta>
  <people>
    <person id="I1" sex="female" dna:kit="K-1042"><name given="Ada" surname="Lovelace"/><dna:haplogroup>H1</dna:haplogroup></person>
  </people>
  <families/>
</familyTree>`;
      const out = serializeTree(parseTree(xml).doc);
      expect(out).toContain('xmlns:dna="urn:example:dna"');
      expect(out).toContain('dna:kit="K-1042"');
      expect(out).toMatch(/<dna:haplogroup[^>]*>H1<\/dna:haplogroup>/);
      const again = new DOMParser().parseFromString(out, 'application/xml');
      expect(again.getElementsByTagName('parsererror')).toHaveLength(0);
      expect(again.getElementsByTagNameNS('urn:example:dna', 'haplogroup')).toHaveLength(1);
    });

    it('refuses a newer major version unless forced', () => {
      const newer = newerMinor.replace('formatVersion="1.12"', 'formatVersion="2.0"');
      expect(() => parseTree(newer)).toThrow(XmlFormatError);
      try {
        parseTree(newer);
      } catch (e) {
        expect((e as XmlFormatError).code).toBe('newer-major');
        expect((e as XmlFormatError).fileVersion).toBe('2.0');
      }
      const forced = parseTree(newer, { force: true });
      expect(forced.doc.people).toHaveLength(2);
      expect(forced.warnings.some((w) => w.code === 'xml.newer-major')).toBe(true);
    });

    it('upgrades older major versions through migrations', () => {
      // A pretend format 0 that stored names as text and used <individual>.
      const legacy = `<?xml version="1.0"?>
<familyTree xmlns="${NS}" formatVersion="0.3">
  <meta><title>Old file</title></meta>
  <people>
    <individual id="I1" sex="male">Jan Novák</individual>
  </people>
  <families/>
</familyTree>`;
      const migrations: XmlMigration[] = [
        {
          from: 0,
          to: '1.0',
          describe: 'Names moved into <name> elements.',
          apply(doc) {
            for (const old of Array.from(doc.getElementsByTagNameNS(NS, 'individual'))) {
              const person = doc.createElementNS(NS, 'person');
              person.setAttribute('id', old.getAttribute('id')!);
              person.setAttribute('sex', old.getAttribute('sex')!);
              const [given, ...rest] = (old.textContent ?? '').trim().split(' ');
              const name = doc.createElementNS(NS, 'name');
              name.setAttribute('given', given);
              name.setAttribute('surname', rest.join(' '));
              person.appendChild(name);
              old.replaceWith(person);
            }
          },
        },
      ];
      const result = parseTree(legacy, { migrations });
      expect(result.upgrades.map((u) => u.text)).toEqual(['Names moved into <name> elements.']);
      expect(result.upgrades[0].code).toBe('upgrade.0');
      expect(result.doc.people[0].name).toEqual({ given: 'Jan', surname: 'Novák' });
      expect(() => parseTree(legacy)).toThrow(/no upgrade path/i);
    });
  });

  describe('repairs', () => {
    it('drops links to missing people and duplicate ids', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.0">
  <people>
    <person id="I1" sex="male"><name given="A" surname=""/></person>
    <person id="I1" sex="female"><name given="B" surname=""/></person>
    <person id="7" sex="female"><name given="C" surname=""/></person>
  </people>
  <families>
    <family id="F1"><partner ref="I1"/><partner ref="I404"/><child ref="7"/><child ref="I1"/></family>
  </families>
</familyTree>`;
      const { doc, warnings } = parseTree(xml);
      const ids = doc.people.map((p) => p.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids[0]).toBe('I1');
      expect(ids[2]).not.toBe('7');
      expect(doc.families[0].partners).toEqual(['I1']);
      expect(doc.families[0].children.map((c) => c.personId)).toEqual([ids[2]]);
      expect(warnings.length).toBeGreaterThanOrEqual(3);
    });

    it('reports ancestry loops', () => {
      const xml = `<familyTree xmlns="${NS}" formatVersion="1.0"><people>
  <person id="A"><name given="A" surname=""/></person><person id="B"><name given="B" surname=""/></person>
</people><families>
  <family id="F1"><partner ref="A"/><child ref="B"/></family>
  <family id="F2"><partner ref="B"/><child ref="A"/></family>
</families></familyTree>`;
      expect(parseTree(xml).warnings.some((w) => w.code === 'xml.loop')).toBe(true);
    });

    it('accepts a file without a namespace or version', () => {
      const result = parseTree('<familyTree><people><person id="I1"><name given="Solo" surname=""/></person></people></familyTree>');
      expect(result.doc.people[0].name.given).toBe('Solo');
      expect(result.warnings[0].code).toBe('xml.no-version');
      expect(result.warnings[0].text).toMatch(/format version/);
    });

    it('rejects files that are not family trees', () => {
      expect(() => parseTree('not xml at all')).toThrow(XmlFormatError);
      expect(() => parseTree('<html><body/></html>')).toThrow(/not a family tree/);
    });
  });
});
