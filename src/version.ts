/**
 * Package version, kept in sync with `package.json`.
 *
 * IMPORTANT — do NOT import the version from package.json:
 *
 *   import { version } from '../package.json' with { type: 'json' };
 *
 * Node.js v22+ throws `ERR_IMPORT_ATTRIBUTE_MISSING` for ESM JSON imports, and
 * TypeScript does not emit the `with` assertion automatically. Instead, export
 * a plain string constant here and keep it in sync with `package.json` using
 * the repo script `npm run sync-versions` (which runs automatically during
 * `npm run version-packages` in the BeatBax monorepo).
 */
export const version = '0.1.0';
