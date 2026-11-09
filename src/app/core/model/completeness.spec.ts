import { bornLongAgo, diedAtBirth, missingDetails } from './completeness';
import { updatePerson } from './operations';
import { sampleDocument } from './sample';
import { Person } from './types';

const person = (patch: Partial<Person> = {}): Person => ({ id: 'P', sex: 'female', name: { given: 'Anna', surname: 'Nováková' }, ...patch });

describe('what is missing about a person', () => {
  it('flags a missing given name or year of birth', () => {
    expect(missingDetails(person({ birth: { date: { value: '1950' } } }))).toEqual([]);
    expect(missingDetails(person())).toEqual(['birthYear']);
    expect(missingDetails(person({ name: { given: ' ', surname: 'Nováková' } }))).toEqual(['given', 'birthYear']);
    // A date in words counts as filled in.
    expect(missingDetails(person({ birth: { date: { value: '', text: 'Easter 1902' } } }))).toEqual([]);
  });

  it('does not flag what is ticked as unknown', () => {
    expect(missingDetails(person({ name: { given: '', surname: 'X', givenUnknown: true }, birth: { dateUnknown: true } }))).toEqual([]);
  });

  it('clears "name unknown" once a given name is typed', () => {
    const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));
    const unknown = updatePerson(doc, 'I12', { name: { given: '', givenUnknown: true } });
    expect(unknown.people.find((p) => p.id === 'I12')!.name.givenUnknown).toBe(true);
    const named = updatePerson(unknown, 'I12', { name: { given: 'Claire' } });
    expect(named.people.find((p) => p.id === 'I12')!.name.givenUnknown).toBeUndefined();
  });
});

describe('the long dead and those who died at birth', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('takes people born more than a hundred years ago to have died', () => {
    expect(bornLongAgo({ value: '1925-03-01' }, now)).toBe(true);
    expect(bornLongAgo({ value: '1926' }, now)).toBe(false);
    expect(bornLongAgo({ value: '1900', qualifier: 'after' }, now)).toBe(false);
    expect(bornLongAgo(undefined, now)).toBe(false);
  });

  it('compares birth and death as far as both dates are known', () => {
    const born = (b: string, d: string) => person({ birth: { date: { value: b } }, death: { date: { value: d } } });
    expect(diedAtBirth(born('1931-04-02', '1931-04-02'))).toBe(true);
    expect(diedAtBirth(born('1931', '1931-04-02'))).toBe(true);
    expect(diedAtBirth(born('1931-04-02', '1931-04-05'))).toBe(false);
    expect(diedAtBirth(born('1931', '1932'))).toBe(false);
    expect(diedAtBirth(person({ birth: { date: { value: '1931' } }, death: {} }))).toBe(false);
  });
});
