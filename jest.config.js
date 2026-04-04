module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          types: ["node", "jest"],
          esModuleInterop: true,
          strict: true,
          target: "ES2022",
          module: "commonjs",
          lib: ["ES2022"],
          resolveJsonModule: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
