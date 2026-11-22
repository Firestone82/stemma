import { chartKey } from './keyboard';

describe('keys on the chart', () => {
  it('shows everyone on F, and leaves Ctrl+F and other shortcuts to the app and the browser', () => {
    expect(chartKey(new KeyboardEvent('keydown', { key: 'f' }))).toEqual({ kind: 'fit' });
    expect(chartKey(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))).toBeNull();
    expect(chartKey(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))).toBeNull();
    expect(chartKey(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }))).toBeNull();
  });
});
