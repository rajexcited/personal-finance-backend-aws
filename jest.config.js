module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
  collectCoverage: true, // Ensure coverage collection is enabled
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/test/test-utils/" // Ignore utility directory
  ],
  coverageThreshold: {
    global: {
      branches: 16,
      functions: 14,
      lines: 33,
      statements: 36
    }
  }
};
