import React, { useState } from 'react';
import { CardanoScope } from '@metamask/keyring-api';
import { Box, Button, Text } from '../../../component-library';
import { useI18nContext } from '../../../../hooks/useI18nContext';
import { getInternalAccounts } from '../../../../selectors/accounts';
import { addCardanoAccount } from '../../../../store/actions';
import { useAppSelector } from '../../../../store/hooks';

export function AddCardanoAccount({ snapId }: { snapId: string }) {
  const t = useI18nContext();
  const accounts = useAppSelector(getInternalAccounts);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const isRegistered = accounts.some(
    (account) =>
      account.metadata.snap?.id === snapId &&
      account.scopes.includes(CardanoScope.Preview),
  );
  if (snapId !== process.env.METAMASK_CARDANO_SNAP_ID || isRegistered) {
    return null;
  }

  const addAccount = async () => {
    setFailed(false);
    setPending(true);
    try {
      await addCardanoAccount();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Box padding={4}>
      <Button disabled={pending} onClick={addAccount}>
        {t('addCardanoPreviewAccount')}
      </Button>
      {failed && (
        <Text role="status">{t('addCardanoPreviewAccountFailed')}</Text>
      )}
    </Box>
  );
}
