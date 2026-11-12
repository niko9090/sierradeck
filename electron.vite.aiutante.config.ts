import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { credenzialiGoogle } from './electron.vite.config'

/**
 * **SierraDeck Aiutante** (12/11): il secondo programma dello stesso
 * repository, compilato a parte.
 *
 * Esce in `out-aiutante/` e non in `out/`: l'installer del programma completo
 * prende solo `out/**` (`electron-builder.yml`), quindi non cresce di un byte.
 * Le credenziali di Google sono le stesse del programma completo: l'Aiutante
 * si collega allo stesso Drive con lo stesso consenso.
 *
 *   npm run dev-aiutante        (con SIERRADECK_PROVA per non toccare l'Aiutante vero)
 *   npm run pacchetto-aiutante
 */
const google = credenzialiGoogle()

export default defineConfig({
  main: {
    // electron-updater dentro il file principale (12/11): nel pacchetto
    // electron-builder non trovava le sue dipendenze (builder-util-runtime,
    // fs-extra, js-yaml…) e l'aggiornamento si sarebbe rotto al primo
    // require. Così l'Aiutante non ha bisogno di node_modules.
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(google.clientId),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(google.clientSecret)
    },
    build: {
      outDir: 'out-aiutante/main',
      rollupOptions: { input: { index: resolve('src/aiutante/index.ts') } }
    },
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out-aiutante/preload',
      rollupOptions: { input: { index: resolve('src/aiutante/preload.ts') } }
    }
  },
  renderer: {
    root: resolve('src/aiutante/finestra'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      outDir: resolve('out-aiutante/renderer'),
      rollupOptions: { input: resolve('src/aiutante/finestra/index.html') }
    }
  }
})
