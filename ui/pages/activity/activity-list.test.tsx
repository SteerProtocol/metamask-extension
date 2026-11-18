import React from 'react';
import {
  fireEvent,
  render as renderComponent,
  screen,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import {
  CardanoAccountType,
  CardanoScope,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import type { ActivityListItem } from '../../../shared/lib/activity/types';
import { ScreenViewedEntryPoint } from '../../../shared/constants/metametrics';
import { ActivityList } from './activity-list';

const mockUseTransactionsQuery = jest.fn();
const mockUseActivityScreenViewed = jest.fn();
const mockUseLocalTransactions = jest.fn((): ActivityListItem[] => []);
const mockUseRampsOrderActivity = jest.fn((): ActivityListItem[] => []);
const mockMultichainUpdateTransactions = jest.fn().mockResolvedValue(undefined);
const mockPreviewScope = CardanoScope.Preview;

jest.mock('../../store/actions', () => ({
  multichainUpdateTransactions: (id: string) =>
    mockMultichainUpdateTransactions(id),
}));

const store = configureMockStore()({
  metamask: {
    selectedAccountGroup: 'selected',
    accountTree: {
      wallets: {
        wallet: {
          groups: {
            selected: { accounts: ['cardano', 'solana'] },
            other: { accounts: ['other-cardano'] },
          },
        },
      },
    },
    internalAccounts: {
      accounts: {
        cardano: {
          id: 'cardano',
          type: CardanoAccountType.Base,
          scopes: [CardanoScope.Preview],
          metadata: { snap: { id: 'local:cardano' } },
        },
        solana: {
          id: 'solana',
          type: SolAccountType.DataAccount,
          scopes: [SolScope.Mainnet],
          metadata: { snap: { id: 'local:solana' } },
        },
        'other-cardano': {
          id: 'other-cardano',
          type: CardanoAccountType.Base,
          scopes: [CardanoScope.Preview],
          metadata: { snap: { id: 'local:cardano' } },
        },
      },
    },
  },
});

function render(ui: React.JSX.Element) {
  return renderComponent(<Provider store={store}>{ui}</Provider>);
}

jest.mock('./useActivityScreenViewed', () => ({
  useActivityScreenViewed: (props: unknown) =>
    mockUseActivityScreenViewed(props),
}));

jest.mock('./useTransactionsQuery', () => ({
  useTransactionsQuery: (...args: unknown[]) =>
    mockUseTransactionsQuery(...args),
}));

jest.mock('./useLocalTransactions', () => ({
  useLocalTransactions: () => mockUseLocalTransactions(),
}));

jest.mock('./useNonEvmTransactions', () => ({
  useNonEvmTransactions: () => [],
}));

jest.mock('../../hooks/ramps/useRampsOrderActivity', () => ({
  useRampsOrderActivity: () => mockUseRampsOrderActivity(),
}));

jest.mock('./rows/activity-row', () => ({
  ActivityRow: ({
    data,
    onClick,
  }: {
    data: ActivityListItem;
    onClick: () => void;
  }) => (
    <button
      type="button"
      data-testid={`activity-row-${data.type}`}
      data-hash={data.hash}
      onClick={onClick}
    >
      {data.type}
    </button>
  ),
}));

jest.mock('../../hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    trackEvent: jest.fn(),
    createEventBuilder: jest.requireActual(
      '../../../shared/lib/analytics/create-event-builder',
    ).createEventBuilder,
  }),
}));

jest.mock('../../hooks/useRelativeMediumDate', () => ({
  useRelativeMediumDate: () => (timestamp: number) =>
    new Date(timestamp).toISOString(),
}));

jest.mock('../../hooks/useFormatters', () => ({
  useFormatters: () => ({
    formatMediumDate: (timestamp: string | number) =>
      new Date(timestamp).toISOString(),
  }),
}));

jest.mock(
  '../../components/app/assets/asset-list/asset-list-control-bar/asset-list-control-bar',
  () =>
    ({
      onNetworkSelect,
      onRefresh,
    }: {
      onNetworkSelect: (networks: string[]) => void;
      onRefresh?: () => void;
    }) => (
      <>
        <button
          type="button"
          onClick={() => onNetworkSelect([mockPreviewScope])}
        >
          Cardano Preview
        </button>
        {onRefresh && (
          <button type="button" onClick={onRefresh}>
            Refresh list
          </button>
        )}
      </>
    ),
);

jest.mock(
  '../../components/app/pending-transaction-action-buttons/pending-transaction-cancel-speed-up-provider',
  () => ({
    PendingTransactionCancelSpeedUpProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);

jest.mock('../../components/app/transaction-activity-empty-state', () => ({
  TransactionActivityEmptyState: () => (
    <div data-testid="activity-empty-state">empty</div>
  ),
}));

jest.mock('../details/transaction-details', () => ({
  TransactionDetails: () => null,
}));

describe('ActivityList', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockUseLocalTransactions.mockReturnValue([]);
    mockUseRampsOrderActivity.mockReturnValue([]);
    window.history.replaceState(null, '', '/');
  });

  it('shows the activity list skeleton while loading', () => {
    mockUseTransactionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      fetchNextVisiblePage: jest.fn(),
    });

    render(<ActivityList />);
    expect(screen.getByTestId('activity-list-skeleton')).toBeInTheDocument();
  });

  it('does not show the activity list skeleton when not loading', () => {
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      fetchNextVisiblePage: jest.fn(),
    });

    render(<ActivityList />);
    expect(
      screen.queryByTestId('activity-list-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('passes entry point to useActivityScreenViewed', () => {
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      fetchNextVisiblePage: jest.fn(),
    });

    render(<ActivityList entryPoint={ScreenViewedEntryPoint.BottomNavClick} />);

    expect(mockUseActivityScreenViewed).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoint: ScreenViewedEntryPoint.BottomNavClick,
      }),
    );
  });

  it('refreshes the Snap account in the current group and selected network', () => {
    const refetch = jest.fn();
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      isEnabled: false,
      refetch,
      fetchNextVisiblePage: jest.fn(),
    });

    render(<ActivityList />);
    expect(screen.queryByRole('button', { name: 'Refresh list' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cardano Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));

    expect(mockMultichainUpdateTransactions).toHaveBeenCalledTimes(1);
    expect(mockMultichainUpdateTransactions).toHaveBeenCalledWith('cardano');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('navigates to details using the internal ramps order code', () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState');
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      fetchNextVisiblePage: jest.fn(),
    });
    mockUseRampsOrderActivity.mockReturnValue([
      {
        type: 'rampBuy',
        chainId: 'eip155:1',
        status: 'pending',
        timestamp: 1,
        data: { id: 'moonpay/orders/native-uuid', from: '0x1' },
      },
    ]);

    render(<ActivityList />);
    fireEvent.click(screen.getByTestId('activity-row-rampBuy'));

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '#/tx/eip155:1/native-uuid',
    );
    pushStateSpy.mockRestore();
  });

  it('replaces the details hash when another item is opened while details are open', () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState');
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      fetchNextVisiblePage: jest.fn(),
    });
    mockUseRampsOrderActivity.mockReturnValue([
      {
        type: 'rampBuy',
        chainId: 'eip155:1',
        status: 'pending',
        timestamp: 2,
        data: { id: 'moonpay/orders/order-a', from: '0x1' },
      },
      {
        type: 'rampSell',
        chainId: 'eip155:1',
        status: 'pending',
        timestamp: 1,
        data: { id: 'moonpay/orders/order-b', from: '0x1' },
      },
    ]);

    render(<ActivityList />);
    fireEvent.click(screen.getByTestId('activity-row-rampBuy'));
    fireEvent.click(screen.getByTestId('activity-row-rampSell'));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '#/tx/eip155:1/order-a',
    );
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '#/tx/eip155:1/order-b',
    );
    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
  });

  it('renders a pending header when a ramp order is pending', () => {
    mockUseTransactionsQuery.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      fetchNextVisiblePage: jest.fn(),
    });
    mockUseRampsOrderActivity.mockReturnValue([
      {
        type: 'rampBuy',
        chainId: 'eip155:1',
        status: 'pending',
        timestamp: 1,
        data: { id: 'order-1', from: '0x1' },
      },
    ]);

    render(<ActivityList />);

    expect(screen.getByText('[pending]')).toBeInTheDocument();
    expect(screen.getByTestId('activity-row-rampBuy')).toBeInTheDocument();
  });
});
