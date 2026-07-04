import type { Config, Plugin } from 'payload';

import { buildBackupEndpoints } from './endpoints.js';
import { resolveOptions, type BackupPluginOptions } from './types.js';

export type { BackupPluginOptions } from './types.js';

/**
 * Adds a database backup/restore admin UI to a Payload 3 project.
 *
 * ```ts
 * import { buildConfig } from 'payload';
 * import { backupPlugin } from 'payload-plugin-db-backup';
 *
 * export default buildConfig({
 *   plugins: [ backupPlugin() ],
 *   // ...
 * });
 * ```
 *
 * By default:
 *   - view is mounted at /admin/backup
 *   - only users with `roles: ['admin']` can access endpoints or view
 *   - a "Backup & restore" link appears at the bottom of the sidebar
 *
 * All three are configurable via the options object — see `BackupPluginOptions`.
 */
export const backupPlugin =
  (options: BackupPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    const opts = resolveOptions(options);
    if (!opts.enabled) return incomingConfig;

    // The plugin stashes the resolved access predicate on globals so the
    // endpoints (which are pure config, no closure back to us) can read it at
    // request time via a well-known key.
    const endpoints = [
      ...(incomingConfig.endpoints ?? []),
      ...buildBackupEndpoints(opts),
    ];

    const viewComponent = `${opts.packageName}/views/BackupRestoreView#default`;
    const navComponent = `${opts.packageName}/components/NavBackupLink#default`;

    const existingAdmin = incomingConfig.admin ?? {};
    const existingComponents = existingAdmin.components ?? {};

    const admin: Config['admin'] = {
      ...existingAdmin,
      components: {
        ...existingComponents,
        ...(opts.showInSidebar && {
          afterNavLinks: [
            ...(existingComponents.afterNavLinks ?? []),
            navComponent,
          ],
        }),
        views: {
          ...(existingComponents.views ?? {}),
          backup: {
            Component: viewComponent,
            path: opts.route,
          },
        },
      },
    };

    return {
      ...incomingConfig,
      admin,
      endpoints,
    };
  };

export default backupPlugin;
