const path = require('path');
const fs = require('fs');

/**
 * Custom Jest resolver for ESM-style TypeScript imports.
 *
 * Our source files import each other with `.js` extensions (required for Node
 * ESM output, e.g. `import { version } from './version.js'`). Jest's default
 * resolver does not map `.js` → `.ts`, so we rewrite relative `./x.js` /
 * `../x.js` specifiers to `./x.ts` (or `./x/index.ts`) when the TypeScript
 * source exists.
 *
 * Requests that do not have a matching `.ts` source (for example the engine's
 * compiled `dist/*.js` files) pass through untouched.
 */
module.exports = function (request, options) {
  const defaultResolver = options && options.defaultResolver ? options.defaultResolver : null;

  if ((request.startsWith('./') || request.startsWith('../')) && request.endsWith('.js')) {
    const basedir = options.basedir || process.cwd();
    const candidateTs = path.resolve(basedir, request.replace(/\.js$/, '.ts'));
    const candidateIndexTs = path.resolve(basedir, request.replace(/\.js$/, ''), 'index.ts');
    if (fs.existsSync(candidateTs) || fs.existsSync(candidateIndexTs)) {
      const newRequest = request.replace(/\.js$/, '.ts');
      if (defaultResolver) return defaultResolver(newRequest, options);
    }
  }

  if (defaultResolver) return defaultResolver(request, options);
  return require.resolve(request, { paths: [options.basedir || process.cwd()] });
};
