import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, soloInChat, type DomandaAperta, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria, type Memoria } from '../../src/autopilot-host/memoria'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import {
  chiusaDopoLaDomanda, decisioneDaRicordare, devePassareAlleDomande, domandaRispostaInChat, eRispostaInChat, RISPOSTA_LIBERA_ENTRO_MS, DOMANDA_DECIDO_IO_MS, DOMANDA_IN_CHAT_MS, DOMANDA_VISTA_SENZA_RISPOSTA_MS, domandaRischiosa, richiestaChiusa, scadenzaDomanda, seNonRispondi, richiestaDellaDomanda, rispostaInCoda, rispostaScritta, rispostaSenzaLavoro, scelteDaToccare, scelteProposte
} from '../../src/autopilot-host/domande-in-chat'
import { leggiStatoProgramma } from '../../src/autopilot-host/stato-programma'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { conversazione } from '@shared/chat-autopilota'
import { codaVuota, type Coda, type Richiesta } from '@shared/coda-richieste'
import { attendi } from '../setup/attendi'

/**
 * 0.96.0 (k-45) — le domande dell'autopilota nascono nella sua chat, e passano
 * nelle Domande (con conteggio e notifiche) solo se in 10 minuti nessuno
 * l'ha vista nella chat.
 */

const MIN = 60_000
const INIZIO = Date.parse('2026-11-06T09:00:00.000Z')

describe('quando una domanda passa dalla chat alle Domande (puro)', () => {
  const d = { apertaIl: INIZIO }
  it('mai vista: passa a 10 minuti, non prima', () => {
    expect(DOMANDA_IN_CHAT_MS).toBe(10 * MIN)
    expect(devePassareAlleDomande(d, undefined, INIZIO + 9 * MIN)).toEqual({ passa: false, vista: false })
    expect(devePassareAlleDomande(d, undefined, INIZIO + 10 * MIN)).toEqual({ passa: true, vista: false })
  })
  it('un «visto» di prima che nascesse non conta', () => {
    expect(devePassareAlleDomande(d, INIZIO - MIN, INIZIO + 10 * MIN).vista).toBe(false)
    expect(devePassareAlleDomande(d, INIZIO - MIN, INIZIO + 10 * MIN).passa).toBe(true)
  })
  it('vista ma senza risposta: passa a 30 minuti', () => {
    expect(DOMANDA_VISTA_SENZA_RISPOSTA_MS).toBe(30 * MIN)
    expect(devePassareAlleDomande(d, INIZIO + 2 * MIN, INIZIO + 29 * MIN)).toEqual({ passa: false, vista: true })
    expect(devePassareAlleDomande(d, INIZIO + 2 * MIN, INIZIO + 30 * MIN)).toEqual({ passa: true, vista: true })
  })
})

describe('la risposta scritta e i tasti (puro)', () => {
  const scelte = ['Sì', 'No']
  it('«1» e «2» sono le scelte, il nome vale con ogni maiuscola, il resto è libero', () => {
    expect(rispostaScritta('1', scelte)).toBe('Sì')
    expect(rispostaScritta(' 2. ', scelte)).toBe('No')
    expect(rispostaScritta('no', scelte)).toBe('No')
    expect(rispostaScritta('3', scelte)).toBe('3')
    expect(rispostaScritta('meglio domani', scelte)).toBe('meglio domani')
  })
  // 08/11: uno sfogo registrato come risposta a «Pubblico adesso la 0.97.1?» di tre ore e mezza prima.
  it('11/11: un numero o una scelta è sempre una risposta; un testo libero solo entro mezz’ora dalla domanda', () => {
    expect(RISPOSTA_LIBERA_ENTRO_MS).toBe(30 * MIN)
    const tardi = INIZIO + 3 * 60 * MIN
    expect(eRispostaInChat('1', scelte, INIZIO, tardi)).toBe(true)
    expect(eRispostaInChat(' no ', scelte, INIZIO, tardi)).toBe(true)
    expect(eRispostaInChat('Sì', scelte, INIZIO, tardi)).toBe(true)
    expect(eRispostaInChat('anche negli altri pc gli autopiloti continuano a fermarsi', scelte, INIZIO, tardi)).toBe(false)
    expect(eRispostaInChat('3', scelte, INIZIO, tardi)).toBe(false)
    expect(eRispostaInChat('meglio un verde più scuro', scelte, INIZIO, INIZIO + 29 * MIN)).toBe(true)
    expect(eRispostaInChat('meglio un verde più scuro', scelte, INIZIO, INIZIO + 30 * MIN)).toBe(false)
    expect(eRispostaInChat('un nome a piacere', [], INIZIO, INIZIO + 5 * MIN)).toBe(true)
  })
  // Una domanda rischiosa non scade più: un «1» scritto per la domanda nuova non deve finire a lei.
  it('11/11: fra più domande aperte in chat, un numero o un testo libero rispondono alla più recente; il nome di una scelta alla sua', () => {
    const vecchia = { id: 'd-vecchia', apertaIl: INIZIO, opzioni: ['Cancellale subito', 'Tienile un mese'] }
    const nuova = { id: 'd-nuova', apertaIl: INIZIO + 2 * 60 * MIN, opzioni: ['Sì', 'No'] }
    const adesso = INIZIO + 2 * 60 * MIN + 5 * MIN
    expect(domandaRispostaInChat('1', [vecchia, nuova], adesso)?.id).toBe('d-nuova')
    expect(domandaRispostaInChat('no', [vecchia, nuova], adesso)?.id).toBe('d-nuova')
    expect(domandaRispostaInChat('meglio un verde più scuro', [vecchia, nuova], adesso)?.id).toBe('d-nuova')
    expect(domandaRispostaInChat('tienile un mese', [vecchia, nuova], adesso)?.id).toBe('d-vecchia')
    // Dopo mezz'ora un testo libero non risponde più a nessuna; un numero sì, alla più recente.
    expect(domandaRispostaInChat('a che punto siamo?', [vecchia, nuova], adesso + 40 * MIN)).toBeUndefined()
    expect(domandaRispostaInChat('2', [vecchia, nuova], adesso + 40 * MIN)?.id).toBe('d-nuova')
    expect(domandaRispostaInChat('1', [], adesso)).toBeUndefined()
    // Nate nello stesso istante: vale quella aperta dopo.
    expect(domandaRispostaInChat('1', [{ ...vecchia, apertaIl: INIZIO }, { ...nuova, apertaIl: INIZIO }], INIZIO + MIN)?.id).toBe('d-nuova')
  })
  // 06/11: «Uno specialista chiede il permesso per Monitor: {…}» → Consenti, due volte, nel quaderno.
  it('11/11: fra le decisioni del quaderno non vanno permessi, consensi a cancellare e risposte senza lavoro', () => {
    expect(decisioneDaRicordare({ domanda: 'Le chat sul Drive: le teniamo tutte per sempre o solo quelle recenti?', risposta: 'Solo quelle usate', diConsenso: false })).toBe(true)
    expect(decisioneDaRicordare({ domanda: 'Uno specialista chiede il permesso per Monitor: {"description":"fine attesa 90 s"}. Lo permetto?', risposta: 'Consenti', diConsenso: false })).toBe(false)
    expect(decisioneDaRicordare({ domanda: 'Una chat vuole cancellare questi percorsi', risposta: 'Sì, cancella', diConsenso: true })).toBe(false)
    expect(decisioneDaRicordare({ domanda: 'Tengo il colore verde per la barra?', risposta: 'no', diConsenso: false })).toBe(false)
    expect(decisioneDaRicordare({ domanda: 'Tengo il colore verde per la barra?', risposta: 'Lascia stare', diConsenso: false })).toBe(false)
    expect(decisioneDaRicordare({ domanda: 'Tengo il colore verde per la barra?', risposta: 'No, fai invece il blu', diConsenso: false })).toBe(true)
  })
  it('i tasti sono le scelte, senza il campo «scrivo io»', () => {
    const parti = { staFacendo: 'a', domanda: 'b', perche: 'c', seNonRispondi: 'd', scelte: [{ scelta: 'Sì', conseguenza: 'x' }, { scelta: 'Ti scrivo io cosa provare', conseguenza: '', libera: true as const }] }
    expect(scelteDaToccare({ parti })).toEqual(['Sì'])
    expect(scelteDaToccare({ opzioni: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(scelteDaToccare({})).toEqual([])
  })
})

function richiesta(id: string, over: Partial<Richiesta> = {}): Richiesta {
  return { id, creata: '2026-11-06T08:00:00.000Z', titolo: `titolo ${id}`, testo: `testo ${id}`, originali: [], punti: [], unioni: [], stato: 'in-corso', compiti: [], ...over }
}
const codaCon = (richieste: Richiesta[], compattate: Coda['compattate'] = []): Coda => ({ ...codaVuota('Lavoro'), richieste, compattate })

describe('la richiesta da cui nasce una domanda (puro)', () => {
  it('quella dichiarata, se c’è; poi l’unica citata; poi l’unica aperta; con più candidate nessuna', () => {
    const due = codaCon([richiesta('r-1'), richiesta('r-2')])
    expect(richiestaDellaDomanda(due, 'R-2', 'qualunque cosa')).toBe('r-2')
    expect(richiestaDellaDomanda(due, 'r-9', 'niente')).toBeUndefined()
    expect(richiestaDellaDomanda(due, undefined, 'per la r-1 vuoi il verde?')).toBe('r-1')
    expect(richiestaDellaDomanda(due, undefined, 'tra r-1 e r-2?')).toBeUndefined()
    expect(richiestaDellaDomanda(codaCon([richiesta('r-1'), richiesta('r-2', { stato: 'fatta' })]), undefined, 'verde?')).toBe('r-1')
    expect(richiestaDellaDomanda(codaCon([richiesta('r-1', { chiusa: { come: 'risposta', perche: 'x', il: 'a' } }), richiesta('r-2')]), undefined, 'verde?')).toBe('r-2')
  })
  // 08/11: «Correggo le tre cose…?» legata a un'analisi appena finita, ritirata dopo 0,3 secondi e rifatta.
  it('11/11: una richiesta già chiusa non lega la domanda, né dichiarata né citata', () => {
    const fatta = codaCon([richiesta('r-1', { stato: 'fatta', fattaIl: '2026-11-06T08:30:00.000Z' }), richiesta('r-2')])
    expect(richiestaDellaDomanda(fatta, 'r-1', 'correggo le tre cose?')).toBeUndefined()
    expect(richiestaDellaDomanda(fatta, undefined, 'dopo la r-1, correggo?')).toBeUndefined()
    expect(richiestaDellaDomanda(fatta, 'r-2', 'correggo?')).toBe('r-2')
    const senzaLavoro = codaCon([richiesta('r-1', { chiusa: { come: 'risposta', perche: 'x', il: 'a' } })])
    expect(richiestaDellaDomanda(senzaLavoro, 'r-1', 'e adesso?')).toBeUndefined()
    expect(richiestaDellaDomanda(codaCon([], [{ id: 'r-1', titolo: 't', fattaIl: 'a' }]), 'r-1', 'e adesso?')).toBeUndefined()
  })
  it('11/11: la chiusura conta solo se arriva dopo la domanda; senza data vale dopo', () => {
    const aperta = Date.parse('2026-11-06T09:00:00.000Z')
    expect(chiusaDopoLaDomanda({ il: '2026-11-06T08:40:00.000Z' }, aperta)).toBe(false)
    expect(chiusaDopoLaDomanda({ il: '2026-11-06T09:00:00.000Z' }, aperta)).toBe(true)
    expect(chiusaDopoLaDomanda({ il: '2026-11-06T09:05:00.000Z' }, aperta)).toBe(true)
    expect(chiusaDopoLaDomanda({}, aperta)).toBe(true)
    expect(chiusaDopoLaDomanda({ il: 'non è una data' }, aperta)).toBe(true)
    expect(richiestaChiusa(codaCon([richiesta('r-1', { stato: 'fatta', fattaIl: '2026-11-06T09:05:00.000Z' })]), 'r-1').il).toBe('2026-11-06T09:05:00.000Z')
  })
  it('chiusa se fatta, chiusa senza lavoro, nello storico o unita a una che lo è; ignota o aperta no', () => {
    expect(richiestaChiusa(codaCon([richiesta('r-1')]), 'r-1')).toEqual({ chiusa: false })
    expect(richiestaChiusa(codaCon([richiesta('r-1', { stato: 'fatta' })]), 'r-1')).toMatchObject({ chiusa: true, come: 'fatta' })
    expect(richiestaChiusa(codaCon([richiesta('r-1', { chiusa: { come: 'doppione', perche: 'x', il: 'a' } })]), 'r-1')).toMatchObject({ chiusa: true })
    expect(richiestaChiusa(codaCon([], [{ id: 'r-1', titolo: 't', fattaIl: 'a' }]), 'r-1')).toMatchObject({ chiusa: true })
    expect(richiestaChiusa(codaCon([]), 'r-7')).toEqual({ chiusa: false })
    const unita = richiesta('r-2', { stato: 'fatta', unioni: [{ il: 'a', fonti: ['r-1', 'r-2'], perche: 'x' }] })
    expect(richiestaChiusa(codaCon([unita]), 'r-1')).toMatchObject({ chiusa: true, come: 'unita a r-2, fatta' })
    const apertaUnita = richiesta('r-2', { unioni: [{ il: 'a', fonti: ['r-1', 'r-2'], perche: 'x' }] })
    expect(richiestaChiusa(codaCon([apertaUnita]), 'r-1')).toEqual({ chiusa: false })
  })
})

// 11/11: «un giorno di attesa è troppo se la scelta consigliata non è rischiosa», e «decido io» è
// sbagliato per una cosa che spetta a Nicholas. Le frasi sono domande vere dal 06 all'11/11.
describe('11/11: la scadenza dipende dal rischio (puro)', () => {
  it('rischiosa: cancellare, spegnere, dati sul Drive, pubblicare, installare, soldi, e i fatti che sa solo lui', () => {
    for (const t of [
      'Con il Drive pieno, le chat vecchie le cancello subito dal Drive, oppure le tengo nel recupero di 30 giorni?',
      'La macchina virtuale di Linux occupa 15 GB di memoria. Posso spegnerla?',
      'Linux non ripartiva da solo: lo usa una chat che ci sta lavorando adesso. Lo tolgo lo stesso?',
      'Le chat sul Drive: le teniamo tutte per sempre o solo quelle recenti?',
      'Quando il Drive è pieno, SierraDeck può togliere da solo le versioni vecchie dei suoi file?',
      'Pubblico la versione 2.0.0 adesso?',
      'Compro il certificato per firmare il programma?',
      'Quando il telefono non si è collegato, eri sul wifi di casa o fuori?',
      'Fermo la chat che compila l’altro progetto?'
    ]) expect(domandaRischiosa(t), t).toBe(true)
  })
  it('non rischiosa: una preferenza sul prodotto, che si può sempre cambiare dopo', () => {
    for (const t of [
      'Scheda video: faccio disegnare i terminali con la scheda video e aggiungo nella Salute se è attiva? Sì, tutte e due → terminali con la scheda video Solo la Salute → i terminali restano come sono',
      'Tengo il colore verde per la barra? Sì → verde No → blu',
      'Che nome do alla nuova sezione del menu?',
      'Il menu va a sinistra o a destra?',
      // Parole che somigliano a quelle di rischio ma non lo sono.
      'Lascio il valore costante nella pagina dei driver?'
    ]) expect(domandaRischiosa(t), t).toBe(false)
  })
  it('«Se non rispondi» dice la verità nei due casi, e non promette più «fra un giorno decido io»', () => {
    expect(DOMANDA_DECIDO_IO_MS).toBe(60 * MIN)
    expect(seNonRispondi({ rischiosa: true, consigliata: 'Sì' })).toBe('non decido io al posto tuo: la domanda resta qui finché non rispondi, e intanto porto avanti il resto')
    expect(seNonRispondi({ rischiosa: false, consigliata: 'Sì, tutte e due' })).toBe('intanto porto avanti il resto; se entro un’ora non rispondi scelgo io «Sì, tutte e due» e te lo scrivo')
    expect(seNonRispondi({ rischiosa: false })).toBe('intanto porto avanti il resto; se entro un’ora non rispondi decido io la strada più prudente e te lo scrivo')
  })
  it('cosa fa la scadenza: resta, decide con la consigliata, o chiude dopo un giorno le domande senza il segno', () => {
    const GIORNO = 24 * 60 * MIN
    const parti = { staFacendo: 'a', domanda: 'b?', perche: 'c', seNonRispondi: 'd', scelte: [{ scelta: 'Sì', conseguenza: 'x', consigliata: true }, { scelta: 'No', conseguenza: 'y' }] }
    const con = (contesto: Record<string, unknown> | undefined, altro: Record<string, unknown> = {}): Parameters<typeof scadenzaDomanda>[0] => ({ apertaIl: INIZIO, parti, ...(contesto !== undefined ? { contesto: { autopilotaId: 'ap-1', testo: 't', ...contesto } } : {}), ...altro })
    // Rischiosa e «mai da sola»: mai, nemmeno dopo una settimana.
    expect(scadenzaDomanda(con({ rischiosa: true }), INIZIO + 7 * GIORNO, GIORNO)).toEqual({ cosa: 'resta' })
    expect(scadenzaDomanda(con({ maiDaSola: true }), INIZIO + 7 * GIORNO, GIORNO)).toEqual({ cosa: 'resta' })
    expect(scadenzaDomanda(con({ rischiosa: false, maiDaSola: true }), INIZIO + 7 * GIORNO, GIORNO)).toEqual({ cosa: 'resta' })
    // Non rischiosa: un'ora.
    expect(scadenzaDomanda(con({ rischiosa: false }), INIZIO + 59 * MIN, GIORNO)).toEqual({ cosa: 'resta' })
    expect(scadenzaDomanda(con({ rischiosa: false }), INIZIO + 60 * MIN, GIORNO)).toEqual({ cosa: 'decide', scelta: 'Sì' })
    expect(scadenzaDomanda(con({ rischiosa: false }, { parti: { ...parti, scelte: [] } }), INIZIO + 60 * MIN, GIORNO)).toEqual({ cosa: 'decide' })
    // Senza il segno (di prima dell'11/11, o il consenso a cancellare): un giorno, e si chiude soltanto.
    expect(scadenzaDomanda(con(undefined), INIZIO + 2 * 60 * MIN, GIORNO)).toEqual({ cosa: 'resta' })
    expect(scadenzaDomanda(con(undefined), INIZIO + GIORNO, GIORNO)).toEqual({ cosa: 'chiude' })
    expect(scadenzaDomanda(con({}), INIZIO + GIORNO, GIORNO)).toEqual({ cosa: 'chiude' })
  })
  it('la scelta del programma entra in coda senza dire che ha risposto Nicholas', () => {
    const base: Coda = { ...codaVuota('Lavoro'), prossimo: { r: 10, p: 20 }, richieste: [richiesta('r-1')] }
    const e = rispostaInCoda(base, { domanda: 'Tengo il verde?', risposta: 'Sì', richiestaId: 'r-1', quando: '2026-11-06T10:00:00.000Z', chi: 'programma' })
    expect(e.esito).toBe('punto')
    expect(e.coda.richieste[0]!.punti[0]!.testo).toBe('Scelta consigliata, presa dal programma senza risposta di Nicholas, a «Tengo il verde?»: Sì')
  })
})

describe('il registro: una domanda solo in chat', () => {
  it('non è nelle visibili ma nelle aperte; emerge una volta; chiusa non lascia traccia fra le risolte', () => {
    let ora = INIZIO
    const reg: RegistroDomande = creaRegistroDomande({ adesso: () => ora })
    const chiuse: string[] = []
    reg.suChiusa((d) => { chiuse.push(d.id) })
    const a = reg.apri({ autopilotaId: 'ap-1', testo: 'Verde?', scadenzaMs: 60_000, inChat: true })
    const b = reg.apri({ autopilotaId: 'ap-1', testo: 'Blu?', scadenzaMs: 60_000 })
    expect(soloInChat(a)).toBe(true)
    expect(reg.aperte('ap-1')).toHaveLength(2)
    expect(reg.visibili('ap-1').map((d) => d.id)).toEqual([b.id])
    ora += 10 * MIN
    const e = reg.emergi(a.id, ora) as DomandaAperta
    expect(e.inChat).toEqual({ emersaIl: ora })
    expect(reg.emergi(a.id, ora)).toBeUndefined()
    expect(reg.emergi(b.id, ora)).toBeUndefined()
    expect(reg.visibili('ap-1')).toHaveLength(2)
    // Una mai uscita dalla chat, ritirata: nessuna riga fra le risolte.
    const c = reg.apri({ autopilotaId: 'ap-1', testo: 'Rosso?', scadenzaMs: 60_000, inChat: true })
    expect(reg.superata(c.id, 'non serve più')).toBe(true)
    expect(reg.risolte('ap-1')).toHaveLength(0)
    // Una già uscita, ritirata: sì, resta fra le risolte come prima.
    expect(reg.superata(a.id, 'non serve più')).toBe(true)
    expect(reg.risolte('ap-1')).toHaveLength(1)
    expect(chiuse).toEqual([c.id, a.id])
    // Risposta: avvisa la chiusura.
    expect(reg.rispondi(b.id, 'sì', 'modale')).toBe(true)
    expect(chiuse.at(-1)).toBe(b.id)
  })

  it('lo stato di «solo in chat» sopravvive al riavvio', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ap-dom-chat-')), 'domande.json')
    const r1 = creaRegistroDomande({ adesso: () => INIZIO, file })
    const a = r1.apri({ autopilotaId: 'ap-1', testo: 'Verde?', scadenzaMs: 60_000, inChat: true })
    const r2 = creaRegistroDomande({ adesso: () => INIZIO, file })
    expect(r2.visibili()).toHaveLength(0)
    expect(r2.aperte()).toHaveLength(1)
    r2.emergi(a.id, INIZIO + 1)
    expect(creaRegistroDomande({ adesso: () => INIZIO, file }).visibili()).toHaveLength(1)
  })
})

describe('lo stato del programma porta i workspace visti', () => {
  it('si leggono, si scartano i valori strani', () => {
    const s = leggiStatoProgramma({ letto: 1, workspaceVisti: ['Lavoro', '', 7, 'Altro'] }, 5)
    expect(s?.workspaceVisti).toEqual(['Lavoro', 'Altro'])
    expect(leggiStatoProgramma({ letto: 1 }, 5)?.workspaceVisti).toBeUndefined()
  })
})

// ── Il servizio, con il processo `claude` finto ──

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let archivio: Archivio
let code: ArchivioCode
let orch: ArchivioOrchestratori
let domande: RegistroDomande
let processi: Finto[] = []
let ora = INIZIO
let avvisi: { tipo: string; testo?: string | undefined }[] = []
let memoria: Memoria

const avvia: AvviaProcesso = ({ args }) => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    args, scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

function ap(): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-06T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [] }
}

async function avviaServizio(): Promise<void> {
  ora = INIZIO
  avvisi = []
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-domchat-')))
  archivio.scrivi(ap())
  const cartella = mkdtempSync(join(tmpdir(), 'ap-domchat-orch-'))
  code = apriCode(cartella)
  orch = apriOrchestratori(cartella)
  domande = creaRegistroDomande({ adesso: () => ora })
  processi = []
  memoria = apriMemoria(mkdtempSync(join(tmpdir(), 'ap-domchat-mem-')))
  const s = creaServer({
    archivio,
    memoria,
    versione: '0.96.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: (tipo, _a, testo) => { avvisi.push({ tipo, testo }); return Promise.resolve() },
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(ora).toISOString(),
    coda: code,
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47999,
    raccoltaEventiMs: 5
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const testoScritto = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content
const visibiliNelServizio = async (): Promise<{ id: string }[]> => (await (await fetch(url('/domande'))).json()) as { id: string }[]
const idUnico = (): string => orch.impostazioni('Lavoro').autopilota!

/** Parte l'orchestratore e dà lo strumento MCP per fare domande. */
async function conStrumenti(): Promise<{ mcp: (name: string, args: Record<string, unknown>) => Promise<string>; p0: Finto }> {
  await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'la barra' })
  await attendi(() => processi.length > 0, { cosa: 'processo' })
  const p0 = processi[0]!
  p0.emetti({ type: 'result', result: 'Ok.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  const cfg = JSON.parse(readFileSync(p0.args[p0.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
  const mcp = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const r = await fetch(url('/mcp/orchestratore?ws=Lavoro'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    })
    return JSON.stringify(await r.json())
  }
  return { mcp, p0 }
}

const DOMANDA = { domanda: 'Tengo il colore verde per la barra?', perche: 'cambia il resto', scelte: ['Sì → verde', 'No → blu'] }

describe('una domanda nuova appare nella chat, non nelle Domande', () => {
  it('nella chat: testo, scelte e tasti; fuori: niente nelle Domande, niente notifica', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    expect(await mcp('chiedi_utente', DOMANDA)).toContain('Domanda aperta per Nicholas')

    // Il registro la tiene, ma le Domande (e quindi conteggio, telefono, app) non la vedono.
    expect(domande.aperte(idUnico())).toHaveLength(1)
    expect(await visibiliNelServizio()).toEqual([])
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toEqual([])

    // Nella chat: il messaggio con le scelte nel testo, e i tasti per il PC.
    const riga = archivio.leggi(idUnico())!.dialogo.at(-1)!
    expect(riga.da).toBe('lui')
    expect(riga.testo).toContain('Tengo il colore verde per la barra?')
    expect(riga.testo).toContain('Sì')
    expect(riga.testo).toContain('No')
    expect(riga.domanda?.scelte).toEqual(['Sì', 'No'])
    const battuta = conversazione(archivio.leggi(idUnico())!).find((b) => b.domanda !== undefined)!
    expect(battuta.tono).toBe('domanda')
    expect(battuta.domanda?.scelte).toEqual(['Sì', 'No'])
  })

  // 11/11: prima «i permessi… vanno subito nelle Domande». Adesso un permesso non è mai una domanda:
  // né in chat, né nelle Domande, né una notifica; il programma nega e chi ha chiesto cambia strada.
  it('11/11: un permesso non è una domanda, da nessuna parte: lo nega il programma con il motivo', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    const esito = await mcp('permesso', { tool_name: 'Bash', input: { command: 'rm -rf cartella-importante' } })
    expect(esito).toContain('deny')
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(domande.visibili(idUnico())).toHaveLength(0)
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toHaveLength(0)
    expect(archivio.leggi(idUnico())!.dialogo.some((r) => r.domanda !== undefined)).toBe(false)
  })
})

// 11/11: «(consigliata) (consigliata)» su 6 domande su 13, «⚠ Domanda incompleta anche dopo la riscrittura» su 2.
describe('11/11: il testo della domanda si controlla prima di aprirla', () => {
  const LUNGA = `${'Nel controllo dei PC ho trovato dei piccoli difetti nei messaggi. '.repeat(4)}Li guardo adesso?`

  it('«(consigliata)» scritto anche dal modello non si ripete, né nel testo né nel tasto', async () => {
    expect(scelteProposte(['Sì, tutte e tre (consigliata) → le faccio adesso (consigliata)', 'No → resta com’è'])).toEqual([
      { scelta: 'Sì, tutte e tre', conseguenza: 'le faccio adesso', consigliata: true },
      { scelta: 'No', conseguenza: 'resta com’è' }
    ])
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await mcp('chiedi_utente', { domanda: 'Tengo il colore verde per la barra?', perche: 'cambia il resto', scelte: ['Sì, verde (consigliata) → la barra resta verde (consigliata)', 'No → la faccio blu'] })
    const d = domande.aperte(idUnico())[0]!
    expect(d.testo).toContain('• Sì, verde (consigliata) → la barra resta verde')
    expect(d.testo).not.toMatch(/\(consigliata\).*\(consigliata\)/su)
    expect(scelteDaToccare(d)).toEqual(['Sì, verde', 'No'])
  })

  it('una domanda troppo lunga torna indietro con il motivo; la seconda passa, con l’avvertenza', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    const prima = await mcp('chiedi_utente', { domanda: LUNGA, perche: 'cambia il resto', scelte: ['Sì → li guardo', 'No → restano'] })
    expect(prima).toContain('Rifiutato')
    expect(prima).toContain('la domanda non si capisce abbastanza')
    expect(prima).toContain('in una frase')
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(archivio.leggi(idUnico())!.dialogo.some((r) => r.domanda !== undefined)).toBe(false)
    // Ancora lunga: non si rimanda due volte, una domanda zoppa è meglio di un lavoro fermo.
    const seconda = await mcp('chiedi_utente', { domanda: LUNGA, perche: 'cambia il resto', scelte: ['Sì → li guardo', 'No → restano'] })
    expect(seconda).toContain('Domanda aperta per Nicholas')
    expect(domande.aperte(idUnico())[0]!.testo).toContain('⚠ Domanda incompleta')
  })

  it('riscritta bene dopo il rifiuto: si apre senza avvertenza; e il rifiuto dopo vale di nuovo', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    expect(await mcp('chiedi_utente', { domanda: LUNGA, perche: 'cambia il resto' })).toContain('Rifiutato')
    expect(await mcp('chiedi_utente', DOMANDA)).toContain('Domanda aperta per Nicholas')
    expect(domande.aperte(idUnico())[0]!.testo).not.toContain('⚠')
    expect(domande.aperte(idUnico())[0]!.avvertenza).toBeUndefined()
    expect(await mcp('chiedi_utente', { domanda: 'Faccio come prima anche per il menu?', perche: 'cambia il resto' })).toContain('Rifiutato')
    // «La seconda passa» vale per lo stesso tentativo: dieci minuti dopo un'altra domanda che non va torna indietro.
    ora += 11 * MIN
    expect(await mcp('chiedi_utente', { domanda: LUNGA, perche: 'cambia il resto' })).toContain('Rifiutato')
    expect(domande.aperte(idUnico())).toHaveLength(1)
  })

  it('una risposta libera o scelte senza conseguenza non portano più l’avvertenza a Nicholas', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    expect(await mcp('chiedi_utente', { domanda: 'Che nome do alla nuova sezione del menu?', perche: 'lo vedi ogni giorno' })).toContain('Domanda aperta per Nicholas')
    const d = domande.aperte(idUnico())[0]!
    expect(d.testo).not.toContain('⚠')
    expect(d.avvertenza).toBeUndefined()
  })
})

// 11/11: «La 0.99.3 è pronta… Quando la installi?» con «fra un giorno decido io con la scelta consigliata».
describe('11/11: l’installazione è un avviso, non una domanda', () => {
  const INSTALLA = { domanda: 'La 0.99.3 è pronta e una prova conferma che il lavoro riparte. Quando la installi?', perche: 'senza l’installazione le correzioni restano fuori', scelte: ['La installo adesso → il lavoro riparte', 'Più tardi → resta fermo'] }

  it('nessuna domanda aperta: nella chat resta una riga sola, senza tasti, e non si ripete', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    const esito = await mcp('chiedi_utente', INSTALLA)
    expect(esito).toContain('Rifiutato')
    expect(esito).toContain('L’ho scritto io a Nicholas come avviso')
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toHaveLength(0)
    const righe = (): { testo: string; domanda?: unknown }[] => archivio.leggi(idUnico())!.dialogo.filter((r) => r.da === 'lui' && r.testo.includes('Installala quando vuoi'))
    expect(righe()).toHaveLength(1)
    expect(righe()[0]!.testo).toBe('La 0.99.3 è pronta e una prova conferma che il lavoro riparte. Installala quando vuoi: non serve rispondere, intanto vado avanti con il resto.')
    expect(righe()[0]!.domanda).toBeUndefined()
    await mcp('chiedi_utente', INSTALLA)
    expect(righe()).toHaveLength(1)
    // Non ha consumato il tetto delle domande all'ora.
    expect(orch.impostazioni('Lavoro').domande ?? []).toHaveLength(0)
  })

  it('una versione già installata: «Già fatto», senza domanda e senza avviso', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    // Il servizio di questa prova è alla 0.96.0.
    const esito = await mcp('chiedi_utente', { domanda: 'Installi tu la 0.95.2 su questo PC?', perche: 'serve per chiudere il lavoro' })
    expect(esito).toContain('Già fatto: su questo PC è già installata la 0.96.0')
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(archivio.leggi(idUnico())!.dialogo.some((r) => r.testo.includes('Quando vuoi puoi installare'))).toBe(false)
  })
})

describe('dalla chat alle Domande', () => {
  it('mai vista: prima dei 10 minuti no, dopo sì, con la notifica una volta sola; i tasti restano nella chat', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    ora += 9 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toEqual([])
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toEqual([])

    ora += 1 * MIN
    server!.controllaChatFerme()
    server!.controllaChatFerme()
    const fuori = await visibiliNelServizio()
    expect(fuori).toHaveLength(1)
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toHaveLength(1)
    expect(avvisi.find((v) => v.tipo === 'domanda')?.testo).toContain('colore verde')
    expect(conversazione(archivio.leggi(idUnico())!).some((b) => b.domanda !== undefined)).toBe(true)
  })

  it('vista in chat (PC in primo piano o telefono): resta in chat oltre i 10 minuti, passa a 30', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    // Il programma dice che il workspace è davanti a Nicholas.
    ora += 2 * MIN
    expect((await posta('/stato-programma', { letto: ora, workspaceVisti: ['Lavoro'] })).status).toBe(200)
    ora += 10 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toEqual([])
    ora += 17 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toEqual([])
    ora += 1 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toHaveLength(1)
    expect(avvisi.filter((v) => v.tipo === 'domanda')).toHaveLength(1)
  })

  it('un workspace visto prima che la domanda nascesse non la salva dai 10 minuti', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await posta('/stato-programma', { letto: ora, workspaceVisti: ['Lavoro'] })
    ora += 1 * MIN
    await mcp('chiedi_utente', DOMANDA)
    ora += 10 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toHaveLength(1)
  })

  it('un altro workspace visto non conta', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    await posta('/stato-programma', { letto: ora, workspaceVisti: ['Altro'] })
    ora += 10 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toHaveLength(1)
  })
})

describe('rispondere nella chat vale come risposta', () => {
  it('scrivere «1» risponde con la prima scelta: la domanda si chiude, i tasti spariscono, l’autopilota riceve la risposta, nessuna richiesta nuova', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const richiesteDopoLaDomanda = code.leggi('Lavoro').richieste.length
    const r = await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: '1' })
    expect(r.status).toBe(202)
    expect(domande.aperte(idUnico())).toHaveLength(0)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Risposta alla tua domanda') && testoScritto(x).includes('Sì')), { cosa: 'la risposta arrivata all’autopilota' })
    expect(code.leggi('Lavoro').richieste).toHaveLength(richiesteDopoLaDomanda)
    const a = archivio.leggi(idUnico())!
    expect(a.dialogo.find((x) => x.domanda !== undefined)?.domanda?.chiusa).toBe(true)
    expect(a.dialogo.at(-1)).toMatchObject({ da: 'tu', testo: 'Sì', traccia: true })
    // La domanda non è ripetuta, e senza tasti.
    expect(a.dialogo.filter((x) => x.da === 'lui' && x.testo.includes('colore verde'))).toHaveLength(1)
    expect(conversazione(a).some((b) => b.domanda !== undefined)).toBe(false)
  })

  it('un testo libero è la risposta com’è; senza domande aperte è un messaggio normale (in coda)', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'meglio un verde più scuro' })
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('meglio un verde più scuro')), { cosa: 'risposta libera' })
    expect(domande.aperte(idUnico())).toHaveLength(0)
    const prima = code.leggi('Lavoro').richieste.length
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'poi sistema anche il menu' })
    expect(code.leggi('Lavoro').richieste.length).toBe(prima + 1)
  })

  // 11/11: l'08/11 uno sfogo scritto tre ore e mezza dopo è diventato la «risposta» a «Pubblico adesso la 0.97.1?».
  it('11/11: un testo libero scritto più di mezz’ora dopo è un messaggio nuovo, non la risposta alla domanda vecchia', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const prima = code.leggi('Lavoro').richieste.length
    ora += 31 * MIN
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'anche negli altri pc gli specialisti continuano a fermarsi' })
    // In coda come richiesta sua, con le sue parole; non «Risposta di Nicholas a «Tengo il colore…»».
    const dopo = code.leggi('Lavoro').richieste
    expect(dopo).toHaveLength(prima + 1)
    expect(dopo.at(-1)!.testo).toBe('anche negli altri pc gli specialisti continuano a fermarsi')
    expect(JSON.stringify(dopo)).not.toContain('Risposta di Nicholas a')
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('continuano a fermarsi')), { cosa: 'il messaggio all’autopilota' })
    expect(p0.scritte.some((x) => testoScritto(x).includes('Risposta alla tua domanda'))).toBe(false)
    // La domanda (non rischiosa) si chiude come superata, e l'autopilota lo sa; niente fra le decisioni.
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(p0.scritte.some((x) => testoScritto(x).includes('chiuso una tua domanda aperta'))).toBe(true)
    expect(memoria.decisioni(process.cwd())).toHaveLength(0)
  })

  it('11/11: un numero o una scelta rispondono anche dopo ore, e la risposta va fra le decisioni; un «no» no', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    ora += 3 * 60 * MIN
    // Dopo un'ora una domanda non rischiosa la decide il programma: qui il giro di guardia non è passato.
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: '1' })
    expect(domande.aperte(idUnico())).toHaveLength(0)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Risposta alla tua domanda') && testoScritto(x).includes('Sì')), { cosa: 'la risposta' })
    expect(memoria.decisioni(process.cwd()).map((d) => d.testo)).toEqual(['«Tengo il colore verde per la barra?» → Sì'])
    await mcp('chiedi_utente', { domanda: 'Il menu va a sinistra o a destra?', perche: 'cambia il resto', scelte: ['Sinistra → a sinistra', 'Destra → a destra'] })
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'lascia stare' })
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(memoria.decisioni(process.cwd())).toHaveLength(1)
  })

  it('11/11: una domanda rischiosa resta aperta se Nicholas scrive altro in chat, e l’autopilota sa che c’è', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', { domanda: 'Le copie vecchie le cancello subito o le tengo un mese?', perche: 'sono dati tuoi', scelte: ['Cancellale subito → lo spazio si libera adesso', 'Tienile un mese → lo spazio si libera dopo'] })
    expect(domande.aperte(idUnico())[0]!.contesto?.rischiosa).toBe(true)
    ora += 45 * MIN
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'a che punto siamo con la barra?' })
    expect(domande.aperte(idUnico())).toHaveLength(1)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('a che punto siamo con la barra?') && testoScritto(x).includes('Resta aperta una tua domanda a Nicholas')), { cosa: 'il messaggio con la nota' })
    expect(p0.scritte.some((x) => testoScritto(x).includes('chiuso una tua domanda aperta'))).toBe(false)
    // La scelta scritta per intero vale ancora come risposta.
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'cancellale subito' })
    expect(domande.aperte(idUnico())).toHaveLength(0)
  })

  it('11/11: con una domanda rischiosa aperta da ore, «1» risponde alla domanda nuova e non a lei', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', { domanda: 'Le copie vecchie le cancello subito o le tengo un mese?', perche: 'sono dati tuoi', scelte: ['Cancellale subito → lo spazio si libera adesso', 'Tienile un mese → lo spazio si libera dopo'] })
    const rischiosa = domande.aperte(idUnico())[0]!
    ora += 3 * 60 * MIN
    await mcp('chiedi_utente', DOMANDA)
    expect(domande.aperte(idUnico())).toHaveLength(2)
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: '1' })
    // Chiusa la nuova («Sì»), la cancellazione aspetta ancora la sua risposta.
    expect(domande.aperte(idUnico()).map((d) => d.id)).toEqual([rischiosa.id])
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Risposta alla tua domanda «Tengo il colore verde per la barra?»: Sì')), { cosa: 'la risposta alla domanda nuova' })
    expect(p0.scritte.some((x) => testoScritto(x).includes('Cancellale subito') && testoScritto(x).includes('Risposta alla tua domanda'))).toBe(false)
  })

  it('lo stesso messaggio ripetuto (stesso idMessaggio) non risponde due volte: la seconda domanda resta aperta', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    await mcp('chiedi_utente', { domanda: 'Il menu va a sinistra o a destra?', perche: 'cambia il resto', scelte: ['Sinistra → a sinistra', 'Destra → a destra'] })
    expect(domande.aperte(idUnico())).toHaveLength(2)
    const manda = (): Promise<Response> => posta(`/autopiloti/${idUnico()}/dialogo`, { testo: '1', idMessaggio: 'm-1' })
    expect((await (await manda()).json() as { giaArrivato?: boolean }).giaArrivato).toBeUndefined()
    expect(domande.aperte(idUnico())).toHaveLength(1)
    const ripetuto = await (await manda()).json() as { ricevuto: boolean; giaArrivato?: boolean }
    expect(ripetuto).toMatchObject({ ricevuto: true, giaArrivato: true })
    expect(domande.aperte(idUnico())).toHaveLength(1)
  })

  it('toccare un tasto (la risposta del PC) funziona anche prima che la domanda sia nelle Domande', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const d = domande.aperte(idUnico())[0]!
    expect(soloInChat(d)).toBe(true)
    const r = await posta(`/domande/${d.id}/risposta`, { risposta: 'No', da: 'modale' })
    expect(r.status).toBe(200)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Risposta alla tua domanda') && testoScritto(x).includes('No')), { cosa: 'il tasto' })
    expect(archivio.leggi(idUnico())!.dialogo.find((x) => x.domanda !== undefined)?.domanda?.chiusa).toBe(true)
    // Non resta fra le risolte né nelle Domande: Nicholas non l'ha mai vista lì.
    expect(await visibiliNelServizio()).toEqual([])
  })
})

describe('la richiesta chiusa ritira la domanda', () => {
  const duePerCoda = async (): Promise<void> => {
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo: 'la seconda cosa, un lavoro diverso' })
  }
  // 11/11: la chiusura porta l'ora di adesso (prima «20 minuti fa»): la domanda si ritira solo se la
  // richiesta si chiude dopo che è nata. `quando` serve a provare il caso contrario.
  const chiudi = (id: string, quando: number = ora): void => {
    code.cambia('Lavoro', (c) => ({ coda: { ...c, richieste: c.richieste.map((r) => (r.id === id ? { ...r, stato: 'fatta' as const, fattaIl: new Date(quando).toISOString() } : r)) }, eventi: [] }))
  }

  it('con richiesta dichiarata: fatta lei, la domanda sparisce (ancora in chat: senza traccia fra le risolte) e i tasti vanno via', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await duePerCoda()
    const ids = code.leggi('Lavoro').richieste.map((r) => r.id)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    await mcp('chiedi_utente', { ...DOMANDA, richiesta: ids[0] })
    expect(domande.aperte(idUnico())[0]!.contesto?.richiestaId).toBe(ids[0])

    server!.controllaChatFerme()
    expect(domande.aperte(idUnico())).toHaveLength(1)

    chiudi(ids[0]!)
    server!.controllaChatFerme()
    expect(domande.aperte(idUnico())).toHaveLength(0)
    expect(domande.risolte(idUnico())).toHaveLength(0)
    expect(conversazione(archivio.leggi(idUnico())!).some((b) => b.domanda !== undefined)).toBe(false)
  })

  it('uscita nelle Domande e poi richiesta chiusa: resta fra le risolte, con il motivo', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await duePerCoda()
    const ids = code.leggi('Lavoro').richieste.map((r) => r.id)
    await mcp('chiedi_utente', { ...DOMANDA, richiesta: ids[0] })
    ora += 10 * MIN
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toHaveLength(1)
    chiudi(ids[0]!)
    server!.controllaChatFerme()
    expect(await visibiliNelServizio()).toHaveLength(0)
    expect(domande.risolte(idUnico())[0]?.risposta).toContain(`la richiesta ${ids[0]} è fatta`)
  })

  it('11/11: dichiarata una richiesta già fatta, la domanda nasce senza richiesta e nessuno la ritira', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await duePerCoda()
    const ids = code.leggi('Lavoro').richieste.map((r) => r.id)
    chiudi(ids[0]!, ora - 20 * MIN)
    expect(await mcp('chiedi_utente', { ...DOMANDA, richiesta: ids[0] })).toContain('Domanda aperta per Nicholas')
    expect(domande.aperte(idUnico())[0]!.contesto?.richiestaId).toBeUndefined()
    server!.controllaChatFerme()
    ora += 2 * MIN
    server!.controllaChatFerme()
    expect(domande.aperte(idUnico())).toHaveLength(1)
  })

  it('11/11: una domanda legata (da prima) a una richiesta chiusa prima che nascesse non si ritira', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await duePerCoda()
    const ids = code.leggi('Lavoro').richieste.map((r) => r.id)
    await mcp('chiedi_utente', { ...DOMANDA, richiesta: ids[0] })
    chiudi(ids[0]!, ora - 20 * MIN)
    server!.controllaChatFerme()
    expect(domande.aperte(idUnico())).toHaveLength(1)
  })

  it('senza dichiarazione, con una sola richiesta aperta, la ricava dalla coda', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    const ids = code.leggi('Lavoro').richieste.map((r) => r.id)
    expect(ids).toHaveLength(1)
    await mcp('chiedi_utente', DOMANDA)
    expect(domande.aperte(idUnico())[0]!.contesto?.richiestaId).toBe(ids[0])
  })

  it('con più richieste aperte e nessun indizio, non ne sceglie una a caso', async () => {
    zitto()
    await avviaServizio()
    const { mcp } = await conStrumenti()
    await duePerCoda()
    await mcp('chiedi_utente', DOMANDA)
    expect(domande.aperte(idUnico())[0]!.contesto?.richiestaId).toBeUndefined()
  })
})

describe('la risposta diventa lavoro nella coda (puro, k-64)', () => {
  const Q = '2026-11-06T10:00:00.000Z'
  const base = (r: Richiesta[], compattate: Coda['compattate'] = []): Coda => ({ ...codaVuota('Lavoro'), prossimo: { r: 10, p: 20 }, richieste: r, compattate })
  const dom = 'Tengo il verde?'

  it('richiesta aperta: la risposta è un punto p-N di quella richiesta', () => {
    const e = rispostaInCoda(base([richiesta('r-1')]), { domanda: dom, risposta: 'Sì', richiestaId: 'r-1', quando: Q })
    expect(e).toMatchObject({ esito: 'punto', richiesta: 'r-1', punto: 'p-20' })
    expect(e.coda.richieste).toHaveLength(1)
    expect(e.coda.richieste[0]!.punti[0]).toMatchObject({ id: 'p-20', da: 'r-1', stato: 'aperto' })
    expect(e.coda.richieste[0]!.punti[0]!.testo).toContain('Tengo il verde?')
    expect(e.coda.prossimo.p).toBe(21)
  })
  it('richiesta chiusa senza lavoro: riaperta con il punto', () => {
    const chiusa = richiesta('r-1', { stato: 'fatta', chiusa: { come: 'risposta', perche: 'x', il: 'a' } })
    const e = rispostaInCoda(base([chiusa]), { domanda: dom, risposta: 'Sì', richiestaId: 'r-1', quando: Q })
    expect(e.esito).toBe('riaperta')
    const r = e.coda.richieste[0]!
    expect(r.chiusa).toBeUndefined()
    expect(r.stato).toBe('in-coda')
    expect(r.punti).toHaveLength(1)
  })
  it('richiesta già fatta o nello storico: richiesta nuova, che segue la vecchia', () => {
    const e = rispostaInCoda(base([richiesta('r-1', { stato: 'fatta' })]), { domanda: dom, risposta: 'Sì, fallo', richiestaId: 'r-1', quando: Q })
    expect(e.esito).toBe('nuova')
    expect(e.coda.richieste).toHaveLength(2)
    expect(e.coda.richieste[1]).toMatchObject({ id: 'r-10', segue: 'r-1', stato: 'in-coda' })
    expect(e.coda.richieste[1]!.testo).toContain('Sì, fallo')
    const s = rispostaInCoda(base([], [{ id: 'r-1', titolo: 't', fattaIl: 'a' }]), { domanda: dom, risposta: 'Sì', richiestaId: 'r-1', quando: Q })
    expect(s.esito).toBe('nuova')
  })
  it('domanda senza richiesta: richiesta nuova con domanda e risposta', () => {
    const e = rispostaInCoda(base([]), { domanda: dom, risposta: 'Sì', quando: Q })
    expect(e.esito).toBe('nuova')
    expect(e.coda.richieste[0]!.testo).toBe('Risposta di Nicholas a «Tengo il verde?»: Sì')
    expect(e.coda.richieste[0]!.segue).toBeUndefined()
  })
  it('«no» e «lascia stare» non creano lavoro', () => {
    for (const t of ['No', 'no.', 'Lascia stare', 'no grazie', 'Non serve!', '  ']) {
      const c = base([richiesta('r-1')])
      const e = rispostaInCoda(c, { domanda: dom, risposta: t, richiestaId: 'r-1', quando: Q })
      expect(e.esito).toBe('nota')
      expect(e.coda).toBe(c)
    }
    expect(rispostaSenzaLavoro('No, fai invece il blu')).toBe(false)
    expect(rispostaInCoda(base([]), { domanda: dom, risposta: 'No', quando: Q }).coda.richieste).toHaveLength(0)
  })
  it('la stessa risposta due volte non fa doppioni', () => {
    const a1 = rispostaInCoda(base([richiesta('r-1')]), { domanda: dom, risposta: 'Sì', richiestaId: 'r-1', quando: Q })
    const b1 = rispostaInCoda(a1.coda, { domanda: dom, risposta: 'Sì', richiestaId: 'r-1', quando: Q })
    expect(b1.esito).toBe('niente')
    expect(b1.coda).toBe(a1.coda)
    const a2 = rispostaInCoda(base([]), { domanda: dom, risposta: 'Sì', quando: Q })
    const b2 = rispostaInCoda(a2.coda, { domanda: dom, risposta: 'Sì', quando: Q })
    expect(b2.esito).toBe('niente')
    expect(b2.coda.richieste).toHaveLength(1)
  })
})

describe('la risposta alla domanda entra nella coda (servizio, k-64)', () => {
  it('richiesta aperta: punto in più, nessuna richiesta nuova; l’autopilota lo sa', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const prima = code.leggi('Lavoro').richieste
    const rid = domande.aperte(idUnico())[0]!.contesto?.richiestaId
    expect(rid).toBe(prima[0]!.id)
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: '1' })
    const dopo = code.leggi('Lavoro').richieste
    expect(dopo).toHaveLength(prima.length)
    expect(dopo[0]!.punti.length).toBe(prima[0]!.punti.length + 1)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Registrata come punto')), { cosa: 'la nota all’autopilota' })
  })

  it('richiesta già chiusa (senza lavoro): riaperta, così piano_scrivi la accetta; il doppio arrivo non la tocca due volte', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const rid = domande.aperte(idUnico())[0]!.contesto!.richiestaId!
    code.cambia('Lavoro', (c) => ({ coda: { ...c, richieste: c.richieste.map((r) => (r.id === rid ? { ...r, chiusa: { come: 'risposta' as const, perche: 'x', il: new Date(ora).toISOString() } } : r)) }, eventi: [] }))
    const d = domande.aperte(idUnico())[0]!
    expect((await posta(`/domande/${d.id}/risposta`, { risposta: 'Sì → verde', da: 'modale' })).status).toBe(200)
    const r = code.leggi('Lavoro').richieste.find((x) => x.id === rid)!
    expect(r.chiusa).toBeUndefined()
    expect(r.punti.some((p) => p.testo.includes('Sì → verde'))).toBe(true)
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('l\'ho riaperta')), { cosa: 'riapertura' })
    // Secondo arrivo (telefono, Telegram): la domanda non c'è più, niente di nuovo.
    const n = code.leggi('Lavoro').richieste.length
    const punti = r.punti.length
    await posta(`/domande/${d.id}/risposta`, { risposta: 'Sì → verde', da: 'modale' })
    expect(code.leggi('Lavoro').richieste).toHaveLength(n)
    expect(code.leggi('Lavoro').richieste.find((x) => x.id === rid)!.punti).toHaveLength(punti)
  })

  it('una risposta «No» non crea lavoro', async () => {
    zitto()
    await avviaServizio()
    const { mcp, p0 } = await conStrumenti()
    await mcp('chiedi_utente', DOMANDA)
    const prima = JSON.stringify(code.leggi('Lavoro').richieste)
    await posta(`/autopiloti/${idUnico()}/dialogo`, { testo: 'no' })
    await attendi(() => p0.scritte.some((x) => testoScritto(x).includes('Nessun lavoro')), { cosa: 'nota' })
    expect(JSON.stringify(code.leggi('Lavoro').richieste)).toBe(prima)
  })
})
