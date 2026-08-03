// Mock global de AsyncStorage para cualquier test que importe (directa o
// transitivamente) módulos que usan el store local.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
