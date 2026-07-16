# @yairl/payload-db-backup-restore

Admin UI for **exporting and restoring selected Payload CMS collections** as a portable JSON file. Ships an `/admin/backup` view and a sidebar shortcut. Round-trips ObjectIds and Dates faithfully via [EJSON](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/).

Works with any [Payload 3](https://payloadcms.com/) project on MongoDB.

<img alt="Screenshot" src="https://placeholder.example/screenshot.png" width="600" />

## Install

```bash
pnpm add @yairl/payload-db-backup-restore
# or
npm install @yairl/payload-db-backup-restore
# or
yarn add @yairl/payload-db-backup-restore
```

## Use

Add the plugin to your Payload config:

```ts
// payload.config.ts
import { buildConfig } from 'payload';
import { backupPlugin } from '@yairl/payload-db-backup-restore';

export default buildConfig({
  plugins: [
    backupPlugin(),
  ],
  // ...rest of your config
});
```

Regenerate Payload's importMap so it picks up the plugin's components, then start dev:

```bash
pnpm payload generate:importmap
pnpm dev
```

Visit `http://localhost:3000/admin/backup`. You'll see every collection listed with checkboxes and two actions: **Download backup** (writes a `.json` file) and **Restore from file** (reads one back). The sidebar gets a "Backup & restore" link at the bottom.

## First-time setup: "Failed to load collections: HTTP 401"

If the view loads but no collections appear and you see *"Failed to load collections: HTTP 401"*, the plugin's default access check isn't matching your Users collection shape.

**Why**: the default is `req.user.roles.includes('admin')` — but Payload's out-of-the-box template doesn't add a `roles` field to `users`, so every existing user has `roles === undefined` and the check returns false.

**Two ways to fix — pick one:**

**A. Loosen the check for testing** — any logged-in user can back up/restore:

```ts
backupPlugin({
  access: (req) => !!req.user,
})
```

Reasonable when the whole `/admin` panel is already gated to trusted staff.

**B. Add a `roles` field to your Users collection** — production-grade, matches the default check:

```ts
// src/collections/Users.ts
const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    // your existing fields...
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['admin'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'User',  value: 'user' },
      ],
    },
  ],
};
```

Existing users need the role set once — via the admin UI or, if you have many, once in mongo:

```
db.users.updateMany({}, { $set: { roles: ['admin'] } })
```

## Options

```ts
backupPlugin({
  enabled: true,                     // default
  route: '/backup',                  // default — mounted at /admin/backup
  showInSidebar: true,               // default
  access: (req) =>                   // default: role check
    Array.isArray(req.user?.roles) && req.user.roles.includes('admin'),
  packageName: '@yairl/payload-db-backup-restore',  // only override if you've forked/renamed
});
```

### `access: (req: PayloadRequest) => boolean`

Called on every backup/restore request AND on the view render. Return `true` to permit, `false` to reject (401). The default checks `req.user.roles` for the string `'admin'`. Common overrides:

```ts
// Any authenticated user
access: (req) => !!req.user,

// A specific collection field
access: (req) => req.user?.collection === 'admins',

// Multiple roles allowed
access: (req) =>
  Array.isArray(req.user?.roles) &&
  ['admin', 'devops'].some(r => req.user.roles.includes(r)),
```

### `route: string`

The URL segment under `/admin` where the view is mounted. Change if you already have a `/admin/backup` route in your project.

### `showInSidebar: boolean`

Set to `false` to skip the "Backup & restore" sidebar entry. The `/admin/backup` route still exists — you'd link to it yourself.

## What the backup file contains

A single JSON document with this shape:

```jsonc
{
  "version": 1,
  "exportedAt": "2026-07-04T09:12:34.567Z",
  "exportedBy": "you@example.com",
  "collections": ["posts", "media", "_posts_versions"],
  "data": {
    "posts":            [ /* every doc from `posts` */ ],
    "media":            [ /* every doc from `media` */ ],
    "_posts_versions":  [ /* drafts/version rows, when versions.drafts is on */ ]
  }
}
```

- Written with `EJSON.stringify(..., { relaxed: false })` so `ObjectId`, `Date`, `Decimal128`, etc. round-trip byte-for-byte.
- When a collection has `versions.drafts: true`, its `_<slug>_versions` sidecar is included automatically. Both the main and the versions collections are restored together as long as the base slug is selected.

## What restore does

On the server, for each selected collection, restore uses **raw Mongoose** (`db.collections[slug].insertMany(docs)`) — **not** `payload.create`. That means:

- **Hooks don't fire** (`beforeChange`, `afterChange`, etc.). Good — you don't want `setTitle` overwriting titles or `revalidatePage` firing thousands of times during a bulk restore.
- **_id is preserved** exactly as written in the backup.
- **Validation isn't rerun** — the source is a Payload backup, which is trusted to be well-formed.

If **Drop before restore** is checked (the default), the target collection is emptied with `deleteMany({})` first. If unchecked, `insertMany` is used with `ordered: false` — duplicates by `_id` will error per-row but the rest succeed.

## What it does NOT back up

- **Uploaded files on disk.** The `media` collection's *metadata rows* (filenames, alt text, sizes) are included, but the actual blob files under your `staticDir` are not. Snapshot those separately (`tar` / `rsync` / S3 sync).
- **Global settings from `admin`.** Only regular `collections` are handled.
- **Payload's internal system collections** (like `payload-preferences`, `payload-locked-documents`). These aren't in `payload.config.collections`.

## Endpoints

The plugin mounts three endpoints. If you want to script backups from the CLI:

```
GET  /api/db-backup/collections   → { collections: [{ slug, hasVersions }, ...] }
POST /api/db-backup/export        → binary JSON body, Content-Disposition attachment
POST /api/db-backup/import        → multipart: file, collections, dropFirst
```

All three require the `access` check to pass. Authenticate the same way you would any Payload API call (session cookie or `Authorization: JWT <token>`).

## Compatibility

- **Payload**: `^3.0.0`
- **Database adapter**: MongoDB only (`@payloadcms/db-mongodb`). Postgres/SQLite adapters don't expose the raw model in the same shape.
- **Node.js**: `>= 20.9`
- **React**: 18 or 19
- **Next.js**: whichever version Payload 3 supports on your project.

## Development

```bash
pnpm install
pnpm build       # tsc → dist/
pnpm dev         # tsc --watch, useful when using pnpm link
```

To develop against a local Payload project without publishing:

```bash
cd payload-db-backup-restore && pnpm build
cd ../my-payload-project   && pnpm link ../payload-db-backup-restore
```

Rebuild and Payload's importMap regen after any source change.

## License

MIT
