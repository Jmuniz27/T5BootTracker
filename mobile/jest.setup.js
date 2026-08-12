// Mock global de AsyncStorage para cualquier test que importe (directa o
// transitivamente) módulos que usan el store local.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Inicializa i18n (español por defecto) para que t() devuelva el texto real en
// los tests, no las claves. Los componentes migrados usan useTranslation().
require('./src/i18n');
