import { describe, it, expect } from 'vitest'
import { aggiungi, codaVuota, type Coda, type Modifica } from '@shared/coda-richieste'
import { pianoVuoto, type Piano } from '@shared/piano-orchestratore'
import type { Specialista } from '@shared/flusso-orchestratore'
import {
  avvisoInstallazione, chiamaStrumento, creaGettoniOrchestratore, configMcpOrchestratore, domandaSullInstallazione, rispondiMcpOrchestratore, DOMANDE_ORA_ORCHESTRATORE, STRUMENTI_ORCHESTRATORE, motivoDomandaInutile, MOTIVO_INSTALLAZIONE, MOTIVO_UNIONI_FERME,
  type AmbienteOrchestratore
} from '../../src/autopilot-host/mcp-orchestratore'

/**
 * P3: gli strumenti dell'orchestratore. Il programma valida ogni chiamata: la
 * coda non perde punti, il piano non fa cicli, l'unione passa dal cancello,
 * le domande hanno un tetto, il permesso torna come risposta per la CLI.
 */

const ADESSO = '2026-10-30T09:00:00.000Z'

function ambiente(over: Partial<AmbienteOrchestratore> = {}): AmbienteOrchestratore & { stato: { coda: Coda; piano: Piano; unioni: unknown[]; domande: string[] } } {
  let coda = codaVuota('Lavoro')
  coda = aggiungi(coda, { testo: 'la barra delle chat non mostra il numero', quando: ADESSO }).coda
  coda = aggiungi(coda, { testo: 'nella barra delle chat voglio il numero e il colore', quando: ADESSO }).coda
  const stato = { coda, piano: pianoVuoto(), unioni: [] as unknown[], domande: [] as string[] }
  const specialisti: Specialista[] = [{ id: 'tu-1', task: 't-1', ruolo: 'sviluppatore', descrizione: 'k1: barra', compito: 'k1', stato: 'finito', inizio: ADESSO }]
  const amb: AmbienteOrchestratore = {
    adesso: () => ADESSO,
    coda: () => stato.coda,
    cambiaCoda: (_ws, f) => { const m: Modifica | undefined = f(stato.coda); if (m !== undefined) stato.coda = m.coda; return stato.coda },
    piano: () => stato.piano,
    scriviPiano: (_ws, p) => { stato.piano = p },
    unico: () => undefined,
    specialisti: () => specialisti,
    unisci: (_ws, p) => { stato.unioni.push(p); return { ok: true, testo: 'avviata' } },
    permesso: (_ws, strumento) => Promise.resolve(strumento === 'WebFetch' ? { consenti: true } : { consenti: false, motivo: 'no' }),
    chiedi: (_ws, d) => { stato.domande.push(d); return { ok: true, testo: 'aperta' } },
    ritira: (_ws, id) => (id === 'q-1' ? { ok: true, testo: 'ritirata' } : { ok: false, motivo: 'nessuna' }),
    domandeUltimaOra: () => stato.domande.length,
    annota: () => ({ ok: true, testo: 'annotata' }),
    ricalcola: () => {},
    riassunto: () => 'STATO',
    ...over
  }
  return Object.assign(amb, { stato })
}

describe('strumenti dell’orchestratore', () => {
  it('non ci sono più gli strumenti per aprire, scrivere e chiudere le chat: gli specialisti sono subagenti', () => {
    const nomi = STRUMENTI_ORCHESTRATORE.map((s) => s.name)
    expect(nomi).toEqual(expect.arrayContaining(['stato', 'coda_unisci', 'piano_scrivi', 'unisci', 'chiedi_utente', 'quaderno_annota', 'permesso']))
    expect(nomi.some((n) => n.startsWith('specialista_'))).toBe(false)
  })

  it('11/11: le descrizioni non spingono più a chiedere, e dicono cosa decide il programma', () => {
    const di = (nome: string): { description?: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } } => STRUMENTI_ORCHESTRATORE.find((s) => s.name === nome)! as never
    const chiedi = di('chiedi_utente')
    expect(chiedi.description).toMatch(/solo per quello che è suo/)
    expect(chiedi.description).not.toMatch(/quando pubblicare/)
    expect(chiedi.description).toMatch(/non per l’installazione di SierraDeck/)
    // «rischiosa» c'è, ma non è obbligatorio.
    expect(Object.keys(chiedi.inputSchema.properties ?? {})).toContain('rischiosa')
    expect(chiedi.inputSchema.required).toEqual(['domanda', 'perche'])
    expect(di('permesso').description).toMatch(/decide il programma/)
    expect(di('permesso').description).not.toMatch(/la domanda va a Nicholas/)
    expect(di('piano_scrivi').description).toMatch(/seguito/)
  })

  it('coda_unisci rifiuta un’unione che perde un punto, e accetta quella che li nomina tutti', async () => {
    const a = ambiente()
    const persa = await chiamaStrumento(a, 'Lavoro', 'coda_unisci', { ids: ['r-1', 'r-2'], testo: 'la barra con numero e colore', punti: [{ id: 'p-1' }], perche: 'stessa barra' })
    expect(persa?.errore).toBe(true)
    expect(a.stato.coda.richieste.filter((r) => r.stato !== 'fatta')).toHaveLength(2)
    const buona = await chiamaStrumento(a, 'Lavoro', 'coda_unisci', { ids: ['r-1', 'r-2'], testo: 'la barra con numero e colore', punti: [{ id: 'p-1' }, { id: 'p-2' }], perche: 'stessa barra' })
    expect(buona?.errore).toBe(false)
  })

  it('piano_scrivi rifiuta un ciclo e registra un piano buono', async () => {
    const a = ambiente()
    const ciclo = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [
      { id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x', dopo: ['k2'] },
      { id: 'k2', richiesta: 'r-1', titolo: 'b', criterio: 'x', dopo: ['k1'] }
    ] })
    expect(ciclo?.errore).toBe(true)
    expect(ciclo?.testo).toMatch(/ciclo/)
    expect(a.stato.piano.compiti).toHaveLength(0)
    const ok = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'passa `npm test`' }] })
    expect(ok?.errore).toBe(false)
    expect(a.stato.piano.compiti.map((c) => c.id)).toEqual(['k1'])
  })

  // 11/11: prima il rifiuto «è già fatta» finiva in una domanda a Nicholas («Li correggo?»).
  it('11/11: piano_scrivi su una richiesta già fatta apre il seguito e lo dice; al terzo seguito rifiuta', async () => {
    const a = ambiente()
    const faiFatta = (id: string): void => { a.stato.coda = { ...a.stato.coda, richieste: a.stato.coda.richieste.map((r) => (r.id === id ? { ...r, stato: 'fatta' as const, fattaIl: ADESSO } : r)) } }
    faiFatta('r-1')
    const uno = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'd1', richiesta: 'r-1', titolo: 'correggi il primo difetto', criterio: 'passa `npx vitest run tests/a.test.ts`' }] })
    expect(uno?.errore).toBe(false)
    expect(uno?.testo).toMatch(/La richiesta r-1 è già fatta: ho aperto il seguito r-3/)
    expect(uno?.testo).toMatch(/senza chiedere/)
    expect(a.stato.coda.richieste.find((r) => r.id === 'r-3')).toMatchObject({ segue: 'r-1', stato: 'pianificata', compiti: ['d1'] })
    expect(a.stato.piano.compiti.find((k) => k.id === 'd1')?.richiesta).toBe('r-3')
    // Un rifiuto del piano (ciclo) non lascia in coda un seguito a vuoto.
    faiFatta('r-3')
    const prima = a.stato.coda.richieste.length
    const ciclo = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [
      { id: 'd2', richiesta: 'r-1', titolo: 'a', criterio: 'x', dopo: ['d3'] },
      { id: 'd3', richiesta: 'r-1', titolo: 'b', criterio: 'x', dopo: ['d2'] }
    ] })
    expect(ciclo?.errore).toBe(true)
    expect(a.stato.coda.richieste).toHaveLength(prima)
    const due = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'd2', richiesta: 'r-1', titolo: 'correggi il secondo', criterio: 'x' }] })
    expect(due?.errore).toBe(false)
    faiFatta('r-4')
    const tre = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'd3', richiesta: 'r-1', titolo: 'correggi il terzo', criterio: 'x' }] })
    expect(tre?.errore).toBe(true)
    expect(tre?.testo).toMatch(/ha già 2 seguiti/)
    expect(a.stato.coda.richieste).toHaveLength(prima + 1)
  })

  it('unisci vuole un compito del piano, uno specialista noto o un ramo valido', async () => {
    const a = ambiente()
    await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }] })
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', {}))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { compito: 'k9' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { specialista: 'tu-7' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { ramo: '--force' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { ramo: 'a/../b' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { compito: 'k1' }))?.errore).toBe(false)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { specialista: 't-1' }))?.errore).toBe(false)
    expect(a.stato.unioni).toEqual([{ compito: 'k1' }, { specialista: 't-1' }])
  })

  it('chiedi_utente: da 2 a 4 scelte (o nessuna), e un tetto all’ora', async () => {
    const a = ambiente()
    expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'quale colore?', scelte: ['blu'] }))?.errore).toBe(true)
    for (let i = 0; i < DOMANDE_ORA_ORCHESTRATORE; i += 1) {
      expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: `domanda ${i}?`, scelte: ['sì', 'no'] }))?.errore).toBe(false)
    }
    const troppe = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'ancora una?' })
    expect(troppe?.errore).toBe(true)
    expect(troppe?.testo).toMatch(/ultima ora/)
  })

  it('chiedi_utente (0.89.4): niente comandi da lanciare a mano; il perché arriva a chi apre la domanda', async () => {
    const perche: (string | undefined)[] = []
    const a = ambiente({ chiedi: (_ws, _d, _s, p) => { perche.push(p); return { ok: true, testo: 'aperta' } } })
    const git = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'Come procediamo?', perche: 'il ramo non si unisce', scelte: ['Fai tu git checkout dei 3 file', 'Lascia stare'] })
    expect(git?.errore).toBe(true)
    expect(git?.testo).toMatch(/lavoro tecnico lo fa uno specialista/)
    expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'Pubblico adesso la nuova versione?', perche: 'le correzioni sono pronte e provate', scelte: ['Sì → la pubblico ora', 'Domani'] }))?.errore).toBe(false)
    expect(perche).toEqual(['le correzioni sono pronte e provate'])
  })

  it('chiedi_utente (06/11): niente riavvii del servizio, programmi da chiudere o lavoro a mano; risolvilo da solo', async () => {
    const a = ambiente()
    const rifiutate = [
      { domanda: 'Puoi riavviare il servizio di SierraDeck così prendo la nuova versione?' },
      { domanda: 'Come procediamo?', scelte: ['Riavvia SierraDeck tu', 'Aspetto'] },
      { domanda: 'La cartella è occupata: puoi chiudere i programmi che la usano?' },
      { domanda: 'Puoi chiudere la chat che tiene il ramo?' },
      { domanda: 'Mi lanci il comando di pulizia da terminale?' },
      { domanda: 'Puoi fare a mano la copia dei file?' }
    ]
    for (const r of rifiutate) {
      const e = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', r)
      expect(e?.errore, r.domanda).toBe(true)
      expect(e?.testo, r.domanda).toMatch(/da solo|specialista/)
    }
    expect(a.stato.domande).toHaveLength(0)
    expect(motivoDomandaInutile('Pubblico la 1.2.0 o aspetto?')).toBeUndefined()
    expect(motivoDomandaInutile('Tengo il tema scuro o chiaro per le nuove schermate?')).toBeUndefined()
  })

  // 11/11: le domande vere del 31/10, 07/11, 10/11 e 11/11 («fai tu tu», «risolvi tutti questi problemi!!!!»).
  it('chiedi_utente (11/11): file non salvati, cartella principale e fila delle unioni non si chiedono a Nicholas', async () => {
    const a = ambiente()
    const rifiutate = [
      { domanda: 'Nella cartella principale di SierraDeck c’è una modifica non salvata, forse fatta da una tua chat. Da 5 ore tiene ferma l’unione della correzione per la rete. Come faccio?', scelte: ['È roba di una mia chat, la faccio salvare a lei', 'Lasciala com’è, aspetto io'] },
      { domanda: 'La fila delle unioni è ferma da 7 ore per due note del quaderno non salvate. Come vuoi fare?' },
      { domanda: 'Le unioni continuano a scadere e nessun lavoro entra. Faccio unire tutto da uno specialista, saltando la fila del programma?' },
      { domanda: 'L’unione della correzione è rifiutata due volte: ci sono file non salvati. Li salvo io?' },
      { domanda: 'Come procediamo con il lavoro pronto?', scelte: ['Salto la fila e unisco subito', 'Aspetto'] }
    ]
    for (const r of rifiutate) {
      const e = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', r)
      expect(e?.errore, r.domanda).toBe(true)
      expect(e?.testo, r.domanda).toMatch(/gliel’ha già chiesto il programma, tu vai avanti con il resto/)
    }
    expect(a.stato.domande).toHaveLength(0)
    expect(motivoDomandaInutile('La fila delle unioni è ferma: come faccio?')).toBe(MOTIVO_UNIONI_FERME)
    // Le domande che restano sue passano.
    for (const buona of [
      'Con il Drive pieno, le chat vecchie che hanno già una copia sul PC le cancello subito dal Drive, oppure le tengo nel recupero di 30 giorni?',
      'La macchina virtuale di Linux occupa 15 GB di memoria e lascia libero solo il 5%. Posso spegnerla?',
      'Unisco in una sola le due richieste sulla barra delle chat?',
      'Le note del quaderno le tengo anche sul Drive?'
    ]) expect(motivoDomandaInutile(buona), buona).toBeUndefined()
  })

  // 11/11: «La 0.99.3 è pronta… Quando la installi?», con «La installo adesso (consigliata)» e «fra un giorno decido io».
  it('chiedi_utente (11/11): «quando la installi?» non è una domanda, diventa una riga di avviso', async () => {
    const avvisi: string[] = []
    const a = ambiente({ eIlProgramma: () => true, avviso: (_ws, t) => { avvisi.push(t) } })
    const e = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', {
      domanda: 'La 0.99.3 è pronta e una prova conferma che fa ripartire il lavoro. Quando la installi?',
      perche: 'senza l’installazione le correzioni restano fuori',
      scelte: ['La installo adesso → il lavoro riparte', 'Più tardi → resta tutto fermo']
    })
    expect(e?.errore).toBe(true)
    expect(e?.testo).toContain(MOTIVO_INSTALLAZIONE)
    expect(e?.testo).toMatch(/L’ho scritto io a Nicholas come avviso/)
    expect(a.stato.domande).toHaveLength(0)
    expect(avvisi).toEqual(['La 0.99.3 è pronta e una prova conferma che fa ripartire il lavoro. Installala quando vuoi: non serve rispondere, intanto vado avanti con il resto.'])
    // Senza un posto dove scrivere l'avviso lo scrive l'autopilota nel suo messaggio.
    const senza = await chiamaStrumento(ambiente({ eIlProgramma: () => true }), 'Lavoro', 'chiedi_utente', { domanda: 'Installi tu la 0.99.3 su questo PC?' })
    expect(senza?.errore).toBe(true)
    expect(senza?.testo).toMatch(/Scrivi tu una riga di avviso/)
  })

  it('11/11: il filtro sull’installazione vale solo per SierraDeck, e guarda domanda e tasti', () => {
    // Nel progetto SierraDeck basta una versione o la parola «aggiornamento».
    expect(domandaSullInstallazione('Installi tu la 0.80.0 su questo PC?', [], true)).toBe(true)
    expect(domandaSullInstallazione('Will you install the 0.80.0 on this PC?', [], true)).toBe(true)
    expect(domandaSullInstallazione('L’aggiornamento è pronto. Come procediamo?', ['Lo installo adesso', 'Più tardi'], true)).toBe(true)
    // In un altro progetto no, a meno che non si nomini SierraDeck.
    expect(domandaSullInstallazione('Installo la 0.14.0 sul server di prova?', [], false)).toBe(false)
    expect(domandaSullInstallazione('Installo il servizio di copia sul NAS?', [], true)).toBe(false)
    expect(domandaSullInstallazione('Quando installi il nuovo SierraDeck?', [], false)).toBe(true)
    // «Senza installarla» e «non la installo» non sono la richiesta di installare.
    expect(domandaSullInstallazione('Correggo i difetti e pubblico la 0.97.3, senza installarla?', [], true)).toBe(false)
    expect(domandaSullInstallazione('Pubblico la 2.0.0? Non la installo io.', [], true)).toBe(false)
    // Le conseguenze dei tasti non contano: il chiamante passa solo le etichette.
    expect(domandaSullInstallazione('Tengo il tema scuro per la versione nuova?', ['Sì', 'No'], true)).toBe(false)
    // L'avviso: la premessa se c'è, altrimenti la versione, altrimenti una frase generica.
    expect(avvisoInstallazione('Installi tu la 0.80.0 su questo PC?')).toBe('Quando vuoi puoi installare la 0.80.0: non serve rispondere, intanto vado avanti con il resto.')
    expect(avvisoInstallazione('Quando installi l’aggiornamento?')).toBe('Quando vuoi puoi installare la versione nuova di SierraDeck: non serve rispondere, intanto vado avanti con il resto.')
  })

  it('chiedi_utente (11/11): una cosa già successa non si chiede, e l’autopilota lo sa', async () => {
    const a = ambiente({ eIlProgramma: () => true, avviso: () => { throw new Error('nessun avviso per una cosa già fatta') }, giaSuccesso: (_ws, t) => (t.includes('0.80.0') ? 'su questo PC è già installata la 0.80.1' : undefined) })
    const e = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'Installi tu la 0.80.0 su questo PC?' })
    expect(e?.errore).toBe(false)
    expect(e?.testo).toBe('Già fatto: su questo PC è già installata la 0.80.1. Non lo chiedo a Nicholas: vai avanti tenendone conto.')
    expect(a.stato.domande).toHaveLength(0)
    expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'Tengo il colore verde per la barra?', scelte: ['Sì', 'No'] }))?.errore).toBe(false)
    expect(a.stato.domande).toHaveLength(1)
  })

  it('permesso: la risposta è il JSON che la CLI si aspetta', async () => {
    const a = ambiente()
    const si = await chiamaStrumento(a, 'Lavoro', 'permesso', { tool_name: 'WebFetch', input: { url: 'https://example.com' } })
    expect(JSON.parse(si!.testo)).toEqual({ behavior: 'allow', updatedInput: { url: 'https://example.com' } })
    const no = await chiamaStrumento(a, 'Lavoro', 'permesso', { tool_name: 'Bash', input: { command: 'rm -rf x' } })
    expect(JSON.parse(no!.testo)).toEqual({ behavior: 'deny', message: 'no' })
  })

  it('un gettone vale solo per il suo workspace', async () => {
    const g = creaGettoniOrchestratore()
    const a = ambiente()
    const tok = g.di('Lavoro')
    expect(configMcpOrchestratore(47630, 'Lavoro', tok)).toContain('/mcp/orchestratore?ws=Lavoro')
    const corpo = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Lavoro', autorizzazione: `Bearer ${tok}`, corpo })).stato).toBe(200)
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Altro', autorizzazione: `Bearer ${tok}`, corpo })).stato).toBe(401)
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Lavoro', autorizzazione: undefined, corpo })).stato).toBe(401)
  })
})
