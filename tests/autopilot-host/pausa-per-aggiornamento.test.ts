import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Fermarsi per un aggiornamento, e ripartire da soli.
 *
 * La fine di un turno è l'unico punto in cui una chat si può fermare senza
 * lasciare niente a metà: quello che aveva in mano lo ha finito, quello che
 * aveva da scrivere è sul disco. Fermarla altrove significa ucciderla dentro
 * un'azione — una compilazione, una pubblicazione — ed è il danno che
 * l'aggiornamento faceva ogni volta.
 */
let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let ripartite: string[]
let criteriEseguiti: number
let orologio: number

function ora(): string {
  return new Date(orologio).toISOString()
}

const SILENZIO_MS = 60_000

function banco(): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pausa-')))
  ripartite = []
  criteriEseguiti = 0
  orologio = Date.parse('2026-08-30T09:00:00.000Z')
  return creaServer({
    archivio,
    esegui: () => { criteriEseguiti += 1; return Promise.resolve({ codice: 0, uscita: 'ok' }) },
    interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzione": "vai avanti"}' }),
    avviaLavoro: (a) => { ripartite.push(a.id); return Promise.resolve() },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    silenzioMassimoMs: SILENZIO_MS,
    adesso: ora
  })
}

function alLavoro(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-notte',
      nome: 'Notte',
      obiettivo: 'Fai passare i test',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-30T01:00:00.000Z'
    }),
    stato: 'lavoro',
    cicli: 3,
    sessionId: 's-vecchia',
    ...over
  }
}

async function posta(percorso: string, corpo?: unknown): Promise<unknown> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const testo = await r.text()
  return testo === '' ? {} : JSON.parse(testo)
}

beforeEach(async () => {
  server = banco()
  await new Promise<void>((ris) => {
    server.listen(0, '127.0.0.1', () => {
      porta = (server.address() as { port: number }).port
      ris()
    })
  })
})

afterEach(() => { server.close() })

describe('la pausa per aggiornare', () => {
  it('segna chi sta lavorando, senza fermarlo adesso', async () => {
    archivio.scrivi(alLavoro())
    expect(await posta('/pausa-aggiornamento')).toEqual({ attiva: true, toccati: 1 })
    expect(archivio.leggi('ap-notte')?.fermatoPerAggiornamento).toBe(true)
    // Non è una sospensione: chi risulta «sospeso» non viene ripreso di
    // proposito, perché dietro c'è la decisione di qualcuno.
    expect(archivio.leggi('ap-notte')?.stato).toBe('lavoro')
  })

  it('alla fine del turno lo lascia fermare, invece di dirgli di proseguire', async () => {
    archivio.scrivi(alLavoro())
    await posta('/pausa-aggiornamento')
    const risposta = await posta('/hook/stop?ap=ap-notte', {
      session_id: 's-nuova',
      last_assistant_message: 'fatto'
    })
    // `{}` è la risposta con cui una chat si ferma: nessun `decision`.
    expect(risposta).toEqual({})
    // E non si passano minuti a misurare criteri per un lavoro che si sta
    // fermando: chi ha premuto «Installa» sta guardando un'attesa.
    expect(criteriEseguiti).toBe(0)
    // Il turno però è stato contato: era un turno vero.
    expect(archivio.leggi('ap-notte')?.cicli).toBe(4)
  })

  it('il guardiano non lo sospende per il silenzio che gli abbiamo chiesto noi', () => {
    // Sospenderlo lo marcherebbe `sospeso`, cioè proprio lo stato che la
    // ripresa salta di proposito: si sveglierebbe fermo per sempre.
    archivio.scrivi(alLavoro({ fermatoPerAggiornamento: true }))
    orologio += SILENZIO_MS * 3
    server.controllaChatFerme()
    expect(archivio.leggi('ap-notte')?.stato).toBe('lavoro')
  })

  it('senza la pausa, lo stesso silenzio lo sospende', () => {
    archivio.scrivi(alLavoro())
    orologio += SILENZIO_MS * 3
    server.controllaChatFerme()
    expect(archivio.leggi('ap-notte')?.stato).toBe('sospeso')
  })
})

describe('il ritorno dopo l aggiornamento', () => {
  it('riparte da solo, e il segno della pausa se ne va', () => {
    archivio.scrivi(alLavoro({ fermatoPerAggiornamento: true }))
    expect(server.riprendiLavori()).toBe(1)
    expect(ripartite).toEqual(['ap-notte'])
    // Se restasse, la fine del primo turno ripreso lo rimetterebbe a dormire.
    expect(archivio.leggi('ap-notte')?.fermatoPerAggiornamento).toBeUndefined()
  })

  it('riparte anche se aveva detto «non riprendere al riavvio»', () => {
    // Quell'interruttore serve a non far resuscitare un autopilota dopo un
    // riavvio del computer, non a lasciare per strada un lavoro che siamo
    // stati **noi** a interrompere per installare.
    archivio.scrivi(alLavoro({ riprendiAlRiavvio: false, fermatoPerAggiornamento: true }))
    expect(server.riprendiLavori()).toBe(1)
  })

  it('senza la pausa quell interruttore continua a valere', () => {
    archivio.scrivi(alLavoro({ riprendiAlRiavvio: false }))
    expect(server.riprendiLavori()).toBe(0)
  })

  it('se l installazione non si fa piu, la pausa si disfa', async () => {
    // L'attesa è scaduta, o l'utente ha cambiato idea: lasciarli fermi ad
    // aspettare un riavvio che non arriva sarebbe il peggiore dei due errori.
    archivio.scrivi(alLavoro({ fermatoPerAggiornamento: true }))
    expect(await posta('/pausa-aggiornamento', { attiva: false })).toEqual({ attiva: false, toccati: 1 })
    expect(archivio.leggi('ap-notte')?.fermatoPerAggiornamento).toBeUndefined()
  })
})
