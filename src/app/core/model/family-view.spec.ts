import { decodeFamilyKeys, encodeFamilyKeys, familyBalloons, familyViewScope } from './family-view';
import { lineageSurname, surnameKey } from './names';
import { sampleDocument } from './sample';
import { TreeIndex } from './tree-index';

describe('family view', () => {
  const doc = sampleDocument();
  const index = new TreeIndex(doc);
  const keyOf = (id: string) => surnameKey(lineageSurname(index.person(id)!));
  const view = (...keys: string[]) => familyViewScope(doc, index, new Set(keys), keyOf, 'I11');
  const ids = (s: { people: ReadonlySet<string> }) => [...s.people].sort();

  it('shows the people born into the family with their partners', () => {
    const s = view('novak');
    // Jiří and Šárka were born Novák; Věra and Simon are their partners.
    expect(ids(s)).toEqual(['I11', 'I15', 'I16', 'I17']);
    expect(s.doc.families.map((f) => f.id).sort()).toEqual(['F6', 'F7']);
    // F6 keeps Simon and Šárka, without Tomáš, who was born Ashworth.
    expect(s.doc.families.find((f) => f.id === 'F6')!.children).toEqual([]);
  });

  it('lays the view out around the person in the middle only when they are on it', () => {
    expect(view('novak').doc.meta.homePersonId).toBe('I11');
    expect(view('ferri').doc.meta.homePersonId).not.toBe('I11');
    expect(view('ferri').people.has(view('ferri').doc.meta.homePersonId!)).toBe(true);
  });

  it('puts the families left off in balloons', () => {
    const s = view('novak');
    const balloons = familyBalloons(doc, index, s.people, keyOf);
    const byId = new Map(balloons.map((b) => [b.id, b]));
    // Simon's parents are Ashworth and Moreau, his father's first.
    expect(byId.get('parents:I11')).toMatchObject({ kind: 'parents', keys: ['ashworth', 'moreau'], people: ['I6', 'I9'] });
    // His first wife, and the children of both marriages.
    // His first wife alone: their children come into view only with her side.
    expect(byId.get('partner:I11:I14')).toMatchObject({ kind: 'partner', keys: ['kelly'], people: ['I14'] });
    expect(byId.has('children:F5')).toBe(false);
    // Once she is on the chart, their children hang below the two of them.
    const withKelly = familyBalloons(doc, index, view('novak', 'kelly').people, keyOf);
    expect(withKelly.find((b) => b.id === 'children:F5')).toMatchObject({ keys: ['ashworth'], people: ['I20', 'I21'] });
    expect(byId.get('children:F6')).toMatchObject({ kind: 'children', keys: ['ashworth'], people: ['I22'] });
    // Věra's parents are not in the tree; Šárka's parents are on the chart.
    expect(byId.has('parents:I17')).toBe(false);
    expect(byId.has('parents:I15')).toBe(false);
  });

  it('reaches brothers and sisters whose parents nobody knows', () => {
    const s = view('ashworth');
    const edith = familyBalloons(doc, index, s.people, keyOf).find((b) => b.id === 'parents:I2');
    expect(edith).toMatchObject({ keys: ['barlow'], people: ['I3'] });
  });

  it('adds a family to the view', () => {
    const one = view('novak');
    const two = view('novak', 'ashworth');
    expect(two.people.size).toBeGreaterThan(one.people.size);
    const balloons = familyBalloons(doc, index, two.people, keyOf);
    expect(balloons.some((b) => b.id === 'children:F6')).toBe(false);
  });

  it('round-trips the families through the address', () => {
    for (const keys of [['ashworth'], ['novak', 'ashworth'], ['', 'de la cruz']]) {
      expect(decodeFamilyKeys(encodeFamilyKeys(keys))).toEqual(keys);
    }
    expect(decodeFamilyKeys('')).toEqual([]);
  });
});
