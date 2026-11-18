import React from 'react';
import {
  AvatarNetwork,
  AvatarNetworkSize,
} from '@metamask/design-system-react';
import type { CaipChainId } from '@metamask/utils';
import { useSelector } from 'react-redux';
import { getAllNetworkConfigurationsByCaipChainId } from '../../../../shared/lib/selectors/networks';
import { getMaybeHexChainId } from '../../../ducks/bridge/utils';
import { getImageForChainId } from '../../../selectors/multichain';

export function NetworkName({ chainId }: { chainId: string }) {
  const config = useSelector(getAllNetworkConfigurationsByCaipChainId);
  const network = config[chainId as CaipChainId];
  const networkName = network?.name ?? chainId;
  const networkImage = getImageForChainId(
    getMaybeHexChainId(chainId) ?? chainId,
  );

  return (
    <div className="inline-flex items-center gap-2">
      <AvatarNetwork
        className="rounded"
        size={AvatarNetworkSize.Xs}
        name={networkName}
        src={networkImage}
      />

      <span>{networkName}</span>
    </div>
  );
}
