// Svuota la cartella `dist` del progetto prima di costruire l'installer.
//
// Prima era un `node -e` con una cancellazione ricorsiva di `dist` dentro
// package.json: con un percorso relativo, fuori
// dalla guardia. Dalla 0.72.0 (dopo la cancellazione di AppData\Local del
// 14/10) passa da `cancellaSicura`: solo `dist` dentro la cartella del progetto.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

const progetto = fileURLToPath(new URL('..', import.meta.url))
const esito = cancellaSicura(join(progetto, 'dist'), { dentro: [progetto] })
console.log(`[pulisci-dist] dist: ${esito}`)
