import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  dopoRifiuto, esitiCheDecidono, RIFIUTI_PRIMA_DEL_GIUDIZIO, rifiutiDi, rigaChiusoSenzaMisura, senzaMisura
} from '../../src/autopilot-host/criteri-giudicati'
import { applicaRete } from '../../src/autopilot-host/rete-sicurezza'
import type { EsitoVerifica } from '../../src/autopilot-host/decisione'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, parseAutopilota, type Autopilota, type Criterio } from '@shared/autopilota'

/**
 * «Lo giudico io» (0.84.3), con il caso vero del 22/10: l'autopilota di un
 * progetto di Nicholas aveva il criterio del «gruppo 3» che non si lasciava
 * correggere («quel comando misura, e boccia»), «finito» rifiutato per lo
 * stesso criterio, e la domanda «Chiudi tu a mano l'autopilota…?».
 */

const GRUPPO = 'Il controllo del gruppo 3 passa'
const CRITERI: Criterio[] = [
  { descrizione: 'i test passano', comando: 'npm test', soddisfatto: true },
  { descrizione: GRUPPO, comando: 'grep -q ok out/gruppo3.log | head -1 | grep -q .', soddisfatto: false }
]
const BOCCIATO: EsitoVerifica = { descrizione: GRUPPO, comando: CRITERI[1]!.comando!, passato: false, uscita: '' }
const VERDE: EsitoVerifica = { descrizione: 'i test passano', comando: 'npm test', passato: true, uscita: 'ok' }

const ap = (over: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Migliorie', obiettivo: 'Proposte di migliorie', cwd: 'C:\\p', criteri: CRITERI, iniziatoIl: '2026-10-22T08:00:00.000Z' }),
  ...over
})

describe('i rifiuti si contano dalla storia', () => {
  it('vale anche per gli autopiloti di prima: le righe del 22/10 contano', () => {
    const a = ap({
      decisioni: [
        { quando: '1', cosa: `supervisore → prosegui: correzione rifiutata per «${GRUPPO}»: quel comando misura, e boccia` },
        { quando: '2', cosa: 'proseguito: altro' },
        { quando: '3', cosa: `Il comando del criterio «${GRUPPO}» non va bene e non l'ho preso:\nx` }
      ]
    })
    expect(rifiutiDi(a, GRUPPO)).toBe(2)
    expect(rifiutiDi(a, 'i test passano')).toBe(0)
  })
  it('una correzione accettata azzera il conto', () => {
    const a = ap({
      decisioni: [
        { quando: '1', cosa: `correzione rifiutata per «${GRUPPO}» (1 di 2): x` },
        { quando: '2', cosa: `criterio corretto — «${GRUPPO}»: npm run g3` }
      ]
    })
    expect(rifiutiDi(a, GRUPPO)).toBe(0)
  })
})

describe('un altro tentativo, poi «lo giudico io»', () => {
  it('al primo rifiuto: il motivo e un altro tentativo, il criterio resta com’è', () => {
    const r = dopoRifiuto({ criteri: CRITERI, descrizione: GRUPPO, motivo: 'quel comando misura e boccia', rifiutiPrima: 0, adesso: '2026-10-22T11:00:00.000Z' })
    expect(r.giudicato).toBe(false)
    expect(r.criteri).toBe(CRITERI)
    expect(r.istruzioni).toContain('quel comando misura e boccia')
    expect(r.istruzioni).toContain('Hai un altro tentativo')
    expect(r.riga).toContain(`correzione rifiutata per «${GRUPPO}» (1 di ${RIFIUTI_PRIMA_DEL_GIUDIZIO})`)
  })
  it('al secondo: il criterio lo giudica l’autopilota, una riga per Nicholas e nessuna domanda', () => {
    const r = dopoRifiuto({ criteri: CRITERI, descrizione: GRUPPO, motivo: 'quel comando misura e boccia', rifiutiPrima: 1, perche: 'grep -q non stampa niente: la catena non passa mai', adesso: '2026-10-22T11:05:00.000Z' })
    expect(r.giudicato).toBe(true)
    expect(r.criteri[1]?.giudicato).toEqual({ il: '2026-10-22T11:05:00.000Z', perche: expect.stringContaining('grep -q non stampa niente') })
    expect(r.riga).toMatch(/^Il criterio «Il controllo del gruppo 3 passa» lo giudico io: /)
    expect(r.riga).not.toContain('?')
    expect(r.istruzioni).toContain('Non chiedere niente a Nicholas')
  })
  it('il giudizio resta dopo il salvataggio su disco', () => {
    const r = dopoRifiuto({ criteri: CRITERI, descrizione: GRUPPO, motivo: 'x', rifiutiPrima: 1, adesso: '2026-10-22T11:05:00.000Z' })
    const letto = parseAutopilota({ versione: 1, ...JSON.parse(JSON.stringify(ap({ criteri: r.criteri }))) })
    expect(letto.autopilota?.criteri[1]?.giudicato?.il).toBe('2026-10-22T11:05:00.000Z')
  })
})

describe('un criterio giudicato non ferma più la chiusura', () => {
  const giudicati = CRITERI.map((c) => (c.descrizione === GRUPPO ? { ...c, giudicato: { il: 'x', perche: 'y' } } : c))
  it('esce dagli esiti che decidono', () => {
    expect(esitiCheDecidono([VERDE, BOCCIATO], giudicati)).toEqual([VERDE])
    expect(esitiCheDecidono([VERDE, BOCCIATO], CRITERI)).toEqual([VERDE, BOCCIATO])
  })
  it('22/10: prima «finito» era rifiutato; con il criterio giudicato passa', () => {
    expect(applicaRete({ a: ap(), esiti: [VERDE, BOCCIATO], inCerchioDa: 0 }, { azione: 'finito' }).mossa.tipo).not.toBe('finito')
    expect(applicaRete({ a: ap({ criteri: giudicati }), esiti: [VERDE, BOCCIATO], inCerchioDa: 0 }, { azione: 'finito' }).mossa.tipo).toBe('finito')
  })
  it('la correzione rifiutata porta il rifiuto, da contare', () => {
    const r = applicaRete({ a: ap(), esiti: [VERDE, BOCCIATO], inCerchioDa: 0 }, { azione: 'correggiCriterio', criterio: { descrizione: GRUPPO, comando: 'true' } })
    expect(r.rifiuto?.descrizione).toBe(GRUPPO)
    expect(r.mossa.tipo).toBe('prosegui')
  })
})

describe('la riga di chiusura con criteri non misurati', () => {
  it('dice quale criterio e perché, il recupero di 30 giorni e come riaprirlo; nessuna domanda', () => {
    const quali = senzaMisura([{ descrizione: GRUPPO, comando: 'x', passato: false, misurato: false, uscita: 'bash: syntax error near unexpected token' }, VERDE])
    expect(quali).toEqual([{ descrizione: GRUPPO, perche: 'il comando di verifica non parte («bash: syntax error near unexpected token»)' }])
    const riga = rigaChiusoSenzaMisura(quali)
    expect(riga).toContain(`«${GRUPPO}»`)
    expect(riga).toContain('recupero per 30 giorni')
    expect(riga).toContain('«Riprendi»')
    expect(riga).not.toContain('?')
  })
})

/* ------------------------------------------------------------------ */
/* Nel servizio: il caso del 22/10 dall'inizio alla fine.              */
/* ------------------------------------------------------------------ */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: RegistroDomande
let avvisi: string[]

afterEach(() => { server?.close(); server = undefined })

async function avviaServizio(risposte: string[], criteri: Criterio[] = CRITERI): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-giudicati-')))
  registro = creaRegistroDomande({ adesso: () => Date.now() })
  avvisi = []
  let n = 0
  const s = creaServer({
    archivio,
    esegui: (comando) => Promise.resolve(
      comando.includes('gruppo3') ? { codice: 1, uscita: '' }
        : comando.startsWith('node -e') ? { codice: 127, uscita: 'SyntaxError: missing ) after argument list' }
          : { codice: 0, uscita: 'ok' }
    ),
    interroga: () => Promise.resolve({ testo: risposte[Math.min(n++, risposte.length - 1)] ?? '{"azione": "finito"}' }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => undefined,
    avvisa: (_t, _a, testo) => { if (testo !== undefined) avvisi.push(testo); return Promise.resolve() },
    domande: registro,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    ultimoDetto: () => 'Ho finito il resto.',
    adesso: () => new Date().toISOString()
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({ ...ap({ cwd: process.cwd(), criteri }), stato: 'lavoro' })
}

const stop = (): Promise<Response> => fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-1`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: 's-1', stop_hook_active: false, last_assistant_message: 'Ho finito il resto.', hook_event_name: 'Stop', cwd: process.cwd() })
})

describe('nel servizio, il caso del 22/10', () => {
  it('due correzioni rifiutate, poi «lo giudico io»: il lavoro si chiude senza domande a Nicholas', async () => {
    const correggi = JSON.stringify({ azione: 'correggiCriterio', criterio: { descrizione: GRUPPO, comando: 'true' }, perche: 'grep -q non stampa niente: la catena non passa mai' })
    await avviaServizio([correggi, correggi, '{"azione": "finito"}'])

    await stop()
    let a = archivio.leggi('ap-1')!
    expect(a.criteri[1]?.giudicato).toBeUndefined()
    expect(a.decisioni.some((d) => d.cosa.includes('(1 di 2)'))).toBe(true)

    await stop()
    a = archivio.leggi('ap-1')!
    expect(a.criteri[1]?.giudicato).toBeDefined()
    expect(avvisi.some((t) => t.includes('lo giudico io'))).toBe(true)

    await stop()
    a = archivio.leggi('ap-1')!
    expect(a.stato).toBe('finito')
    expect(registro.aperte('ap-1')).toEqual([])
  })

  it('a lavoro finito, un criterio che non parte non diventa una domanda: chiude con la riga', async () => {
    // Il comando non parte; la riparazione automatica chiede al supervisore, che risponde «finito» (nessun comando nuovo).
    await avviaServizio(['{"azione": "finito"}'], [CRITERI[0]!, { descrizione: 'la pagina si apre', comando: 'node -e "process.exit(1"', soddisfatto: false }])
    await stop()
    const a = archivio.leggi('ap-1')!
    expect(registro.aperte('ap-1')).toEqual([])
    expect(a.stato).toBe('finito')
    expect(a.decisioni.some((d) => d.cosa.startsWith('Lavoro chiuso da solo anche se un criterio non si è potuto misurare — «la pagina si apre»'))).toBe(true)
  })
})
