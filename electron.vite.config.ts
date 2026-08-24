import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Le credenziali del client OAuth «Desktop» di Google, **incastonate nel build**.
 *
 * Devono essere dentro l'app perché ogni PC che la installa possa agganciare il
 * proprio Drive con un clic — non basta un file sulla macchina di sviluppo. Si
 * leggono qui, a compile time, da `SD_GOOGLE_CLIENT_ID`/`SECRET` o da un
 * `google-oauth.json` nella radice (NON versionato: GitHub bloccherebbe il push
 * del secret). Se mancano, restano vuote e l'app dirà «Drive non configurato»
 * invece di rompersi. Per un client Desktop il secret è pensato per stare nel
 * client (PKCE protegge), quindi va bene averlo nel pacchetto.
 */
function credenzialiGoogle(): { clientId: string; clientSecret: string } {
  const id = process.env.SD_GOOGLE_CLIENT_ID
  const segreto = process.env.SD_GOOGLE_CLIENT_SECRET
  if (id !== undefined && id !== '' && segreto !== undefined && segreto !== '') {
    return { clientId: id, clientSecret: segreto }
  }
  const file = resolve('google-oauth.json')
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as { clientId?: unknown; clientSecret?: unknown }
      if (typeof j.clientId === 'string' && typeof j.clientSecret === 'string') {
        return { clientId: j.clientId, clientSecret: j.clientSecret }
      }
    } catch {
      // Un file storto non deve fermare il build: si finisce con le stringhe vuote.
    }
  }
  return { clientId: '', clientSecret: '' }
}
const google = credenzialiGoogle()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(google.clientId),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(google.clientSecret)
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'pty-host': resolve('src/pty-host/index.ts'),
          // Il servizio autopilota vive fuori dal ciclo di vita dell'app, ma si
          // compila con gli altri: e' lo stesso codice, con lo stesso alias
          // @shared, e l'artefatto finisce accanto agli altri in out/main.
          'autopilot-host': resolve('src/autopilot-host/avvio.ts'),
          // Il thread separato della sincronizzazione: si compila accanto agli
          // altri e finisce in out/main, dove il main lo carica come Worker.
          'sync-worker': resolve('src/main/cassaforte/sync-worker.ts')
        }
      }
    },
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/preload/index.ts') } }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
