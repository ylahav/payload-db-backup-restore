'use client';

import React, { useEffect, useMemo, useState } from 'react';

type CollectionInfo = { slug: string; hasVersions: boolean };
type FileCollection = { slug: string; docs: number; versions: number };
type Tab = 'export' | 'restore';

export default function BackupRestoreClient() {
  const [tab, setTab] = useState<Tab>('export');
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileCollections, setFileCollections] = useState<FileCollection[]>([]);
  const [selectedRestore, setSelectedRestore] = useState<Set<string>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
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

  const serverSlugs = useMemo(() => new Set(collections.map((c) => c.slug)), [collections]);

  // Default to every collection in the file that this server actually knows about. Re-runs when
  // the server list arrives, which may be after the file was parsed.
  useEffect(() => {
    if (fileCollections.length === 0) return;
    setSelectedRestore(
      new Set(fileCollections.filter((c) => serverSlugs.has(c.slug)).map((c) => c.slug)),
    );
  }, [fileCollections, serverSlugs]);

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(collections.map((c) => c.slug)));
  const selectNone = () => setSelected(new Set());

  const toggleRestore = (slug: string) => {
    const next = new Set(selectedRestore);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedRestore(next);
  };

  const onFileChange = async (f: File | null) => {
    setFile(f);
    setFileCollections([]);
    setSelectedRestore(new Set());
    setFileError(null);
    if (!f) return;

    try {
      // EJSON is valid JSON, so plain parsing is enough to read the manifest. Values stay encoded
      // ({ $oid }, { $date }) but we only need keys and lengths here.
      const parsed = JSON.parse(await f.text());

      if (!parsed?.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
        const looksLegacy =
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.values(parsed).some((v) => Array.isArray(v));
        setFileError(
          looksLegacy
            ? 'This file has no `data` wrapper. It looks like a bare {collection: [...]} dump from ' +
                'another tool — those documents are REST-shaped (string `id`, ISO dates) and cannot ' +
                'be restored directly. Convert it to this tool’s format first.'
            : 'Not a backup file produced by this tool: no `data` object found.',
        );
        return;
      }

      const map = new Map<string, FileCollection>();
      for (const [key, docs] of Object.entries(parsed.data as Record<string, unknown>)) {
        const versionMatch = key.match(/^_(.+)_versions$/);
        const slug = versionMatch ? versionMatch[1]! : key;
        const entry = map.get(slug) ?? { slug, docs: 0, versions: 0 };
        const count = Array.isArray(docs) ? docs.length : 0;
        if (versionMatch) entry.versions = count;
        else entry.docs = count;
        map.set(slug, entry);
      }

      const list = Array.from(map.values());
      if (list.length === 0) {
        setFileError('Backup file contains no collections.');
        return;
      }
      setFileCollections(list);
    } catch (e: any) {
      setFileError(`Could not read file: ${e.message}`);
    }
  };

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
    if (selectedRestore.size === 0) {
      setMessage('Select at least one collection to restore.');
      return;
    }
    const names = Array.from(selectedRestore).join(', ');
    const warning = dropFirst
      ? `This will DROP EVERY DOCUMENT in: ${names}\nbefore importing from the file.`
      : `This will INSERT documents into: ${names}\nConflicts with existing _ids will error.`;
    if (!confirm(`${warning}\n\nContinue?`)) return;

    setBusy(true);
    setMessage('Importing…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('collections', JSON.stringify(Array.from(selectedRestore)));
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
  const heading: React.CSSProperties = {
    fontSize: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    color: 'var(--theme-elevation-500)',
  };
  const checkboxRow: React.CSSProperties = {
    display: 'flex',
    gap: '.5rem',
    alignItems: 'center',
    padding: '.4rem .6rem',
    border: '1px solid var(--theme-elevation-100)',
    borderRadius: 4,
  };
  const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '.5rem',
  };
  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '.7rem 1.4rem',
    background: 'transparent',
    border: 0,
    borderBottom: `2px solid ${tab === t ? 'var(--theme-elevation-800)' : 'transparent'}`,
    color: tab === t ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-500)',
    fontWeight: tab === t ? 600 : 400,
    fontSize: '.95rem',
    cursor: 'pointer',
    marginBottom: -1,
  });

  return (
    <div style={{ padding: '2rem 0', maxWidth: 900 }}>
      <h1 style={{ marginBottom: '.5rem' }}>Database backup &amp; restore</h1>
      <p style={{ color: 'var(--theme-elevation-500)', marginTop: 0 }}>
        Export or restore selected collections as a portable JSON snapshot (uses <code>EJSON</code>,
        so ObjectIds and Dates round-trip correctly).
      </p>

      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '.5rem',
          borderBottom: '1px solid var(--theme-elevation-100)',
          marginTop: '2rem',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'export'}
          style={tabStyle('export')}
          onClick={() => setTab('export')}
          disabled={busy}
        >
          Backup (export)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'restore'}
          style={tabStyle('restore')}
          onClick={() => setTab('restore')}
          disabled={busy}
        >
          Restore (import)
        </button>
      </div>

      <section style={{ marginTop: '2rem', display: tab === 'export' ? 'block' : 'none' }}>
        <h2 style={heading}>Export</h2>
        <p style={{ marginTop: 0, color: 'var(--theme-elevation-500)' }}>
          Downloads a single JSON file containing the selected collections and (when drafts are
          enabled) their <code>_versions</code> sidecar.
        </p>
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
        <div style={grid}>
          {collections.map((c) => (
            <label
              key={c.slug}
              style={{
                ...checkboxRow,
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
        <button
          type="button"
          style={{ ...btn, marginTop: '1rem' }}
          onClick={doExport}
          disabled={busy}
        >
          Download backup
        </button>
      </section>

      <section style={{ marginTop: '2rem', display: tab === 'restore' ? 'block' : 'none' }}>
        <h2 style={heading}>Restore</h2>
        <p style={{ marginTop: 0, color: 'var(--theme-elevation-500)' }}>
          Reads a backup JSON produced by this tool. Choose a file and the collections it contains
          will be listed below — only the ones you check are touched.
        </p>
        <div style={{ marginBottom: '.75rem' }}>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </div>

        {fileError && (
          <p
            style={{
              color: 'var(--theme-error-500, #c33)',
              border: '1px solid var(--theme-error-500, #c33)',
              borderRadius: 4,
              padding: '.6rem .8rem',
            }}
          >
            {fileError}
          </p>
        )}

        {fileCollections.length > 0 && (
          <>
            <p style={{ color: 'var(--theme-elevation-500)', marginBottom: '.5rem' }}>
              Found in {file?.name}:
            </p>
            <div style={{ ...grid, marginBottom: '1rem' }}>
              {fileCollections.map((c) => {
                const known = serverSlugs.has(c.slug);
                return (
                  <label
                    key={c.slug}
                    title={known ? undefined : 'This collection does not exist on this server'}
                    style={{
                      ...checkboxRow,
                      background: selectedRestore.has(c.slug)
                        ? 'var(--theme-elevation-50)'
                        : 'transparent',
                      cursor: known ? 'pointer' : 'not-allowed',
                      opacity: known ? 1 : 0.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRestore.has(c.slug)}
                      onChange={() => toggleRestore(c.slug)}
                      disabled={busy || !known}
                    />
                    <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{c.slug}</span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '.75rem',
                        color: 'var(--theme-elevation-500)',
                      }}
                    >
                      {known ? (
                        <>
                          {c.docs} docs
                          {c.versions > 0 && ` +${c.versions} versions`}
                        </>
                      ) : (
                        'unknown here'
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={dropFirst}
            onChange={(e) => setDropFirst(e.target.checked)}
            disabled={busy}
          />
          <span>Drop selected collections before restoring (recommended for clean restore)</span>
        </label>
        <button
          type="button"
          style={btn}
          onClick={doImport}
          disabled={busy || !file || !!fileError || selectedRestore.size === 0}
        >
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
