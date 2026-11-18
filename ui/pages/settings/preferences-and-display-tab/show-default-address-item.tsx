import React from 'react';
import { useSelector } from 'react-redux';
import { Box, BoxFlexDirection } from '@metamask/design-system-react';
import { CardanoScope } from '@metamask/keyring-api';
import Dropdown from '../../../components/ui/dropdown';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  getShowDefaultAddressPreference,
  getDefaultAddressScope,
  getShowTestNetworksPreference,
} from '../../../selectors';
import {
  setShowDefaultAddress,
  setDefaultAddressScope,
} from '../../../store/actions';
import { useAnalytics } from '../../../hooks/useAnalytics';
import {
  MetaMetricsEventCategory,
  MetaMetricsEventName,
} from '../../../../shared/constants/metametrics';
import {
  DEFAULT_ADDRESS_OPTIONS,
  type DefaultAddressScope,
} from '../../../../shared/constants/default-address';
import { getAllNetworkConfigurationsByCaipChainId } from '../../../../shared/lib/selectors/networks';
import { SettingsToggleItem } from '../shared/settings-toggle-item';
import { PREFERENCES_ITEMS } from '../search-config';
import { useDispatch } from '../../../store/hooks';
import type { MetaMaskReduxState } from '../../../store/store';

export const ShowDefaultAddressItem = () => {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const { trackEvent, createEventBuilder } = useAnalytics();

  const showDefaultAddress = useSelector(getShowDefaultAddressPreference);
  const defaultAddressScope = useSelector(
    getDefaultAddressScope,
  ) as DefaultAddressScope;

  const canSelectCardanoPreview = useSelector(
    (state: MetaMaskReduxState) =>
      getShowTestNetworksPreference(state) &&
      Boolean(
        getAllNetworkConfigurationsByCaipChainId(state)[CardanoScope.Preview],
      ),
  );
  const defaultAddressDropdownOptions = DEFAULT_ADDRESS_OPTIONS.filter(
    ({ value }) =>
      value !== CardanoScope.Preview ||
      value === defaultAddressScope ||
      canSelectCardanoPreview,
  ).map(({ messageKey, value }) => ({ name: t(messageKey), value }));

  const trackShowDefaultAddress = (
    enabled: boolean,
    scope: DefaultAddressScope,
  ) => {
    trackEvent(
      createEventBuilder(MetaMetricsEventName.SettingsUpdated)
        .addCategory(MetaMetricsEventCategory.Settings)
        .addProperties({
          /* eslint-disable @typescript-eslint/naming-convention */
          show_default_address: enabled,
          default_address_network: scope,
          /* eslint-enable @typescript-eslint/naming-convention */
          location: 'Settings Page',
        })
        .build(),
    );
  };

  const handleToggle = (value: boolean) => {
    const newValue = !value;
    dispatch(setShowDefaultAddress(newValue));
    trackShowDefaultAddress(newValue, defaultAddressScope);
  };

  const handleDropdownChange = (value: string) => {
    dispatch(setDefaultAddressScope(value as DefaultAddressScope));
    trackShowDefaultAddress(true, value as DefaultAddressScope);
    if (!showDefaultAddress) {
      dispatch(setShowDefaultAddress(true));
    }
  };

  return (
    <Box flexDirection={BoxFlexDirection.Column} gap={1} marginBottom={3}>
      <SettingsToggleItem
        title={t(PREFERENCES_ITEMS['show-default-address'])}
        description={t('showDefaultAddressDescription')}
        value={showDefaultAddress}
        onToggle={handleToggle}
        dataTestId="show-default-address-toggle"
      />
      <Dropdown
        options={defaultAddressDropdownOptions}
        selectedOption={defaultAddressScope}
        onChange={handleDropdownChange}
        data-testid="default-address-scope-dropdown"
        className="mx-4"
      />
    </Box>
  );
};
