/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createContext, Script } from 'vm';

const script = new Script(
  readFileSync(join(__dirname, 'cardano-preview-provider.js'), 'utf8'),
);
const FLASK_RDNS = 'io.metamask.flask';
const ANNOUNCE = 'eip6963:announceProvider';
const REQUEST = 'eip6963:requestProvider';

type Provider = { request: (request?: { method: string }) => unknown };
type CardanoPreview = {
  name: string;
  isEnabled: () => Promise<boolean>;
  enable: (options?: { onlySilent?: boolean }) => Promise<unknown>;
};
type Page = EventTarget & {
  cardano?: { metamaskpreview?: CardanoPreview; other?: object };
};

function createPage() {
  const pageWindow: Page = new EventTarget();
  const pageDocument = new EventTarget();
  const context = createContext({
    window: pageWindow,
    document: pageDocument,
    AbortController,
    Event,
  });
  return {
    pageWindow,
    pageDocument,
    inject: () => script.runInContext(context),
    announce: (rdns: string, provider: Provider) => {
      pageWindow.dispatchEvent(
        new CustomEvent(ANNOUNCE, { detail: { info: { rdns }, provider } }),
      );
    },
  };
}

describe('Cardano Preview discovery', () => {
  it('finds Flask when the in-page provider runs first', async () => {
    const { pageWindow, announce, inject } = createPage();
    const provider = {
      request: jest.fn().mockResolvedValue({ cardanoPreviewAvailable: false }),
    };
    pageWindow.addEventListener(REQUEST, () => announce(FLASK_RDNS, provider));

    inject();

    const wallet = pageWindow.cardano?.metamaskpreview;
    expect(wallet?.name).toBe('Cardano Preview');
    await expect(wallet?.isEnabled()).resolves.toBe(false);
    await expect(wallet?.enable()).rejects.toMatchObject({ code: -3 });
    expect(provider.request).toHaveBeenCalledWith({
      method: 'metamask_getProviderState',
      params: { isInitializingStreamProvider: true },
    });
  });

  it('registers immediately on the Flask announcement when Cardano runs first', () => {
    const { pageWindow, inject, announce } = createPage();
    const other = {};
    pageWindow.cardano = { other };

    inject();
    announce('other.wallet', { request: jest.fn() });
    expect(pageWindow.cardano.metamaskpreview).toBeUndefined();

    announce(FLASK_RDNS, { request: jest.fn() });
    const wallet = pageWindow.cardano.metamaskpreview;
    expect(wallet?.name).toBe('Cardano Preview');
    expect(pageWindow.cardano.other).toBe(other);

    announce(FLASK_RDNS, { request: jest.fn() });
    expect(pageWindow.cardano.metamaskpreview).toBe(wallet);
  });

  it('declines ambiguous synchronous Flask announcements', () => {
    const { pageWindow, inject, announce } = createPage();
    pageWindow.addEventListener(REQUEST, () => {
      announce(FLASK_RDNS, { request: jest.fn() });
      announce(FLASK_RDNS, { request: jest.fn() });
    });

    inject();
    announce(FLASK_RDNS, { request: jest.fn() });

    expect(pageWindow.cardano).toBeUndefined();
  });

  it('ignores provider announcements after the document finishes loading', () => {
    const { pageWindow, pageDocument, inject, announce } = createPage();

    inject();
    pageDocument.dispatchEvent(new Event('DOMContentLoaded'));
    announce(FLASK_RDNS, { request: jest.fn() });

    expect(pageWindow.cardano).toBeUndefined();
  });

  it('refuses silent connection for an origin without Snap approval', async () => {
    const { pageWindow, announce, inject } = createPage();
    const request = jest
      .fn()
      .mockResolvedValueOnce({ cardanoPreviewAvailable: true })
      .mockResolvedValueOnce({});
    pageWindow.addEventListener(REQUEST, () =>
      announce(FLASK_RDNS, { request }),
    );

    inject();

    await expect(
      pageWindow.cardano?.metamaskpreview?.enable({ onlySilent: true }),
    ).rejects.toMatchObject({ code: -3 });
    expect(request.mock.calls).toEqual([
      [
        {
          method: 'metamask_getProviderState',
          params: { isInitializingStreamProvider: true },
        },
      ],
      [{ method: 'wallet_getSnaps' }],
    ]);
  });
});
