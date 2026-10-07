import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    fileParallelism: false, // test files run one at a time (they share one database)
    testTimeout: 20000,     // the database is remote, so allow time
  },
});