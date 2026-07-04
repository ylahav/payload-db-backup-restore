'use client';

import React from 'react';

/**
 * Sidebar entry that opens the backup view. Registered via
 * `admin.components.afterNavLinks` by the plugin.
 *
 * We use a plain <a> instead of next/link so this file has zero
 * peer-dep coupling to Next.js — the browser handles the navigation
 * fine on click for admin routes.
 */
export default function NavBackupLink() {
  return (
    <div
      style={{
        marginTop: 'calc(var(--base) * 0.5)',
        padding: 'calc(var(--base) * 0.75) 0',
        borderTop: '1px solid var(--theme-elevation-100)',
      }}
    >
      <a
        href="/admin/backup"
        style={{
          display: 'block',
          padding: 'calc(var(--base) * 0.5) 0',
          color: 'var(--theme-elevation-800)',
          textDecoration: 'none',
          fontSize: '0.9rem',
          fontWeight: 500,
        }}
      >
        <span aria-hidden style={{ marginRight: '0.5rem' }}>
          ⤓
        </span>
        Backup &amp; restore
      </a>
    </div>
  );
}
