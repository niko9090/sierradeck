import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'pty-host': resolve('src/pty-host/index.ts'),
          // Il servizio autopilota vive fuori dal ciclo di vita dell'app, ma si
          // compila con gli altri: e' lo stesso codice, con lo stesso alias
          // @shared, e l'artefatto finisce accanto agli altri in out/main.
          'autopilot-host': resolve('src/autopilot-host/avvio.ts')
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
