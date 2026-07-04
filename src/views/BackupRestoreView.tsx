import type { AdminViewServerProps } from 'payload';
import { DefaultTemplate } from '@payloadcms/next/templates';
import { Gutter } from '@payloadcms/ui';
import React from 'react';

import BackupRestoreClient from './BackupRestoreClient.js';

/**
 * Server component wrapper for the backup/restore admin view.
 *
 * Payload's RootPage router populates `initPageResult` on the server props for
 * every admin view — including custom ones. That object contains a fully-
 * computed `permissions`, `visibleEntities`, and `req` (with user/i18n/locale),
 * so we lift them out of there and hand them to `DefaultTemplate` to get the
 * standard sidebar + header chrome.
 *
 * Registered as the `Component` for the plugin's custom view — the consumer
 * doesn't import this directly, the plugin does it for them.
 */
export default function BackupRestoreView(props: AdminViewServerProps) {
  const initPageResult = (props as any).initPageResult ?? {};
  const { permissions, req, visibleEntities, locale } = initPageResult;

  if (!req) {
    return <div style={{ padding: '2rem' }}>Loading…</div>;
  }

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={props.params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={props.searchParams}
      user={req.user}
      visibleEntities={{
        collections: visibleEntities?.collections ?? [],
        globals: visibleEntities?.globals ?? [],
      }}
    >
      <Gutter>
        <BackupRestoreClient />
      </Gutter>
    </DefaultTemplate>
  );
}
