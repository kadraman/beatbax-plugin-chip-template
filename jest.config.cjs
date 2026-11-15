/**
 * Jest configuration for a standalone BeatBax chip plugin.
 *
 * `@beatbax/engine` ships as ESM (`type: "module"`). Jest runs in CommonJS mode,
 * so we map the engine to its plugin-API entry (`dist/plugin-api.js`) and ask
 * ts-jest to transpile that file (and its `@beatbax/engine` dependency graph)
 * to CommonJS:
 *
 *   - `transform` also covers `.js` so the engine's ESM source is compiled.
 *   - `transformIgnorePatterns` un-ignores `@beatbax/engine` (node_modules is
 *     ignored by default).
 *
 * `dist/plugin-api.js` is used instead of the root `dist/index.js` because the
 * plugin API entry does not reference `import.meta` (which would fail under
 * CommonJS transpilation). It exports `ChipRegistry`, `BeatBaxEngine`, and the
 * plugin types.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/jest-resolver.cjs',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    '^@beatbax/engine$': '<rootDir>/node_modules/@beatbax/engine/dist/plugin-api.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Transpile the engine's ESM `.js` files without type-checking them.
          allowJs: true,
          checkJs: false,
          isolatedModules: true,
        },
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          checkJs: false,
          isolatedModules: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!@beatbax/engine/)'],
};
