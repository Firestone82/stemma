import { shiftPath } from './svg-path';

describe('shiftPath', () => {
  it('moves absolute commands', () => {
    expect(shiftPath('M0,-3.9V0.9M0,3.3V3.5', 10, 5)).toBe('M10,1.1V5.9M10,8.3V8.5');
    expect(shiftPath('M0,0H26V12.6C26,22.2 19.24,27.6 13,30Z', 2, 3)).toBe('M2,3H28V15.6C28,25.2,21.24,30.6,15,33Z');
  });

  it('leaves relative commands, and moves the opening m', () => {
    expect(shiftPath('M4.2 5.1V2.4h6v2.7M4.2 10.2H3a.9.9 0 0 1-.9-.9z', 1, 1)).toBe('M5.2,6.1V3.4h6v2.7M5.2,11.2H4a0.9,0.9,0,0,1,-0.9,-0.9z');
    expect(shiftPath('m1,1 2,2', 10, 10)).toBe('m11,11 2,2');
  });

  it('moves the end point of an arc only', () => {
    expect(shiftPath('M0,0A5,5 0 0 1 10,0', 1, 2)).toBe('M1,2A5,5,0,0,1,11,2');
  });

  it('returns the path as it was when it does not move', () => {
    expect(shiftPath('M0,0H1', 0, 0)).toBe('M0,0H1');
  });
});
