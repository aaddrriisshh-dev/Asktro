/**
 * Integration tests — run against the Firestore emulator, NOT in the default
 * unit run. Invoke with `npm run test:integration`, which wraps this in
 * `firebase emulators:exec` so FIRESTORE_EMULATOR_HOST is set.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.itest.ts'],
  clearMocks: true,
  // Emulator round-trips are slower than pure math.
  testTimeout: 20000,
};
