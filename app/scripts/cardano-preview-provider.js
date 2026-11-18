(() => {
  const CARDANO_PREVIEW_SNAP_ID = 'local:http://localhost:8080';

  const WALLET_KEY = 'metamaskpreview';
  const ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CiAgPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNyIgZmlsbD0iIzE1M2M4MSIvPgogIDxwYXRoIGQ9Ik04IDE2aDE2TTE2IDh2MTYiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxjaXJjbGUgY3g9IjE2IiBjeT0iMTYiIHI9IjQiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==';

  /**
   * Register the CIP-30 interface during the document-start script.
   *
   * @param {Function} request - The MetaMask provider's bound request method.
   */
  function registerCardanoPreview(request) {
    const cardano = (window.cardano ??= {});
    if (Object.hasOwn(cardano, WALLET_KEY)) {
      return;
    }

    async function invoke(method, params, failure = { code: -2, info: 'Cardano Preview could not read the wallet.' }) {
      try {
        return await request({
          method: 'wallet_invokeSnap',
          params: {
            snapId: CARDANO_PREVIEW_SNAP_ID,
            request: params === undefined ? { method } : { method, params },
          },
        });
      } catch (error) {
        const refused = [4001, 4100].includes(error?.code);
        const code = refused ? -3 : failure.code;
        const info = refused ? 'Cardano Preview connection was refused.' : failure.info;
        throw Object.assign(new Error(info), { code, info });
      }
    }

    const isAvailable = async () => {
      const state = await request({
        method: 'metamask_getProviderState',
        params: { isInitializingStreamProvider: true },
      });
      return state?.cardanoPreviewAvailable === true;
    };
    const hasApproval = async () => Object.hasOwn(
      await request({ method: 'wallet_getSnaps' }), CARDANO_PREVIEW_SNAP_ID,
    );
    const isEnabled = async () => {
      try {
        return (await isAvailable()) && (await hasApproval());
      } catch {
        return false;
      }
    };
    const api = Object.freeze({
      getExtensions: async () => [],
      getNetworkId: async () => (await invoke('cardano_previewAccount')).networkId,
      getChangeAddress: async () => (await invoke('cardano_previewAccount')).changeAddress,
      getUsedAddresses: async (paginate) => invoke('cardano_previewUsedAddresses', paginate === undefined ? undefined : { paginate }),
      getUnusedAddresses: async () => invoke('cardano_previewUnusedAddresses'),
      getRewardAddresses: async () => invoke('cardano_previewRewardAddresses'),
      getCollateral: async () => invoke('cardano_previewCollateral', undefined, {
        code: -3,
        info: 'Collateral is unavailable for this Preview wallet.',
      }),
      getBalance: async () => invoke('cardano_previewBalance'),
      async getUtxos(amount, paginate) {
        if (amount !== undefined || paginate !== undefined) {
          const info = 'This Preview prototype lists supported UTxOs without filters.';
          throw Object.assign(new Error(info), { code: -1, info });
        }
        return invoke('cardano_previewUtxos');
      },
      async signTx(tx, partialSign = false) {
        const result = await invoke('cardano_previewSignTx', { tx, partialSign }, {
          code: 1,
          info: 'Cardano Preview could not sign this transaction under the current policy.',
        });
        if (result.declined) {
          const info = 'User declined the Cardano Preview signature.';
          throw Object.assign(new Error(info), { code: 2, info });
        }
        if (result.missingPreviewBounds) {
          const info = 'Include testnet network ID 0 and a Preview expiry in the transaction body before signing.';
          throw Object.assign(new Error(info), { code: 1, info });
        }
        return result.witnessSet;
      },
      async signData(address, payload) {
        const result = await invoke('cardano_previewSignData', { address, payload }, {
          code: 1,
          info: 'Choose a bound Preview address and a short printable message.',
        });
        if (result.declined) {
          const info = 'User declined the Cardano Preview message signature.';
          throw Object.assign(new Error(info), { code: 3, info });
        }
        return result;
      },
      async submitTx(tx) {
        const result = await invoke('cardano_previewSubmitTx', { tx }, {
          code: 2,
          info: 'Cardano Preview could not verify submission. The approved transaction is saved in the wallet.',
        });
        if (result.refused) {
          const info = 'Submit the exact transaction that this site was approved to sign.';
          throw Object.assign(new Error(info), { code: 1, info });
        }
        return result.txId;
      },
    });

    Object.defineProperty(cardano, WALLET_KEY, {
      enumerable: true,
      value: Object.freeze({
        name: 'Cardano Preview',
        icon: ICON,
        apiVersion: '1',
        supportedExtensions: Object.freeze([]),
        isEnabled,
        async enable({ onlySilent = false } = {}) {
          try {
            if (!(await isAvailable())) {
              throw new Error('Cardano Preview is unavailable.');
            }
            if (!(await hasApproval())) {
              if (onlySilent) {
                throw new Error('Silent connection is unavailable.');
              }
              const snaps = await request({
                method: 'wallet_requestSnaps',
                params: { [CARDANO_PREVIEW_SNAP_ID]: {} },
              });
              if (!Object.hasOwn(snaps, CARDANO_PREVIEW_SNAP_ID)) {
                throw new Error('Connection was refused.');
              }
            }
          } catch {
            const info = 'Cardano Preview connection was refused.';
            throw Object.assign(new Error(info), { code: -3, info });
          }
          await invoke('cardano_previewConnect');
          return api;
        },
      }),
    });
  }

  // On restart Chrome can run this script before the manifest's in-page
  // script. Collect replies now or use Flask's first announcement.
  const candidates = new Set();
  const discovery = new AbortController();
  let requesting = true;

  function finishDiscovery() {
    discovery.abort();
    if (candidates.size === 1) {
      const [provider] = candidates;
      registerCardanoPreview(provider.request.bind(provider));
    }
  }

  const collect = ({ detail }) => {
    if (detail?.info?.rdns === 'io.metamask.flask' &&
        typeof detail.provider?.request === 'function') {
      candidates.add(detail.provider);
      if (!requesting) {
        finishDiscovery();
      }
    }
  };
  const { signal } = discovery;
  window.addEventListener('eip6963:announceProvider', collect, { signal });
  document.addEventListener('DOMContentLoaded', () => discovery.abort(), {
    once: true,
    signal,
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  requesting = false;
  if (candidates.size > 0) {
    finishDiscovery();
  }
})();
