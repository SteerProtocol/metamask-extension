import type { MetaMaskInpageProvider } from '@metamask/providers';
import { isObject } from '@metamask/utils';

const WALLET_KEY = 'metamask';
const CIP_142 = Object.freeze({ cip: 142 });
const SUPPORTED_EXTENSIONS = Object.freeze([CIP_142]);
const ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CiAgPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNyIgZmlsbD0iIzE1M2M4MSIvPgogIDxwYXRoIGQ9Ik04IDE2aDE2TTE2IDh2MTYiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjQiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==';

type Request = MetaMaskInpageProvider['request'];
type ApiError = { code: number; info: string };
type Account = {
  networkId: number;
  networkMagic?: number;
  changeAddress: string;
};
type EnableOptions = { onlySilent?: boolean; extensions?: unknown };
type SignResult = {
  declined?: boolean;
  witnessSet?: string;
  signingPolicyError?: string;
};
type Paginate = { page: number; limit: number };

function cip30Error(code: number, info: string): Error & ApiError {
  return Object.assign(new Error(info), { code, info });
}

function isNetworkMagic(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

/**
 * Register MetaMask's CIP-30 entry using the request function from its own in-page provider.
 *
 * @param request - The initialized MetaMask provider's bound request function.
 * @param snapId - The Cardano Snap selected by the extension build.
 * @param walletName - The display name of the extension build.
 */
export function registerCardanoWallet(
  request: Request,
  snapId: string,
  walletName = 'MetaMask',
): void {
  const page = window as Window & { cardano?: Record<string, unknown> };
  page.cardano ??= {};
  const { cardano } = page;
  if (Object.hasOwn(cardano, WALLET_KEY) || !Object.isExtensible(cardano)) {
    return;
  }

  const isRunnable = async () => {
    const state = await request({
      method: 'metamask_getProviderState',
      params: { isInitializingStreamProvider: true },
    });
    return isObject(state) && state.cardanoSnapId === snapId;
  };

  const hasApproval = async () => {
    const snaps = await request({ method: 'wallet_getSnaps' });
    return isObject(snaps) && Object.hasOwn(snaps, snapId);
  };

  async function invoke<Result>(
    method: string,
    params?: Record<string, unknown>,
    failure: ApiError = {
      code: -2,
      info: 'Cardano could not read the wallet.',
    },
  ) {
    if (!(await isRunnable().catch(() => false))) {
      throw cip30Error(-3, 'This Cardano connection is no longer available.');
    }
    try {
      return await request<Result>({
        method: 'wallet_invokeSnap',
        params: {
          snapId,
          request: params === undefined ? { method } : { method, params },
        },
      });
    } catch (error) {
      if (isObject(error) && (error.code === 4001 || error.code === 4100)) {
        throw cip30Error(-3, 'Cardano connection was refused.');
      }
      throw cip30Error(failure.code, failure.info);
    }
  }

  async function getAccount() {
    const account = await invoke<Account>('cardano_account');
    if (!account) {
      throw cip30Error(-2, 'Cardano could not read the wallet.');
    }
    return account;
  }

  async function getNetworkMagic() {
    const { networkMagic } = await getAccount();
    if (!isNetworkMagic(networkMagic)) {
      throw cip30Error(-2, 'Cardano could not determine the network magic.');
    }
    return networkMagic;
  }

  function createApi(enableCip142: boolean) {
    return Object.freeze({
      getExtensions: async () => (enableCip142 ? [CIP_142] : []),
      ...(enableCip142 && { cip142: Object.freeze({ getNetworkMagic }) }),
      getNetworkId: async () => (await getAccount()).networkId,
      getChangeAddress: async () => (await getAccount()).changeAddress,
      getUsedAddresses: async (paginate?: Paginate) =>
        invoke(
          'cardano_usedAddresses',
          paginate === undefined ? undefined : { paginate },
        ),
      getUnusedAddresses: async () => invoke('cardano_unusedAddresses'),
      getRewardAddresses: async () => invoke('cardano_rewardAddresses'),
      getCollateral: async (params?: Record<string, unknown>) =>
        invoke('cardano_collateral', params, {
          code: -3,
          info: 'Collateral is unavailable for this wallet.',
        }),
      getBalance: async () => invoke('cardano_balance'),
      async getUtxos(amount?: string, paginate?: Paginate) {
        if (amount === undefined && paginate === undefined) {
          return invoke('cardano_utxos');
        }
        return invoke(
          'cardano_utxos',
          {
            ...(amount !== undefined && { amount }),
            ...(paginate !== undefined && { paginate }),
          },
          {
            code: -1,
            info: 'Cardano could not list UTxOs with the supplied options.',
          },
        );
      },
      async signTx(tx: string, partialSign = false) {
        const result = await invoke<SignResult>(
          'cardano_signTx',
          { tx, partialSign },
          {
            code: 1,
            info: 'Cardano could not sign this transaction under the current policy.',
          },
        );
        if (result?.declined) {
          throw cip30Error(2, 'User declined the Cardano signature.');
        }
        if (typeof result?.witnessSet !== 'string') {
          const info =
            typeof result?.signingPolicyError === 'string'
              ? result.signingPolicyError
              : 'Cardano could not sign this transaction.';
          throw cip30Error(1, info);
        }
        return result.witnessSet;
      },
      async signData(address: string, payload: string) {
        const result = await invoke<{ declined?: boolean }>(
          'cardano_signData',
          { address, payload },
          {
            code: 1,
            info: 'Cardano could not sign this message.',
          },
        );
        if (result?.declined) {
          throw cip30Error(3, 'User declined the Cardano message signature.');
        }
        return result;
      },
      async submitTx(tx: string) {
        const failure = {
          code: 2,
          info: 'Cardano could not verify submission. The approved transaction is saved in the wallet.',
        };
        const result = await invoke<{ refused?: boolean; txId?: string }>(
          'cardano_submitTx',
          { tx },
          failure,
        );
        if (result?.refused) {
          throw cip30Error(
            1,
            'Submit the exact transaction that this site was approved to sign.',
          );
        }
        if (typeof result?.txId !== 'string') {
          throw cip30Error(failure.code, failure.info);
        }
        return result.txId;
      },
    });
  }

  Object.defineProperty(cardano, WALLET_KEY, {
    enumerable: true,
    value: Object.freeze({
      name: walletName,
      icon: ICON,
      apiVersion: '1',
      supportedExtensions: SUPPORTED_EXTENSIONS,
      async isEnabled() {
        try {
          return (await isRunnable()) && (await hasApproval());
        } catch {
          return false;
        }
      },
      async enable({ onlySilent = false, extensions }: EnableOptions = {}) {
        const requestedCip142 =
          Array.isArray(extensions) &&
          extensions.some(
            (extension) => isObject(extension) && extension.cip === CIP_142.cip,
          );
        try {
          if (!(await isRunnable())) {
            throw new Error('Cardano is unavailable.');
          }
          if (!(await hasApproval())) {
            if (onlySilent) {
              throw new Error('Silent connection is unavailable.');
            }
            const snaps = await request({
              method: 'wallet_requestSnaps',
              params: { [snapId]: {} },
            });
            if (!isObject(snaps) || !Object.hasOwn(snaps, snapId)) {
              throw new Error('Connection was refused.');
            }
          }
        } catch {
          throw cip30Error(-3, 'Cardano connection was refused.');
        }
        const account = await invoke<Account>('cardano_connect');
        return createApi(
          requestedCip142 && isNetworkMagic(account?.networkMagic),
        );
      },
    }),
  });
}
