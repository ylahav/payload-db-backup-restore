import type { Endpoint, PayloadRequest } from 'payload';
import { EJSON } from 'bson';

import type { ResolvedBackupPluginOptions } from './types.js';

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 });

export const buildBackupEndpoints = (opts: ResolvedBackupPluginOptions): Endpoint[] => {
  const requireAccess = (req: PayloadRequest) => opts.access(req);

  const listCollections: Endpoint = {
    path: '/db-backup/collections',
    method: 'get',
    handler: async (req: PayloadRequest) => {
      if (!requireAccess(req)) return unauthorized();
      const collections = req.payload.config.collections.map((c) => ({
        slug: c.slug,
        hasVersions: !!c.versions,
      }));
      return Response.json({ collections });
    },
  };

  const exportEndpoint: Endpoint = {
    path: '/db-backup/export',
    method: 'post',
    handler: async (req: PayloadRequest) => {
      if (!requireAccess(req)) return unauthorized();

      const body: any = (await (req as any).json?.()) ?? {};
      const collections: string[] = Array.isArray(body.collections) ? body.collections : [];
      if (collections.length === 0) {
        return Response.json({ error: 'No collections specified' }, { status: 400 });
      }

      const data: Record<string, unknown[]> = {};
      const db: any = req.payload.db;

      for (const slug of collections) {
        const model = db.collections?.[slug];
        if (!model) continue;
        data[slug] = await model.find({}).lean();

        const versionModel = db.versions?.[slug];
        if (versionModel) {
          const versionDocs = await versionModel.find({}).lean();
          if (versionDocs.length > 0) data[`_${slug}_versions`] = versionDocs;
        }
      }

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: (req.user as any)?.email ?? 'unknown',
        collections: Object.keys(data),
        data,
      };

      const json = EJSON.stringify(payload, undefined, 2, { relaxed: false });
      const filename = `payload-backup-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.json`;

      return new Response(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    },
  };

  const importEndpoint: Endpoint = {
    path: '/db-backup/import',
    method: 'post',
    handler: async (req: PayloadRequest) => {
      if (!requireAccess(req)) return unauthorized();

      const formData = await (req as any).formData();
      const file = formData.get('file') as File | null;
      const collectionsArg = (formData.get('collections') as string) || '[]';
      const dropFirst = formData.get('dropFirst') === 'true';

      if (!file) return Response.json({ error: 'file missing' }, { status: 400 });

      let requested: string[];
      try {
        requested = JSON.parse(collectionsArg);
      } catch {
        return Response.json({ error: 'bad collections param' }, { status: 400 });
      }
      const requestedSet = new Set<string>(requested);

      const text = await file.text();
      let parsed: any;
      try {
        parsed = EJSON.parse(text);
      } catch (e: any) {
        return Response.json({ error: `bad backup file: ${e.message}` }, { status: 400 });
      }
      if (!parsed?.data || typeof parsed.data !== 'object') {
        return Response.json({ error: 'backup file missing `data` object' }, { status: 400 });
      }

      const db: any = req.payload.db;
      const results: Record<string, { imported: number; error?: string }> = {};

      for (const [key, docs] of Object.entries(parsed.data as Record<string, unknown[]>)) {
        const versionMatch = key.match(/^_(.+)_versions$/);
        const slug = versionMatch ? versionMatch[1] : key;
        if (!requestedSet.has(slug)) continue;

        const model = versionMatch ? db.versions?.[slug] : db.collections?.[slug];
        if (!model) {
          results[key] = { imported: 0, error: 'unknown collection on server' };
          continue;
        }

        try {
          if (dropFirst) await model.deleteMany({});
          if (Array.isArray(docs) && docs.length > 0) {
            await model.insertMany(docs, { ordered: false });
          }
          results[key] = { imported: Array.isArray(docs) ? docs.length : 0 };
        } catch (e: any) {
          results[key] = { imported: 0, error: e.message ?? String(e) };
        }
      }

      return Response.json({ ok: true, dropFirst, results });
    },
  };

  return [listCollections, exportEndpoint, importEndpoint];
};
