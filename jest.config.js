module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.(ts|js)"],
  moduleNameMapper: {
    "src/(.*)": "<rootDir>/src/$1",
  },
};
