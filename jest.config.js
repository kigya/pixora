module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-native-worklets|react-native-reanimated|react-native-safe-area-context|react-native-svg)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['App.tsx', 'src/**/*.{ts,tsx}'],
  coverageThreshold: { global: { lines: 100, branches: 100 } },
  coverageReporters: ['text', 'json', 'json-summary', 'lcov'],
};
