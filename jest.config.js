module.exports = {
  preset: 'jest-expo',
  testEnvironment: '<rootDir>/tests/skia-env.cjs',
  moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'},
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-native-worklets|react-native-reanimated|react-native-safe-area-context|react-native-svg)/)',
  ],
  testPathIgnorePatterns: ['<rootDir>/.p-build-app/', '/node_modules/'],
  modulePathIgnorePatterns: ['<rootDir>/.p-build-app/'],
  setupFilesAfterEnv: ['@shopify/react-native-skia/jestSetup.js', '<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['App.tsx', 'app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
  coverageThreshold: { global: { statements: 100, functions: 100, lines: 100, branches: 100 } },
  coverageReporters: ['text', 'json', 'json-summary', 'lcov'],
};
