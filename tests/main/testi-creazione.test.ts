import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * La finestra di creazione dell'autopilota dice la stessa cosa sulla pagina e
 * nell'app (sul PC il modulo non c'è più dal 30/10: l'autopilota è uno per workspace)
 * (correzione di Nicholas, 30/09): il «cloud» e' il Drive di SierraDeck, dove
 * si salvano le chat — non il remoto git, non gli script, non il deploy.
 */
describe('i testi della creazione: «va sul cloud» = le chat stanno sul Drive', () => {
  const lati = {
    pagina: readFileSync('src/main/client-pagina.ts', 'utf8'),
    app: readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Delega.kt', 'utf8')
  }

  it('la spunta si chiama allo stesso modo su PC, pagina e app', () => {
    for (const [lato, testo] of Object.entries(lati)) {
      expect(testo, lato).toContain('va sul cloud: le chat stanno sul Drive')
      expect(testo, lato).toContain('Il «cloud» è il Drive di SierraDeck')
      expect(testo, lato).toContain('servono solo a sapere dove mandare su')
    }
  })

  it('nessun lato dice piu che un remoto git o uno script danno l autonomia', () => {
    for (const [lato, testo] of Object.entries(lati)) {
      expect(testo, lato).not.toContain('remoto git, uno script di pubblicazione o di deploy che')
      expect(testo, lato).not.toContain('il progetto va sul cloud<')
    }
  })
})
