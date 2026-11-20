import { datedFilename, safeFilename } from './file-io';

describe('file names', () => {
  it('gives a saved tree the day it was saved', () => {
    expect(datedFilename('Rodokmen Nováků', 'xml', new Date(2026, 10, 20, 23, 30))).toBe('rodokmen-novaku-2026-11-20.xml');
    expect(datedFilename('', 'ged', new Date(2026, 0, 5))).toBe('family-tree-2026-01-05.ged');
    expect(safeFilename('Rodokmen', 'pdf')).toBe('rodokmen.pdf');
  });
});
