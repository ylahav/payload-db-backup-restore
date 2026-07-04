'use client';

import React, { useEffect, useState } from 'react';

type CollectionInfo = { slug: string; hasVersions: boolean };

export default function BackupRestoreClient() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dropFirst, setDropFirst] = useState(true);

  useEffect(() => {
    fetch('/api/db-backup/collections', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setCollections(d.collections ?? []))
      .catch((e) => setMessage(`Failed to load collections: ${e.message}`));
  }, []);

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(collections.map((c) => c.slug)));
  const selectNone = () => setSelected(new Set());

  const doExport = async () => {
    if (selected.size === 0) {
      setMessage('Select at least one collection.');
      return;
    }
    setBusy(true);
    setMessage('Exporting…');
    try {
      const res = await fetch('/api/db-backup/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition') || '';
      const fnMatch = cd.match(/filename="?([^";]+)"?/);
      const filename = fnMatch?.[1] ?? `payload-backup-${Date.now()}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${selected.size} collection(s) → ${filename}`);
    } catch (e: any) {
      setMessage(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file) {
      setMessage('Choose a backup file first.');
      return;
    }
    if (selected.size === 0) {
      setMessage('Select at least one collection to restore into.');
      return;
    }
    const warning = dropFirst
      ? `This will DROP EVERY DOCUMENT in the selected collection(s) before importing.`
      : `This will INSERT documents into the selected collection(s). Conflicts with existing _ids will error.`;
    if (!confirm(`${warning}\n\nContinue?`)) return;

    setBusy(true);
    setMessage('Importing…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('collections', JSON.stringify(Array.from(selected)));
      formData.append('dropFirst', dropFirst ? 'true' : 'false');

      const res = await fetch('/api/db-backup/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setMessage(`Import complete:\n${JSON.stringify(result, null, 2)}`);
    } catch (e: any) {
      setMessage(`Import failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: '.6rem 1rem',
    background: 'var(--theme-elevation-800)',
    color: 'var(--theme-elevation-0)',
    border: 0,
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '.9rem',
  };
  const btnGhost: React.CSSProperties = {
    ...btn,
    background: 'transparent',
    color: 'var(--theme-elevation-800)',
    border: '1px solid var(--theme-elevation-200)',
  };

  return (
    <div style={{ padding: '2rem 0', maxWidth: 900 }}>
      <h1 style={{ marginBottom: '.5rem' }}>Database backup &amp; restore</h1>
      <p style={{ color: 'var(--theme-elevation-500)', marginTop: 0 }}>
        Export or restore selected collections as a portable JSON snapshot (uses{' '}
        <code>EJSON</code>, so ObjectIds and Dates round-trip correctly).
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2
          style={{
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Collections
        </h2>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '.5rem' }}>
          <button type="button" style={btnGhost} onClick={selectAll} disabled={busy}>
            Select all
          </button>
          <button type="button" style={btnGhost} onClick={selectNone} disabled={busy}>
            Clear
          </button>
          <span style={{ marginLeft: 'auto', color: 'var(--theme-elevation-500)' }}>
            {selected.size} selected
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '.5rem',
          }}
        >
          {collections.map((c) => (
            <label
              key={c.slug}
              style={{
                display: 'flex',
                gap: '.5rem',
                alignItems: 'center',
                padding: '.4rem .6rem',
                border: '1px solid var(--theme-elevation-100)',
                borderRadius: 4,
                background: selected.has(c.slug) ? 'var(--theme-elevation-50)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.slug)}
                onChange={() => toggle(c.slug)}
                disabled={busy}
              />
              <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{c.slug}</span>
              {c.hasVersions && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '.75rem',
                    color: 'var(--theme-elevation-500)',
                  }}
                >
                  +versions
                </span>
              )}
            </label>
          ))}
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2
          style={{
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Export
        </h2>
        <p style={{ marginTop: 0, color: 'var(--theme-elevation-500)' }}>
          Downloads a single JSON file containing the selected collections and (when drafts are
          enabled) their <code>_versions</code> sidecar.
        </p>
        <button type="button" style={btn} onClick={doExport} disabled={busy}>
          Download backup
        </button>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2
          style={{
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Restore
        </h2>
        <p style={{ marginTop: 0, color: 'var(--theme-elevation-500)' }}>
          Reads a backup JSON produced by this tool. Only the collections you check above will be
          touched — everything else is ignored.
        </p>
        <div style={{ marginBottom: '.75rem' }}>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </div>
        <label
          style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}
        >
          <input
            type="checkbox"
            checked={dropFirst}
            onChange={(e) => setDropFirst(e.target.checked)}
            disabled={busy}
          />
          <span>Drop selected collections before restoring (recommended for clean restore)</span>
        </label>
        <button type="button" style={btn} onClick={doImport} disabled={busy || !file}>
          Restore from file
        </button>
      </section>

      {message && (
        <pre
          style={{
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-100)',
            padding: '1rem',
            marginTop: '2rem',
            whiteSpace: 'pre-wrap',
            fontSize: '.85rem',
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {message}
        </pre>
      )}
    </div>
  );
}
