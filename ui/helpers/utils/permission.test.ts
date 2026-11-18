import { isValidElement } from 'react';
import {
  EndowmentPermissions,
  RestrictedMethods,
} from '../../../shared/constants/permissions';
import type { I18NSubstitution } from '../../../shared/lib/i18n';
import { tEn } from '../../../test/lib/i18n-helpers';
import { getPermissionDescription } from './permission';

describe('Cardano Snap key permissions', () => {
  it('names Cardano and retains each complete key path and curve', () => {
    const curve = 'ed25519Bip32';
    const paths = ['0', '1', '2'].map((role) => [
      'm',
      "1852'",
      "1815'",
      "0'",
      role,
      '0',
    ]);
    const t = jest.fn((key: string, values: string[] = []) =>
      [key, ...values].join(' '),
    );

    for (const permissionName of [
      RestrictedMethods.snap_getBip32Entropy,
      RestrictedMethods.snap_getBip32PublicKey,
    ]) {
      getPermissionDescription({
        t,
        permissionName,
        permissionValue: {
          caveats: [{ value: paths.map((path) => ({ path, curve })) }],
        },
        subjectName: 'Cardano Preview',
        getSubjectName: () => 'Cardano Preview',
      });
    }

    for (const path of paths) {
      expect(t).toHaveBeenCalledWith('cardanoDerivationPath', [
        path.join('/'),
        curve,
      ]);
    }
  });
});

describe('Snap account permissions', () => {
  it('describes both permissions in terms of the accounts the Snap provides', () => {
    const subjectName = 'Wallet Snap';
    const t = (key: string, substitutions: I18NSubstitution[] = []) =>
      tEn(
        key,
        substitutions.map((value) =>
          isValidElement<{ children: string }>(value)
            ? value.props.children
            : String(value),
        ),
      );
    const cases = [
      {
        permissionName: RestrictedMethods.snap_manageAccounts,
        label: 'Add and control accounts from this Snap',
        description:
          'Allow Wallet Snap to add or remove accounts it provides and to sign messages and transactions for those accounts.',
      },
      {
        permissionName: EndowmentPermissions['endowment:keyring'],
        label: 'Receive requests to add and control accounts from this Snap',
        description:
          'Let Wallet Snap receive requests to add or remove accounts it provides and to sign messages and transactions for those accounts.',
      },
    ];

    for (const { permissionName, label, description } of cases) {
      const [permission] = getPermissionDescription({
        t,
        permissionName,
        permissionValue: {},
        subjectName,
        getSubjectName: () => subjectName,
      });

      expect(permission.label).toBe(label);
      expect(permission.description).toBe(description);
    }
  });
});
