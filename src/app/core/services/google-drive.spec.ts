import { pinPickerAccount } from './google-drive';

describe('pinPickerAccount', () => {
  afterEach(() => document.querySelectorAll('iframe').forEach((f) => f.remove()));

  it('adds the account to a Picker frame before its fragment, once', async () => {
    const release = pinPickerAccount('pavel@example.com');
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://docs.google.com/picker?protocol=gadgets&appId=1#rpctoken=abc&id=x');
    document.body.append(frame);
    await Promise.resolve();
    expect(frame.getAttribute('src')).toBe('https://docs.google.com/picker?protocol=gadgets&appId=1&authuser=pavel%40example.com#rpctoken=abc&id=x');
    release();
  });

  it('leaves other frames alone', async () => {
    const release = pinPickerAccount('pavel@example.com');
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://example.com/page');
    document.body.append(frame);
    await Promise.resolve();
    expect(frame.getAttribute('src')).toBe('https://example.com/page');
    release();
  });
});
