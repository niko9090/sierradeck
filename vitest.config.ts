import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Sotto carico (l'autopilota lancia typecheck e suite insieme, o due
    // suite alla volta) i test dell'autopilot-host che aspettano un servizio
    // vero superavano i 5 secondi di serie e la suite risultava rossa senza
    // un difetto: 20 secondi separano «lento» da «rotto».
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // In coda al riepilogo colorato, uno in chiaro: chi legge l'esito da un
    // file (l'autopilota) cerca `Tests N passed` a inizio riga, e su Windows
    // vitest colora anche senza terminale.
    reporters: ['default', './tests/riepilogo-semplice.ts']
  },
  resolve: { alias: { '@shared': resolve('src/shared') } }
})
