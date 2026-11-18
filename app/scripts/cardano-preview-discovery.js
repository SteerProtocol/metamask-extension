export const CARDANO_PREVIEW_SNAP_ID = 'local:http://localhost:8080';

export const CARDANO_PREVIEW_LIFECYCLE_EVENTS = [
  'snapInstalled',
  'snapUninstalled',
  'snapEnabled',
  'snapDisabled',
  'snapBlocked',
  'snapUnblocked',
];

const SCRIPT = {
  id: 'cardano-preview-cip30',
  js: ['scripts/cardano-preview-provider.js'],
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  world: 'MAIN',
  runAt: 'document_start',
  persistAcrossSessions: true,
};

/**
 * Synchronize the document-start provider with the runnable Snap state.
 *
 * @param {object} options
 * @param {object} options.scripting - The browser scripting API.
 * @param {Function} options.isAvailable - Whether the Preview Snap is runnable.
 * @returns {Function} Queued browser registration reconciliation.
 */
export function createCardanoPreviewDiscovery({ scripting, isAvailable }) {
  let registered;
  let queue = Promise.resolve();

  return () => {
    const update = queue.then(async () => {
      if (registered === undefined) {
        const scripts = await scripting.getRegisteredContentScripts({
          ids: [SCRIPT.id],
        });
        registered = scripts.length > 0;
      }

      const available = isAvailable();
      if (available === registered) {
        return;
      }

      if (available) {
        await scripting.registerContentScripts([SCRIPT]);
      } else {
        await scripting.unregisterContentScripts({ ids: [SCRIPT.id] });
      }
      registered = available;
    });

    queue = update.catch(() => {
      registered = undefined;
    });
    return update;
  };
}
