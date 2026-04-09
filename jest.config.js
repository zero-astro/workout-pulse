/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
  // Transform chokidar and @parcel/watcher ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!.*(chokidar|@parcel/watcher)/)'
  ],
  // Mock modules (Electron, chokidar ESM)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^electron$': '<rootDir>/__mocks__/electron.js',
    'chokidar$': '<rootDir>/__mocks__/chokidar.js'
  },
  collectCoverageFrom: [
    'src/main/**/*.ts',
    '!src/main/index.ts', // Exclude main process from coverage
    '!src/main/preload.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
}
