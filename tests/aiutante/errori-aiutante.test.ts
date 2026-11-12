import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaInvioErrori, registroConStorico } from '../../src/aiutante/errori-aiutante'
import type { Registro } from '../../src/main/registro'
import type { InvioErrori } from '../../src/shared/storico-errori'

/**
 * 12/11, Nicholas: «anche l'aiutante deve mandare al PC di sviluppo gli
 * errori o blocchi ecc». Ogni `registro.errore` dell'Aiutante entra nello
 * storico (senza segreti) e parte da solo verso il PC di sviluppo, con il nome
 * dell'Aiutante; se quel PC è spento, resta sul Drive nella sua posta.
 */
function registroFinto(): Registro & { righe: string[] } {
  const righe: string[] = []
  return { righe, info: (m) => righe.push(`i ${m}`), errore: (m) => righe.push(`e ${m}`), file: () => '', cartella: () => '' }
}

function prepara(p: { pcScelto?: string; progetti?: Array<{ nome: string; proprietario?: string }>; chiama?: (pc: string, percorso: string, corpo: InvioErrori) => Promise<unknown>; perPosta?: (pc: string, invio: InvioErrori) => Promise<boolean> }) {
  const dati = mkdtempSync(join(tmpdir(), 'aiutante-errori-'))
  const { registro, storico } = registroConStorico({ dati, versione: '1.0.0', registro: registroFinto(), nomePc: () => 'Aiutante Uno' })
  const mandati: Array<{ pc: string; percorso: string; corpo: InvioErrori }> = []
  const invio = creaInvioErrori({
    dati, versione: '1.0.0', registro, storico,
    io: () => ({ id: 'pc-aiutante', nome: 'Aiutante Uno' }),
    pcScelto: () => p.pcScelto,
    progetti: () => p.progetti ?? [],
    nomeDi: (pc) => (pc === 'pc-sviluppo' ? 'Fisso' : undefined),
    chiama: p.chiama ?? (async (pc, percorso, corpo) => { mandati.push({ pc, percorso, corpo }); return { ok: true } }),
    perPosta: p.perPosta ?? (async () => false)
  })
  return { registro, storico, invio, mandati }
}

describe('gli errori dell’Aiutante verso il PC di sviluppo', () => {
  it('un blocco scritto nel registro entra nello storico, senza segreti', () => {
    const { registro, storico } = prepara({})
    registro.errore('[aiuto] lavoro r000000000001 non riuscito: token sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 rifiutato')
    const voci = storico.leggi().voci
    expect(voci).toHaveLength(1)
    expect(JSON.stringify(voci)).not.toMatch(/sk-ant-api03-ABCDEFGHIJ/u)
  })
  it('partono da soli al PC di sviluppo di serie (il proprietario di SierraDeck), con il nome dell’Aiutante', async () => {
    const { registro, invio, mandati } = prepara({ progetti: [{ nome: 'SierraDeck', proprietario: 'pc-sviluppo' }] })
    registro.errore('[requisiti] all’Aiutante manca: Git')
    const e = await invio.giro(true)
    expect(e.ok).toBe(true)
    expect(mandati).toHaveLength(1)
    expect(mandati[0]).toMatchObject({ pc: 'pc-sviluppo', percorso: '/api/errori/arrivati' })
    expect(mandati[0]!.corpo.da).toBe('Aiutante Uno')
    expect(mandati[0]!.corpo.voci.length).toBe(1)
    // Segnati come mandati: il giro dopo non li rimanda.
    expect((await invio.giro(true)).ok).toBe(false)
    expect(mandati).toHaveLength(1)
  })
  it('il PC scelto nelle impostazioni vince su quello di serie', async () => {
    const { registro, invio, mandati } = prepara({ pcScelto: 'pc-scelto', progetti: [{ nome: 'SierraDeck', proprietario: 'pc-sviluppo' }] })
    registro.errore('[aggiornamenti] aggiornamento dell’Aiutante non riuscito: 404')
    await invio.giro(true)
    expect(mandati[0]?.pc).toBe('pc-scelto')
  })
  it('il PC di sviluppo spento: gli errori nella sua posta sul Drive', async () => {
    const posta: string[] = []
    const { registro, invio } = prepara({
      progetti: [{ nome: 'SierraDeck', proprietario: 'pc-sviluppo' }],
      chiama: async () => { throw new Error('non risponde') },
      perPosta: async (pc, inv) => { posta.push(`${pc}:${inv.da}`); return true }
    })
    registro.errore('[rete] il Drive è scollegato')
    const e = await invio.giro(true)
    expect(e.ok).toBe(true)
    expect(posta).toEqual(['pc-sviluppo:Aiutante Uno'])
  })
  it('senza un PC di sviluppo non manda niente, e lo dice', async () => {
    const { registro, invio, mandati } = prepara({})
    registro.errore('[aiuto] qualcosa')
    expect((await invio.giro(true)).messaggio).toMatch(/PC di sviluppo/u)
    expect(mandati).toHaveLength(0)
  })
})
