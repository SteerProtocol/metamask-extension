import { isSnapKeyring } from '@metamask/eth-snap-keyring/v2';
import type { KeyringControllerWithKeyringV2Action } from '@metamask/keyring-controller';
import type { SnapId } from '@metamask/snaps-sdk';
import type { RootMessenger } from '../messenger';

/**
 * Registers the user-approved account in MetaMask's per-Snap keyring.
 *
 * @param messenger - The keyring controller messenger.
 * @param snapId - The configured, installed Cardano Snap.
 */
export async function registerCardanoAccount(
  messenger: RootMessenger<KeyringControllerWithKeyringV2Action, never>,
  snapId: SnapId,
): Promise<void> {
  await messenger.call(
    'KeyringController:withKeyringV2',
    {
      filter: (keyring) => isSnapKeyring(keyring) && keyring.snapId === snapId,
    },
    async ({ keyring }) => {
      if (!isSnapKeyring(keyring) || keyring.snapId !== snapId) {
        throw new Error('Cardano Snap keyring is unavailable.');
      }
      await keyring.createAccounts({ type: 'custom' });
    },
  );
}
