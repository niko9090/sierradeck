import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'

/**
 * Il nome dello script nella cartella Esecuzione automatica.
 *
 * Fisso, e sempre lo stesso: reinstallare deve **sovrascrivere**. Dopo uno
 * spostamento della cartella del progetto, un secondo script con un altro nome
 * lascerebbe vivo anche quello vecchio, che punta a un file inesistente — e due
 * script all'avvio significano due servizi, con il secondo che muore per porta
 * occupata lasciando un errore che nessuno legge.
 */
const NOME_SCRIPT = 'gestore-sessioni-autopilota.cmd'

/**
 * La cartella Esecuzione automatica dell'utente.
 *
 * Si usa questa e non il Task Scheduler: su questa macchina
 * `Register-ScheduledTask` chiede l'elevazione e fallisce con «Accesso negato» —
 * è la stessa ragione per cui i servizi che devono restare accesi partono da qui.
 */
export function cartellaEsecuzioneAutomatica(): string {
  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
}

export function installaAvvioAlLogin(p: {
  cartella: string
  eseguibile: string
  script: string
}): string {
  mkdirSync(p.cartella, { recursive: true })
  const percorso = join(p.cartella, NOME_SCRIPT)
  const contenuto = [
    '@echo off',
    'rem Avvia il servizio autopilota di SierraDeck.',
    'rem Generato dall applicazione: per toglierlo, usa il comando nel pannello',
    'rem Autopiloti oppure cancella questo file.',
    '',
    'rem ELECTRON_RUN_AS_NODE fa girare l eseguibile di Electron come Node:',
    'rem senza, aprirebbe una finestra invece di avviare il servizio.',
    'set ELECTRON_RUN_AS_NODE=1',
    `start "" /b "${p.eseguibile}" "${p.script}"`,
    ''
  ].join('\r\n')
  // Anche questo per intero o per niente. È l'unico file che qualcun altro
  // esegue — lo lancia Windows all'accesso — e un troncone non darebbe un
  // errore: eseguirebbe le righe che ci sono e si fermerebbe. Il servizio non
  // partirebbe, e l'utente lo scoprirebbe la mattina dopo trovando il lavoro
  // fermo, senza niente che gliene dia il motivo.
  if (!scriviAtomico(percorso, contenuto, 'autopilota')) {
    throw new Error(`avvio al login: impossibile scrivere ${percorso}`)
  }
  return percorso
}

export function disinstallaAvvioAlLogin(cartella: string): void {
  const percorso = join(cartella, NOME_SCRIPT)
  try {
    // Solo il nostro file: accanto ci sono i programmi che l'utente ha scelto di
    // avviare al login, e nessuno di quelli ci riguarda.
    if (existsSync(percorso)) unlinkSync(percorso)
  } catch (err) {
    console.error(`[autopilota] rimozione di ${percorso} fallita:`, err)
  }
}

export function statoAvvioAlLogin(cartella: string): { installato: boolean; percorso: string } {
  const percorso = join(cartella, NOME_SCRIPT)
  return { installato: existsSync(percorso), percorso }
}
