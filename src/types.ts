import type { PayloadRequest } from 'payload';

export type BackupPluginOptions = {
  /**
   * Set to false to disable the plugin entirely. Useful for local dev where you
   * might want the endpoints and view registered only in staging/production.
   * @default true
   */
  enabled?: boolean;

  /**
   * Access check for both the endpoints and the admin view. Return `true` to
   * allow, `false` to reject.
   *
   * @default (req) => Array.isArray(req.user?.roles) && req.user.roles.includes('admin')
   */
  access?: (req: PayloadRequest) => boolean;

  /**
   * URL path (relative to /admin) where the view is mounted.
   * @default '/backup'
   */
  route?: string;

  /**
   * Show the "Backup & restore" link at the bottom of the admin sidebar.
   * @default true
   */
  showInSidebar?: boolean;

  /**
   * Package name to use in importMap paths. Only override if you've forked and
   * republished under a different name.
   * @default 'payload-plugin-db-backup'
   */
  packageName?: string;
};

export type ResolvedBackupPluginOptions = Required<
  Omit<BackupPluginOptions, 'enabled' | 'route'>
> & {
  enabled: boolean;
  // Payload's AdminViewConfig types `path` as `` `/${string}` ``. We normalise
  // consumer input to always start with `/` and give the same literal type so
  // downstream assignments don't need casts.
  route: `/${string}`;
};

export const resolveOptions = (opts: BackupPluginOptions = {}): ResolvedBackupPluginOptions => {
  const rawRoute = opts.route ?? '/backup';
  const route = (rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`) as `/${string}`;

  return {
    enabled: opts.enabled ?? true,
    access:
      opts.access ??
      ((req) => {
        const user = req.user as any;
        return Array.isArray(user?.roles) && user.roles.includes('admin');
      }),
    route,
    showInSidebar: opts.showInSidebar ?? true,
    packageName: opts.packageName ?? '@yairl/payload-db-backup-restore',
  };
};
