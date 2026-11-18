import { it as jestIt } from '@jest/globals';
import { registerCardanoWallet } from './cardano-provider';

type Extension = { cip: number };
type CardanoApi = {
  getNetworkId: () => Promise<number>;
  getExtensions: () => Promise<Extension[]>;
  cip142?: { getNetworkMagic: () => Promise<number> };
};
type CardanoWallet = {
  name: string;
  supportedExtensions: readonly Extension[];
  isEnabled: () => Promise<boolean>;
  enable: (options?: {
    onlySilent?: boolean;
    extensions?: Extension[];
  }) => Promise<CardanoApi>;
};

const page = window as Window & {
  cardano?: { metamask?: CardanoWallet; other?: object };
};

const providerStateRequest = {
  method: 'metamask_getProviderState',
  params: { isInitializingStreamProvider: true },
};

function registeredWallet(): CardanoWallet {
  const wallet = page.cardano?.metamask;
  if (!wallet) {
    throw new Error('Expected the CIP-30 entry at document start.');
  }
  return wallet;
}

const previewSnapId = 'local:http://localhost:8080';
const previewProviderState = { cardanoSnapId: previewSnapId };

function mockPreviewConnection(account: object) {
  return jest
    .fn()
    .mockResolvedValueOnce(previewProviderState)
    .mockResolvedValueOnce({ [previewSnapId]: {} })
    .mockResolvedValueOnce(previewProviderState)
    .mockResolvedValueOnce(account);
}

describe('MetaMask Cardano discovery', () => {
  afterEach(() => {
    delete page.cardano;
  });

  it('registers immediately while leaving other CIP-30 entries available', () => {
    const other = {};
    page.cardano = { other };
    const request = jest.fn();

    registerCardanoWallet(request, previewSnapId, 'MetaMask Flask');
    const wallet = registeredWallet();
    registerCardanoWallet(jest.fn(), previewSnapId);

    expect(wallet.name).toBe('MetaMask Flask');
    expect(page.cardano.metamask).toBe(wallet);
    expect(page.cardano.other).toBe(other);
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a connection before the configured Snap is installed', async () => {
    const request = jest.fn().mockResolvedValue({ cardanoSnapId: null });
    registerCardanoWallet(request, 'local:http://localhost:8080');
    const wallet = registeredWallet();

    await expect(wallet.isEnabled()).resolves.toBe(false);
    await expect(wallet.enable()).rejects.toMatchObject({ code: -3 });
    expect(request.mock.calls).toStrictEqual([
      [providerStateRequest],
      [providerStateRequest],
    ]);
  });

  it('refuses silent connection for a site without Snap approval', async () => {
    const snapId = 'npm:@test/cardano-wallet';
    const request = jest
      .fn()
      .mockResolvedValueOnce({ cardanoSnapId: snapId })
      .mockResolvedValueOnce({});
    registerCardanoWallet(request, snapId);

    await expect(
      registeredWallet().enable({ onlySilent: true }),
    ).rejects.toMatchObject({ code: -3 });
    expect(request.mock.calls).toStrictEqual([
      [providerStateRequest],
      [{ method: 'wallet_getSnaps' }],
    ]);
  });

  jestIt.each([
    ['local:http://localhost:8080', 0],
    ['npm:@test/cardano-wallet', 1],
  ])(
    'connects via the initialized provider for %s',
    async (snapId, networkId) => {
      const request = jest
        .fn()
        .mockResolvedValueOnce({ cardanoSnapId: snapId })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ [snapId]: {} })
        .mockResolvedValueOnce({ cardanoSnapId: snapId })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ cardanoSnapId: snapId })
        .mockResolvedValueOnce({ networkId });
      registerCardanoWallet(request, snapId);

      const otherRequest = jest.fn();
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { rdns: 'io.metamask.flask' },
            provider: { request: otherRequest },
          },
        }),
      );

      const api = await registeredWallet().enable();
      await expect(api.getNetworkId()).resolves.toBe(networkId);
      expect(otherRequest).not.toHaveBeenCalled();
      expect(request.mock.calls).toStrictEqual([
        [providerStateRequest],
        [{ method: 'wallet_getSnaps' }],
        [{ method: 'wallet_requestSnaps', params: { [snapId]: {} } }],
        [providerStateRequest],
        [
          {
            method: 'wallet_invokeSnap',
            params: { snapId, request: { method: 'cardano_connect' } },
          },
        ],
        [providerStateRequest],
        [
          {
            method: 'wallet_invokeSnap',
            params: { snapId, request: { method: 'cardano_account' } },
          },
        ],
      ]);
    },
  );

  it('invalidates an existing connection if the Snap stops being runnable', async () => {
    const snapId = 'npm:@test/cardano-wallet';
    const request = jest
      .fn()
      .mockResolvedValueOnce({ cardanoSnapId: snapId })
      .mockResolvedValueOnce({ [snapId]: {} })
      .mockResolvedValueOnce({ cardanoSnapId: snapId })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ cardanoSnapId: null });
    registerCardanoWallet(request, snapId);

    const api = await registeredWallet().enable({ onlySilent: true });

    await expect(api.getNetworkId()).rejects.toMatchObject({ code: -3 });
    expect(request).toHaveBeenCalledTimes(5);
    expect(request).toHaveBeenLastCalledWith(providerStateRequest);
  });

  it('binds only the configured Snap ID', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ cardanoSnapId: 'npm:@test/other-wallet' });
    registerCardanoWallet(request, 'npm:@test/cardano-wallet');

    await expect(registeredWallet().enable()).rejects.toMatchObject({
      code: -3,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('exposes CIP-142 once when requested with unsupported or repeated extensions', async () => {
    const account = { networkId: 0, networkMagic: 2 };
    const request = mockPreviewConnection(account)
      .mockResolvedValueOnce(previewProviderState)
      .mockResolvedValueOnce(account);
    registerCardanoWallet(request, previewSnapId);
    const wallet = registeredWallet();

    expect(wallet.supportedExtensions).toStrictEqual([{ cip: 142 }]);
    const api = await wallet.enable({
      extensions: [{ cip: 142 }, { cip: 95 }, { cip: 142 }],
    });

    await expect(api.getExtensions()).resolves.toStrictEqual([{ cip: 142 }]);
    await expect(api.cip142?.getNetworkMagic()).resolves.toBe(2);
    expect(request).toHaveBeenLastCalledWith({
      method: 'wallet_invokeSnap',
      params: { snapId: previewSnapId, request: { method: 'cardano_account' } },
    });
  });

  it('returns the base API when no extension was requested', async () => {
    const request = mockPreviewConnection({ networkId: 0, networkMagic: 2 });
    registerCardanoWallet(request, previewSnapId);

    const api = await registeredWallet().enable();

    await expect(api.getExtensions()).resolves.toStrictEqual([]);
    expect(api.cip142).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('returns the base API with an older Snap that omits network magic', async () => {
    const request = mockPreviewConnection({ networkId: 0 });
    registerCardanoWallet(request, previewSnapId);

    const api = await registeredWallet().enable({ extensions: [{ cip: 142 }] });

    await expect(api.getExtensions()).resolves.toStrictEqual([]);
    expect(api.cip142).toBeUndefined();
  });

  it('rejects invalid network magic from a connected Snap', async () => {
    const request = mockPreviewConnection({ networkId: 0, networkMagic: 2 })
      .mockResolvedValueOnce(previewProviderState)
      .mockResolvedValueOnce({ networkId: 0, networkMagic: -1 });
    registerCardanoWallet(request, previewSnapId);
    const api = await registeredWallet().enable({ extensions: [{ cip: 142 }] });

    await expect(api.cip142?.getNetworkMagic()).rejects.toMatchObject({
      code: -2,
    });
  });

  it('refuses the network magic read when the Snap is no longer runnable', async () => {
    const request = mockPreviewConnection({
      networkId: 0,
      networkMagic: 2,
    }).mockResolvedValueOnce({ cardanoSnapId: null });
    registerCardanoWallet(request, previewSnapId);
    const api = await registeredWallet().enable({ extensions: [{ cip: 142 }] });

    await expect(api.cip142?.getNetworkMagic()).rejects.toMatchObject({
      code: -3,
    });
    expect(request).toHaveBeenCalledTimes(5);
  });
});
