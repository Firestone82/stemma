import { TestBed } from '@angular/core/testing';
import { TreeStore } from '../core/store/tree-store';
import { DocBuilder } from '../core/testing/fixtures';
import { DataChecks } from './data-checks';

describe('the flags for dates that cannot be right', () => {
  it('stand at the person each is about, not at the others it names', () => {
    const b = new DocBuilder();
    b.person('F', 'Karel', 'Novák', 'male', '1950');
    b.person('M', 'Marie', 'Nováková', 'female', '1952');
    b.person('C', 'Jan', 'Novák', 'male', '1940'); // born before both parents
    b.person('D', 'Eva', 'Nováková', 'female', '1980');
    b.family('F1', ['F', 'M'], ['C', 'D']);
    TestBed.inject(TreeStore).load(b.build());
    const checks = TestBed.inject(DataChecks);
    // Both problems name a parent too, and are told at the child.
    expect(checks.problems().map((p) => p.personIds)).toEqual([
      ['C', 'F'],
      ['C', 'M'],
    ]);
    expect([...checks.byPerson().keys()]).toEqual(['C']);
    expect(checks.byPerson().get('C')!.split('\n')).toHaveLength(2);
  });
});
