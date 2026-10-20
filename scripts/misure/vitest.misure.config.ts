import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Solo per le misure in scripts/misure (non fanno parte di `npm test`), con le stesse
// cartelle finte dei test: le cartelle vere dell'utente si leggono, non si scrivono.
export default defineConfig({
  root: resolve(__dirname, '..', '..'),
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/misure/**/*.misura.ts'],
    globalSetup: ['./tests/setup/cartelle-finte-globale.ts'],
    setupFiles: ['./tests/setup/cartelle-finte.ts'],
    testTimeout: 3_600_000
  },
  resolve: { alias: { '@shared': resolve(__dirname, '..', '..', 'src/shared') } }
})
