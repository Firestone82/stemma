import { displayName, initials, nameUnknown, sortName, surnameKey, surnameLine } from './names';
import { Person } from './types';

const p = (given: string, surname: string, birthSurname?: string): Person => ({
  id: 'I1',
  sex: 'unknown',
  name: birthSurname ? { given, surname, birthSurname } : { given, surname },
});

describe('names', () => {
  it('groups feminine and masculine forms of a family name', () => {
    expect(surnameKey('Novák')).toBe(surnameKey('Nováková'));
    expect(surnameKey('Svoboda')).toBe(surnameKey('Svobodová'));
    expect(surnameKey('Heczko')).toBe(surnameKey('Heczková'));
    expect(surnameKey('Šidlo')).toBe(surnameKey('Šidlová'));
    expect(surnameKey('Černý')).toBe(surnameKey('Černá'));
    expect(surnameKey('Nový')).toBe(surnameKey('Nová'));
    expect(surnameKey('Kowalski')).toBe(surnameKey('Kowalska'));
    expect(surnameKey('Ivanov')).toBe(surnameKey('Ivanova'));
    expect(surnameKey('NOVAK')).toBe(surnameKey('Novák'));
  });

  it('takes the Polish and the Czech way of writing a name for one family, when asked', () => {
    for (const [polish, czech] of [
      ['Nowak', 'Novák'],
      ['Nowakowa', 'Nováková'],
      ['Szturc', 'Šturc'],
      ['Heczko', 'Hečko'],
      ['Walach', 'Valach'],
      ['Kowalski', 'Kovalská'],
      ['Mrózek', 'Mrozek'],
      ['Łukasz', 'Lukaš'],
      ['Rzepka', 'Řepka'],
    ]) {
      expect(surnameKey(polish, true), `${polish} and ${czech}`).toBe(surnameKey(czech, true));
    }
    // Written the two ways they are two names unless asked: as before.
    expect(surnameKey('Nowak')).not.toBe(surnameKey('Novák'));
    expect(surnameKey('Szturc')).not.toBe(surnameKey('Šturc'));
    // And still one family with its own women, and apart from other families.
    expect(surnameKey('Nowak', true)).toBe(surnameKey('Nováková', true));
    expect(surnameKey('Nowak', true)).not.toBe(surnameKey('Nowicki', true));
    expect(surnameKey('Walach', true)).not.toBe(surnameKey('Wolny', true));
  });

  it('takes the German and the Czech way of writing a name for one family, when asked, and letters with and without their marks always', () => {
    const both = { polish: true, foreign: true };
    for (const [german, czech] of [
      ['Schmidt', 'Šmíd'],
      ['Schwarz', 'Švarc'],
      ['Müller', 'Mueller'],
      ['Weiss', 'Vajs'],
      ['Schneider', 'Šnajder'],
      ['Wagner', 'Vágner'],
      ['Fuchs', 'Fuks'],
    ]) {
      expect(surnameKey(german, both), `${german} and ${czech}`).toBe(surnameKey(czech, both));
    }
    // Not unless asked; marks over letters never matter.
    expect(surnameKey('Schmidt', true)).not.toBe(surnameKey('Šmíd', true));
    expect(surnameKey('Novak')).toBe(surnameKey('Novák'));
    expect(surnameKey('Muller')).toBe(surnameKey('Müller'));
    // Still apart from other families, and with its own women.
    expect(surnameKey('Schmidt', both)).not.toBe(surnameKey('Schubert', both));
    expect(surnameKey('Novák', both)).not.toBe(surnameKey('Nový', both));
    expect(surnameKey('Švarcová', both)).toBe(surnameKey('Schwarz', both));
  });

  it('keeps different families apart', () => {
    expect(surnameKey('Ashworth')).not.toBe(surnameKey('Moreau'));
    expect(surnameKey('Novák')).not.toBe(surnameKey('Nový'));
    expect(surnameKey('')).toBe('');
  });

  it('formats names', () => {
    expect(displayName(p('Anna Marie', 'Hartmann'))).toBe('Anna Marie Hartmann');
    expect(displayName(p('', ''))).toBe('Unknown');
    expect(displayName(p('', 'Farník'))).toBe('Unknown Farník');
    expect(displayName(p('', 'Farník'), 'Neznámý')).toBe('Neznámý Farník');
    expect(sortName(p('Anna', 'Hartmann'))).toBe('Hartmann, Anna');
    expect(sortName(p('', 'Farník'), 'Neznámý')).toBe('Farník, Neznámý');
    expect(sortName(p('', ''), 'Neznámá')).toBe('Neznámá');
    expect(nameUnknown(p('', 'Farník'))).toBe(true);
    expect(nameUnknown(p('X', 'Farník'))).toBe(false);
    expect(surnameLine(p('Hélène', 'Ashworth', 'Moreau'))).toBe('Ashworth née Moreau');
    expect(surnameLine(p('Hélène', 'Ashworth', 'Ashworth'))).toBe('Ashworth');
  });

  it('takes whole characters for initials', () => {
    expect(initials(p('Šárka', 'Ashworth'))).toBe('ŠA');
    expect(initials(p('Šárka', 'novák'))).toBe('ŠN');
    expect(initials(p('', ''))).toBe('?');
  });
});
