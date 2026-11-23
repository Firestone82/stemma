import { DEFAULT_PRINT, PrintSettings } from '../../core/model/types';
import { addressPatch, isPrintHash, printAddress, readPrintAddress } from './print-address';

describe("the print studio's address", () => {
  const settings = (patch: Partial<PrintSettings> = {}): PrintSettings => ({ ...DEFAULT_PRINT, ...patch });

  it('is #/print with the person and only the settings changed from their defaults', () => {
    expect(printAddress(settings(), DEFAULT_PRINT)).toBe('#/print');
    expect(printAddress(settings(), DEFAULT_PRINT, 'I11')).toBe('#/print?person=I11');
    const hash = printAddress(settings({ centerId: 'I3', paper: 'A1', showFrame: false, ancestors: 2 }), DEFAULT_PRINT, 'I11');
    expect(hash).toBe('#/print?person=I3&paper=A1&ancestors=2&showFrame=false');
  });

  it('leaves out cards moved and lines led by hand', () => {
    const hash = printAddress(settings({ moves: { I3: { x: 10, y: 0 } }, lineBends: { 'F1|I3': [{ x: 1, y: 2 }] } }), DEFAULT_PRINT);
    expect(hash).toBe('#/print');
  });

  it('reads back what it wrote, text, numbers, nobody and boxes alike', () => {
    const wanted: Partial<PrintSettings> = {
      centerId: 'I3',
      partnerId: null,
      paper: 'A2',
      orientation: 'landscape',
      descendants: 3,
      branches: 'all',
      title: 'The Novák family & friends',
      subtitle: '1990',
      cardGap: 12,
      legendBox: { x: 0.1, y: 0.7, w: 0.3, h: 0.2 },
      added: ['I20', 'I21'],
      tight: true,
    };
    const read = readPrintAddress(printAddress(settings(wanted), DEFAULT_PRINT), DEFAULT_PRINT);
    // branches is 'all' by default, so stays out.
    const { branches: _, ...rest } = wanted;
    expect(read).toEqual(rest);
  });

  it('skips what it does not know and values of the wrong kind', () => {
    expect(readPrintAddress('#/print?person=I2&bogus=1&tight=yes&moves={}&paper=A4&ancestors=all', DEFAULT_PRINT)).toEqual({
      centerId: 'I2',
      paper: 'A4',
      ancestors: 'all',
    });
  });

  it('is told apart from other addresses', () => {
    expect(isPrintHash('#/print')).toBe(true);
    expect(isPrintHash('#/print?person=I1')).toBe(true);
    expect(isPrintHash('#/printer')).toBe(false);
    expect(isPrintHash('#/family/novak')).toBe(false);
    expect(readPrintAddress('#/family/novak', DEFAULT_PRINT)).toBeNull();
  });

  it('puts back to their defaults the settings an address does not name', () => {
    const current = settings({ paper: 'A1', tight: true, title: 'Old', moves: { I3: { x: 1, y: 1 } } });
    expect(addressPatch(current, { paper: 'A1', showFrame: false }, DEFAULT_PRINT)).toEqual({ tight: false, title: undefined, showFrame: false });
  });
});
