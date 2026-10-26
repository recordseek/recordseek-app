import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      // Enforced only when run with --coverage (the `test:coverage` script the
      // release gate runs). These thresholds are a floor: a drop below them
      // fails the build. Ratchet them UP as coverage improves; never lower them.
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: { statements: 90, branches: 75, functions: 90, lines: 91 },
    },
  },
});
