import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { cartellaDiProva } from '@shared/chat-di-prova'
import { giudicaStrumento } from '../../src/autopilot-host/divieti'
import { leggiRichiestaPonte, azioneDelPonte } from '@shared/ponte-telefono'
import { rottaPermessaSulCanale } from '@shared/strada-pc'

/**
 * Le chat di prova (0.63.0): chi collauda le chiude da solo; le chat vere no.
 * Decisione di Nicholas del 12/10: «se devi chiudere delle chat di prova devi
 * essere autonomo».
 */

const PROVA = 'C:\\Progetti\\SierraDeck-prova-collaudo'
const VERA = 'C:\\Progetti\\Trading'

function deps(chiuse: string[], righe: string[]): DipendenzeRotte {
  const base = {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-prova-'))),
    chat: () => [
      { id: 'sf-prova', titolo: 'Prova chiusura', cwd: PROVA },
      { id: 'p-vera', titolo: 'Controllo resa', cwd: VERA }
    ],
    chiudiChat: (id: string) => { chiuse.push(id) },
    log: (r: string) => { righe.push(r) }
  }
  return base as unknown as DipendenzeRotte
}

describe('quale chat è di prova', () => {
  it('conta il nome della cartella in cui lavora, non quelli sopra', () => {
    expect(cartellaDiProva(PROVA)).toBe(true)
    expect(cartellaDiProva('/home/x/sierradeck-prova-due/')).toBe(true)
    expect(cartellaDiProva(VERA)).toBe(false)
    expect(cartellaDiProva('C:\\SierraDeck-prova-collaudo\\Trading')).toBe(false)
    expect(cartellaDiProva('C:\\Progetti\\SierraDeck-prova-')).toBe(false)
    expect(cartellaDiProva('C:\\Progetti\\SierraDeck')).toBe(false)
  })
})

describe('/api/prova/chiudi', () => {
  it('chiude una chat di prova e lo scrive nel registro', async () => {
    const chiuse: string[] = []
    const righe: string[] = []
    const r = await rotteClient(deps(chiuse, righe))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'sf-prova' } })
    expect(r.stato).toBe(200)
    expect(chiuse).toEqual(['sf-prova'])
    expect(righe.join('\n')).toContain('[prova] chiudo la chat di prova «Prova chiusura»')
  })

  it('rifiuta una chat vera, dicendo perché, e non la chiude', async () => {
    const chiuse: string[] = []
    const r = await rotteClient(deps(chiuse, []))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'p-vera' } })
    expect(r.stato).toBe(403)
    expect(String((r.corpo as { errore: string }).errore)).toContain('non è una chat di prova')
    expect(chiuse).toEqual([])
  })

  it('una chat che non c’è: 404, niente chiuso', async () => {
    const chiuse: string[] = []
    const r = await rotteClient(deps(chiuse, []))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'nessuna' } })
    expect(r.stato).toBe(404)
    expect(chiuse).toEqual([])
  })

  it('passa dal ponte e fra i PC, e il ponte lo scrive', () => {
    expect(leggiRichiestaPonte({ pc: 'lap', percorso: '/api/prova/chiudi', corpo: { chat: 'sf-prova' } }).ok).toBe(true)
    expect(rottaPermessaSulCanale('/api/prova/chiudi')).toBe(true)
    expect(azioneDelPonte('/api/prova/chiudi', { chat: 'sf-prova' })).toBe('chiudo la chat di prova sf-prova')
  })
})

describe('l’hook delle chat governate', () => {
  const bash = (command: string) => giudicaStrumento({ tool_name: 'Bash', tool_input: { command }, cwd: 'C:\\lavoro' }, ['C:\\lavoro'])

  it('lascia passare la chiusura delle chat di prova', () => {
    expect(bash('curl -X POST http://127.0.0.1:47640/api/prova/chiudi -d \'{"chat":"sf-prova"}\'').ok).toBe(true)
  })

  it('continua a negare la chiusura delle chat vere', () => {
    expect(bash('curl -X POST http://127.0.0.1:47640/api/chat/chiudi -d \'{"chat":"p-vera"}\'').ok).toBe(false)
  })
})
