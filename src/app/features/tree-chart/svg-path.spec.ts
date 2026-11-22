import { placePath } from './svg-path';

describe('placePath', () => {
  it('moves the start and draws the rest from there', () => {
    expect(placePath('M0,-3.9V0.9M0,3.3V3.5', 10, 5)).toBe('M10,1.1v4.8m0,2.4v0.2');
    expect(placePath('M0,0H26V12.6C26,22.2 19.24,27.6 13,30Z', 2, 3)).toBe('M2,3h26v12.6c0,9.6,-6.76,15,-13,17.4z');
  });

  it('keeps relative commands, arcs and lines after a move', () => {
    expect(placePath('M4.2 5.1V2.4h6v2.7M4.2 10.2H3a.9.9 0 0 1-.9-.9z', 1, 1)).toBe('M5.2,6.1v-2.7h6v2.7m-6,5.1h-1.2a0.9,0.9,0,0,1,-0.9,-0.9z');
    expect(placePath('m1,1 2,2', 10, 10)).toBe('M11,11l2,2');
    expect(placePath('M0,0A5,5 0 0 1 10,0L10,10', 1, 2)).toBe('M1,2a5,5,0,0,1,10,0l0,10');
  });

  it('starts a closed path afresh where it began', () => {
    expect(placePath('M1,1H3V3ZM5,5H6', 0, 0)).toBe('M1,1h2v2zm4,4h1');
  });
});
