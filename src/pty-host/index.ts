import { PtyManager } from './pty-manager'
import { startHost } from './host'

const manager = new PtyManager()

startHost({
  manager,
  stdin: process.stdin,
  write: (chunk) => {
    process.stdout.write(chunk)
  },
  exit: (code) => process.exit(code),
  log: (message) => console.error(message)
})

// Rete di sicurezza, non meccanismo primario: le vie d'uscita previste passano
// tutte da startHost. Questo gestore copre solo ciò che le aggira — un'uscita
// per eccezione non gestita — e non copre la terminazione dall'esterno, dove su
// Windows nessun gestore viene eseguito.
process.on('exit', () => manager.killAll())
