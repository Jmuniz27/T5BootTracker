module.exports = {
  preset: 'jest-expo',
  // Montar una pantalla completa no entra en los 5 s por defecto de jest cuando
  // la caché de transformación está fría, y en CI arranca vacía en cada corrida:
  // ahí fallaban cinco suites de "renders without crashing" que localmente pasan
  // con la caché ya poblada. El costo es transformar los módulos de React Native,
  // no el test en sí, así que no hay nada que acelerar del lado del test.
  //
  // Va acá y no archivo por archivo porque afecta a toda pantalla que se monte
  // —convert.test.tsx e index.test.tsx ya declaraban este mismo valor por su
  // cuenta— y así el próximo test de pantalla no vuelve a chocar con el tope.
  testTimeout: 20000,
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', './jest.setup.js'],
  moduleNameMapper: {
    '^test-renderer$': 'react-test-renderer'
  }
};
