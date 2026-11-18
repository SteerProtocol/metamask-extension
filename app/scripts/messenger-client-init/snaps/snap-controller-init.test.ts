import {
  detectSnapLocation,
  SnapController,
  SnapControllerMessenger,
} from '@metamask/snaps-controllers';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import { inMilliseconds, Duration } from '@metamask/utils';
import { MessengerClientInitRequest } from '../types';
import { buildControllerInitRequestMock } from '../test/utils';
import {
  getSnapControllerInitMessenger,
  getSnapControllerMessenger,
  SnapControllerInitMessenger,
} from '../messengers/snaps';
import { getRootMessenger } from '../../lib/messenger';
import { SnapControllerInit } from './snap-controller-init';

jest.mock('@metamask/snaps-controllers');

function getInitRequestMock(
  baseMessenger = getRootMessenger(),
): jest.Mocked<
  MessengerClientInitRequest<
    SnapControllerMessenger,
    SnapControllerInitMessenger
  >
> {
  const requestMock = {
    ...buildControllerInitRequestMock(),
    controllerMessenger: getSnapControllerMessenger(baseMessenger),
    initMessenger: getSnapControllerInitMessenger(baseMessenger),
    preinstalledSnaps: [],
  };

  return requestMock;
}

describe('SnapControllerInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes the controller', () => {
    const { messengerClient } = SnapControllerInit(getInitRequestMock());
    expect(messengerClient).toBeInstanceOf(SnapController);
  });

  it('passes the proper arguments to the controller', () => {
    SnapControllerInit(getInitRequestMock());

    const controllerMock = jest.mocked(SnapController);
    expect(controllerMock).toHaveBeenCalledWith({
      messenger: expect.any(Object),
      detectSnapLocation: expect.any(Function),
      maxIdleTime: inMilliseconds(2, Duration.Minute),
      state: undefined,
      encryptor: expect.any(Object),
      environmentEndowmentPermissions: expect.any(Array),
      excludedPermissions: expect.any(Object),
      featureFlags: {
        allowLocalSnaps: false,
        rejectInvalidPlatformVersion: false,
        requireAllowlist: false,
        forcePreinstalledSnaps: false,
        autoUpdatePreinstalledSnaps: false,
      },
      clientConfig: {
        type: 'extension',
        version: 'MOCK_VERSION',
      },
      getFeatureFlags: expect.any(Function),
      getMnemonicSeed: expect.any(Function),
      preinstalledSnaps: expect.any(Array),
      ensureOnboardingComplete: expect.any(Function),
    });
  });

  it('uses the update flow for an exact local version and preserves normal location handling otherwise', async () => {
    SnapControllerInit(getInitRequestMock());
    const [options] = jest.mocked(SnapController).mock.lastCall ?? [];
    const detect = options?.detectSnapLocation;
    const localLocation = {
      shouldAlwaysReload: true,
      manifest: jest.fn(),
      fetch: jest.fn(),
    };
    const npmLocation = { manifest: jest.fn(), fetch: jest.fn() };
    jest
      .mocked(detectSnapLocation)
      .mockReturnValueOnce(localLocation)
      .mockReturnValueOnce(localLocation)
      .mockReturnValueOnce(npmLocation);

    const versioned = detect?.('local:http://localhost:8080', {
      allowLocal: true,
      versionRange: '0.1.1',
    });
    expect(versioned?.shouldAlwaysReload).toBeFalsy();
    await versioned?.manifest();
    await versioned?.fetch('dist/bundle.js');
    expect(localLocation.manifest.mock.contexts).toStrictEqual([localLocation]);
    expect(localLocation.fetch.mock.contexts).toStrictEqual([localLocation]);
    expect(localLocation.fetch).toHaveBeenCalledWith('dist/bundle.js');
    expect(detect?.('local:http://localhost:8080')).toBe(localLocation);
    expect(detect?.('npm:example-snap', { versionRange: '0.1.1' })).toBe(
      npmLocation,
    );
  });

  it('calls `SnapController:setClientActive` when the client is locked', () => {
    const baseMessenger = new Messenger<
      MockAnyNamespace,
      never,
      KeyringControllerLockEvent
    >({ namespace: MOCK_ANY_NAMESPACE });

    const request = getInitRequestMock(baseMessenger);
    const { initMessenger } = request;

    const spy = jest.spyOn(initMessenger, 'call');

    SnapControllerInit(request);
    baseMessenger.publish('KeyringController:lock');

    expect(spy).toHaveBeenCalledWith('SnapController:setClientActive', false);
  });

  it('calls `SnapController:setClientActive` when the client is unlocked', () => {
    const baseMessenger = new Messenger<
      MockAnyNamespace,
      never,
      KeyringControllerUnlockEvent
    >({ namespace: MOCK_ANY_NAMESPACE });

    const request = getInitRequestMock(baseMessenger);
    const { initMessenger } = request;

    const spy = jest.spyOn(initMessenger, 'call');

    SnapControllerInit(request);
    baseMessenger.publish('KeyringController:unlock');

    expect(spy).toHaveBeenCalledWith('SnapController:setClientActive', true);
  });
});
