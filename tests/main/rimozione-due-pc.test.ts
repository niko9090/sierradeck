import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServerClient } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { creaLatoResidente, creaRimozione } from '../../src/main/rimozione-sicura'
import type { BattitoPc } from '../../src/shared/posta'

// 0.58.0, tappa 4: il giro della rimozione sicura fra DUE PC, con il codice
// vero del Client (server HTTP), della firma con la chiave di casa e del client
// remoto, su cartelle temporanee e dati d'esempio. Mai progetti veri.

const CHIAVE = 'chiave-di-casa-esempio'
const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const scrivi = (radice: string, rel: string, testo: string): void => { mkdirSync(join(radice, rel, '..'), { recursive: true }); writeFileSync(join(radice, rel), testo) }

describe('due PC veri in rete: residente e non residente', () => {
  it('confronto firmato, recupero nei recuperati del residente, conferma, recupero locale, ripristina; con un’altra cassaforte niente', async () => {
    const residente = tmp('sd-2pc-A-')
    const nonResidente = tmp('sd-2pc-B-')
    scrivi(residente, 'LEGGIMI.md', 'uguale')
    scrivi(nonResidente, 'LEGGIMI.md', 'uguale')
    scrivi(nonResidente, 'idee/solo-qui.md', 'utile solo sul PC non residente')

    // Il PC residente: il suo Client vero, con il lato residente della rimozione.
    const lato = creaLatoResidente({ io: () => ({ id: 'pc-a' }), cartellaDi: (id) => (id === 'prog-1' ? residente : undefined), chatQui: () => undefined })
    const rotte = rotteClient({ rimozione: lato, chat: () => [] } as unknown as DipendenzeRotte)
    const server = creaServerClient({ dispositivi: apriDispositivi(tmp('sd-2pc-d-')), chiaveDiCasa: () => CHIAVE, rotta: (r) => rotte(r) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const porta = (server.address() as { port: number }).port
    try {
      const battito: BattitoPc = { pcId: 'pc-a', nome: 'PC-ESEMPIO', versione: '0.58.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
      const log: string[] = []
      const remoto = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => CHIAVE, mioNome: () => 'PORTATILE-ESEMPIO', mioId: () => 'pc-b', log: (m) => { log.push(m) } })
      const dati = tmp('sd-2pc-dati-')
      const progetto = () => ({ id: 'prog-1', nome: 'Esempio', cartella: nonResidente, residente: { pc: 'pc-a', nome: 'PC-ESEMPIO' } })
      const rimozione = creaRimozione({
        dati, io: () => ({ id: 'pc-b', nome: 'PORTATILE-ESEMPIO' }), progetto, chatDi: () => [], inUso: () => undefined,
        chiama: (pc, percorso, corpo) => remoto.chiama(pc, percorso, corpo)
      })

      const st = await rimozione.avvia('prog-1')
      expect(st.fase).toBe('attesa-conferma')
      expect(st.riassunto).toMatchObject({ uguali: 1, utili: 1 })
      expect(st.riassunto?.recuperati[0]?.dove).toMatch(/^\.sierradeck\/recuperati\/PORTATILE-ESEMPIO-.+\/idee\/solo-qui\.md$/)
      const giro = readdirSync(join(residente, '.sierradeck', 'recuperati'))[0] as string
      expect(readFileSync(join(residente, '.sierradeck', 'recuperati', giro, 'idee', 'solo-qui.md'), 'utf8')).toBe('utile solo sul PC non residente')
      expect(log.join('\n')).toContain('PC-ESEMPIO: strada rete di casa')

      expect(rimozione.conferma('prog-1').fase).toBe('spostata')
      expect(existsSync(nonResidente)).toBe(false)
      const [c] = rimozione.inRecupero()
      expect(existsSync(join(c!.dove, 'idee', 'solo-qui.md'))).toBe(true)
      expect(rimozione.ripristina(c!.id).ok).toBe(true)
      expect(readFileSync(join(nonResidente, 'idee', 'solo-qui.md'), 'utf8')).toBe('utile solo sul PC non residente')

      // Un PC di un'altra cassaforte: niente confronto, niente rimozione.
      const estraneo = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => 'un-altra-chiave', mioNome: () => 'ESTRANEO', mioId: () => 'pc-x' })
      const r2 = creaRimozione({ dati: tmp('sd-2pc-dati2-'), io: () => ({ id: 'pc-x', nome: 'ESTRANEO' }), progetto, chatDi: () => [], inUso: () => undefined, chiama: (pc, p, b) => estraneo.chiama(pc, p, b) })
      const no = await r2.avvia('prog-1')
      expect(no.fase).toBe('errore')
      expect(existsSync(join(nonResidente, 'idee', 'solo-qui.md'))).toBe(true)
    } finally {
      server.close()
    }
  })
})
