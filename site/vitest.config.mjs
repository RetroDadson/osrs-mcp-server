import { defineConfig } from "vitest/config";

// NOTE: the npm test scripts set NODE_OPTIONS=--no-experimental-webstorage. Recent Node versions ship a
// native, SQLite-file-backed localStorage global that otherwise shadows jsdom's own per-test in-memory
// implementation, breaking `localStorage.clear()` in test/setup.js (and causing "database is locked"
// errors under parallel test workers if worked around by giving it a --localstorage-file instead).
// Disabling Node's native implementation lets jsdom's environment-scoped one work as intended.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/setup.js"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js"],
      exclude: ["test/**", "**/*.test.js", "build.js", "scripts/**"],
    },
  },
});
