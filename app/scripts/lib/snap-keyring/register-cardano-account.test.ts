import { KeyringType } from '@metamask/keyring-api/v2';
import type { SnapId } from '@metamask/snaps-sdk';
import { registerCardanoAccount } from './register-cardano-account';

const cardanoSnapId = 'local:http://localhost:8080' as SnapId;
const unrelatedSnapId = 'local:http://localhost:8081' as SnapId;

describe('registerCardanoAccount', () => {
  it('creates an account only on the configured Snap keyring', async () => {
    const matching = {
      type: KeyringType.Snap,
      snapId: cardanoSnapId,
      createAccounts: jest.fn().mockResolvedValue([]),
    };
    const unrelated = { ...matching, snapId: unrelatedSnapId };
    const call = jest.fn(async (_action, { filter }, operation) => {
      expect(filter(matching)).toBe(true);
      expect(filter(unrelated)).toBe(false);
      await operation({ keyring: matching });
    });
    const messenger = { call } as unknown as Parameters<
      typeof registerCardanoAccount
    >[0];

    await registerCardanoAccount(messenger, cardanoSnapId);

    expect(call).toHaveBeenCalledWith(
      'KeyringController:withKeyringV2',
      { filter: expect.any(Function) },
      expect.any(Function),
    );
    expect(matching.createAccounts).toHaveBeenCalledWith({ type: 'custom' });
  });
});
