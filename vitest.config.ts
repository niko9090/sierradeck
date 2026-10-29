import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * I file lenti (0.85.1): git vero, processi figli, pty, shell. Vanno nel
 * progetto `lenti`, con pochi lavoratori e più tempo; tutto il resto è
 * `veloci`. `npm test` li fa girare tutti e due.
 */
const LENTI = [
  'tests/autopilot-host/worktree*.test.ts',
  'tests/autopilot-host/git-asincrono-0-84-0.test.ts',
  'tests/autopilot-host/riscontro-0-85-0.test.ts',
  'tests/autopilot-host/salva-solo-sul-suo-ramo.test.ts',
  'tests/autopilot-host/criteri-veloci.test.ts',
  'tests/autopilot-host/verifiche.test.ts',
  'tests/autopilot-host/verifiche-shell.test.ts',
  'tests/main/consegna-vera.test.ts',
  'tests/main/consegne-file.test.ts',
  'tests/main/updater-sorgente.test.ts',
  'tests/main/ospite.test.ts',
  'tests/main/pty-host-client.test.ts',
  'tests/pty-host/pty-manager.test.ts',
  'tests/main/cassaforte-sincronia.test.ts',
  'tests/main/file-autopilota.test.ts'
]

/** `SD_TEST_WORKERS=4` (un numero) o `SD_TEST_WORKERS=25%`; di serie la metà dei processori. */
function lavoratori(scelti: string | undefined): number | string {
  if (scelti === undefined || scelti.trim() === '') return '50%'
  return /^\d+$/.test(scelti.trim()) ? Number(scelti.trim()) : scelti.trim()
}

const TUTTI = ['tests/**/*.test.ts', 'tests/**/*.test.tsx']

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    globals: true,
    environment: 'node',
    // Processi separati (non thread): i test con git, pty e processi figli
    // girano come nel programma vero. La metà dei processori di serie, per
    // lasciare respirare il PC; `SD_TEST_WORKERS` per sceglierne altri.
    pool: 'forks',
    maxWorkers: lavoratori(process.env.SD_TEST_WORKERS),
    // Cartelle finte per casa, AppData e Temp (0.72.0, dopo il 14/10): un
    // test che scrive o cancella nelle cartelle vere dell'utente fallisce.
    globalSetup: ['./tests/setup/cartelle-finte-globale.ts'],
    setupFiles: ['./tests/setup/cartelle-finte.ts'],
    // Sotto carico (l'autopilota lancia typecheck e suite insieme, o due
    // suite alla volta) i test dell'autopilot-host che aspettano un servizio
    // vero superavano i 5 secondi di serie e la suite risultava rossa senza
    // un difetto: 20 secondi separano «lento» da «rotto».
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // In coda al riepilogo colorato, uno in chiaro: chi legge l'esito da un
    // file (l'autopilota) cerca `Tests N passed` a inizio riga, e su Windows
    // vitest colora anche senza terminale.
    reporters: ['default', './tests/riepilogo-semplice.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'veloci', include: TUTTI, exclude: [...configDefaults.exclude, ...LENTI] }
      },
      {
        extends: true,
        // git e processi veri: ogni comando costa, a PC carico, anche più di
        // un secondo. Qui il tempo largo vale per tutto il file, al posto dei
        // 60 s scritti test per test.
        test: { name: 'lenti', include: LENTI, testTimeout: 60_000, hookTimeout: 60_000 }
      }
    ]
  }
})
