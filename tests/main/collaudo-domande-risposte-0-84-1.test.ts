import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { leggiEsitoAltroPc, premiEVerifica, type EsitoAltroPc } from '../../src/main/risposta-verificata'
import { ROTTE_CON_VERIFICA } from '../../src/main/pc-remoto'
import { scelteDiTerminale, tastiPerRisposta, type Scelta } from '@shared/scelte-terminale'
import { domandaPerBattito, raccogliDomande } from '@shared/domande-telefono'
import { conversazioniDomande } from '@shared/domande-conversazioni'
import type { BattitoPc } from '@shared/posta'

/**
 * Collaudo 0.84.1 (c-82, 22/10): domande dalle chat degli altri PC (c-74) e
 * risposte dal riquadro verificate (c-75), provate insieme fra due PC finti
 * con le rotte vere e gli schermi veri di Claude Code 2.1.294.
 *
 * I test «D1»…«D4» erano i difetti trovati (`.fails`): corretti in 0.84.3
 * (c-88), adesso sono test normali. Dettagli e righe:
 * `.sierradeck/quaderno/collaudo-domande-risposte-0-84-1.md`.
 */
const DIR = join(__dirname, '../fixtures/claude-2.1.294-domande')
const schermo = (nome: string): string[] => readFileSync(join(DIR, `${nome}.txt`), 'utf8').split('\n')
const ESC = String.fromCharCode(27)
const pulite = (r: string[]): string[] => r.map((x) => x.replace(new RegExp(ESC + '[[][0-9;]*m', 'g'), '').replace(/\r$/, ''))
const FATTO = ['● Fatto.', '', '❯ ']
const subito = (): Promise<void> => Promise.resolve()
const radice = join(__dirname, '../..')
const sorgente = (p: string): string => readFileSync(join(radice, p), 'utf8')

/**
 * Il PC B, dove lavora la chat: rotte vere con la verifica accesa. Lo schermo
 * di adesso è `righe()`; i tasti arrivati finiscono in `tasti`.
 */
function pcB(righe: () => string[], prende: (invii: number) => boolean): { rotte: ReturnType<typeof rotteClient>; tasti: string[][]; log: string[] } {
  const tasti: string[][] = []
  const log: string[] = []
  const chat: Chat[] = [{ id: 'p-1', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', sessione: 's-prova', codaGrezza: righe(), coda: pulite(righe()) }]
  const rotte = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-collaudo-b-'))),
    chat: () => chat, autopiloti: async () => [], domande: async () => [], workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: () => {}, aggiornamento: () => ({ fase: 'fermo' }),
    tastiAChat: (_id: string, pezzi: string[]) => { tasti.push(pezzi) },
    schermoDi: async () => (prende(tasti.length) ? FATTO : righe()),
    verificaRisposte: { pausa: subito },
    log: (r: string) => { log.push(r) }
  } as unknown as DipendenzeRotte)
  return { rotte, tasti, log }
}

/**
 * Il PC A, dove Nicholas tocca: le rotte vere, e `scegliAltroPc` / `scriviAltroPc`
 * come in `index.ts` (il ponte gira la chiamata a B; un 409 di B diventa
 * `ErroreRemoto` con lo stato e il messaggio di B).
 */
function pcA(b: ReturnType<typeof pcB>, battitoB: BattitoPc): { rotte: ReturnType<typeof rotteClient>; log: string[] } {
  const log: string[] = []
  const ponte = async (percorso: string, corpo: Record<string, unknown>): Promise<EsitoAltroPc | { ok: false; messaggio: string; stato?: number }> => {
    const r = await b.rotte({ metodo: 'POST', percorso, corpo, dispositivo: 'pc-a' })
    if (r.stato !== 200) return { ok: false, messaggio: String((r.corpo as { errore?: string }).errore), stato: r.stato }
    return leggiEsitoAltroPc(r.corpo)
  }
  const rotte = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-collaudo-a-'))),
    chat: () => [], autopiloti: async () => [], domande: async () => [], workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: () => {}, aggiornamento: () => ({ fase: 'fermo' }),
    pcIo: () => 'pc-a',
    pc: async () => [battitoB],
    scegliAltroPc: async (_pc: string, _s: string, opzione: string, libera?: string) => ponte('/api/scegli', { chat: 'p-1', opzione, ...(libera !== undefined ? { testo: libera } : {}) }),
    scriviAltroPc: async (_pc: string, _s: string, testo: string) => ponte('/api/scrivi', { chat: 'p-1', testo }),
    log: (r: string) => { log.push(r) }
  } as unknown as DipendenzeRotte)
  return { rotte, log }
}

/** La chat di B nel battito, come la mette il postino (`index.ts`, `creaPostino`). */
function battitoDi(righe: string[]): BattitoPc {
  const s = scelteDiTerminale(righe.join('\n'))
  return {
    pcId: 'pc-b', nome: 'PC-ESEMPIO', versione: '0.84.1', battito: new Date().toISOString(), cartelle: [],
    chat: [{
      sessione: 's-prova', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', aspetta: false,
      ...domandaPerBattito({ coda: pulite(righe) }, s),
      // Come index.ts: il testo di ogni opzione tagliato a 200 caratteri, con la spiegazione (0.84.3).
      ...(s !== undefined ? { scelte: s.opzioni.map((o) => ({ numero: o.numero, testo: o.testo.slice(0, 200), ...(o.libera === true ? { libera: true } : {}), ...(o.descrizione !== undefined && o.descrizione.trim() !== '' ? { descrizione: o.descrizione.trim().slice(0, 300) } : {}) })) } : {})
    }]
  } as BattitoPc
}

type Conv = { scelte?: { chat: string }; scheda?: { domanda: string; dettagli: { etichetta: string; testo: string }[]; scelte: { testo: string; etichetta?: string }[] } }
async function schedaSuA(a: ReturnType<typeof pcA>): Promise<Conv | undefined> {
  const d = await a.rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
  return (d.corpo as { conversazioni: Conv[] }).conversazioni.find((c) => c.scelte?.chat === 'pc:pc-b:s-prova')
}

describe('collaudo 0.84.1 — dal tocco su A alla chat su B, e ritorno', () => {
  it('la domanda di B arriva su A intera, con le opzioni in italiano; il tocco su «Blu» è premuto da B e A vede «Presa»', async () => {
    const b = pcB(() => schermo('singola'), (n) => n >= 1)
    const a = pcA(b, battitoDi(schermo('singola')))
    const c = await schedaSuA(a)
    expect(c?.scheda?.domanda).toBe('Quale colore preferisci?')
    expect(c?.scheda?.scelte.map((s) => s.etichetta ?? s.testo)).toEqual(['Rosso', 'Verde', 'Blu', 'Scrivo io la risposta', 'Ne parlo nella chat'])
    const r = await a.rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'pc:pc-b:s-prova', opzione: 'Blu' } })
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ fatto: true, esito: 'presa', tentativi: 1, frase: 'Presa: «Blu», la chat è andata avanti.' })
    expect(b.tasti).toHaveLength(1)
    // Registro su B (chi preme) e su A (chi ha chiesto).
    expect(b.log.some((x) => x.includes('«Blu» nella chat «Prova» (p-1)') && x.includes('presa al tentativo 1'))).toBe(true)
    expect(a.log.some((x) => x.includes('alla chat su pc-b: presa là al tentativo 1'))).toBe(true)
  })

  it('B non riesce: riprova una volta da solo, poi A riceve 409 con la frase di B', async () => {
    const b = pcB(() => schermo('singola'), () => false)
    const a = pcA(b, battitoDi(schermo('singola')))
    const r = await a.rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'pc:pc-b:s-prova', opzione: 'Verde' } })
    expect(r.stato).toBe(409)
    expect((r.corpo as { errore: string }).errore).toContain('due volte ma la domanda è ancora lì')
    expect(b.tasti).toHaveLength(2)
    expect(b.log.filter((x) => x.startsWith('[risposta]'))).toHaveLength(4)
  })

  it('una risposta scritta («Scrivo io la risposta») dalla scheda di A arriva libera su B', async () => {
    const b = pcB(() => schermo('singola'), (n) => n >= 1)
    const a = pcA(b, battitoDi(schermo('singola')))
    const r = await a.rotte({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'pc:pc-b:s-prova', testo: 'Arancione' } })
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ esito: 'presa' })
    expect(b.tasti[0]).toContain('Arancione')
  })

  it('il permesso vero: la domanda e il comando da approvare arrivano su A, e «Yes» diventa «Sì»', async () => {
    const b = pcB(() => schermo('permesso'), (n) => n >= 1)
    const a = pcA(b, battitoDi(schermo('permesso')))
    const c = await schedaSuA(a)
    expect(c?.scheda?.domanda).toBe('Do you want to proceed?')
    const dettagli = Object.fromEntries((c?.scheda?.dettagli ?? []).map((d) => [d.etichetta, d.testo]))
    expect(dettagli['La domanda intera']).toContain('This command requires approval')
    expect(dettagli['Prima della domanda']).toContain('node -e "console.log(6*9)"')
    expect(c?.scheda?.scelte.map((s) => s.etichetta ?? s.testo)).toEqual(['Sì', 'No'])
  })

  it('la scelta multipla di B: la domanda c’è e non è l’elenco delle opzioni', () => {
    const t = battitoDi(schermo('multi')).chat[0]!
    expect((t.domanda ?? '').length).toBeGreaterThan(0)
    expect(t.domanda).not.toMatch(/^\s*[❯›>]?\s*1\./m)
  })
})

describe('collaudo 0.84.1 — difetti trovati', () => {
  /**
   * D1. Il battito taglia il testo di ogni opzione a 200 caratteri
   * (`src/main/index.ts:1934`, `o.testo.slice(0, 200)`), ma B confronta il
   * testo toccato con lo schermo intero (`client-rotte.ts:1676`,
   * `o.testo === voluta`). Un permesso lungo («Yes, and don't ask again for
   * … in <cartella>») in una finestra larga non si può mai premere da un
   * altro PC: ogni tocco torna «la scelta e cambiata», per sempre.
   */
  it('D1: un’opzione più lunga di 200 caratteri si può premere da un altro PC', async () => {
    const lunga = `Yes, and don't ask again for node -e commands in ${'C:\\Progetti\\Esempio\\una\\cartella\\molto\\profonda'.repeat(5)}`
    expect(lunga.length).toBeGreaterThan(200)
    // Il riquadro con tre opzioni: Yes, la lunga, No (come lo disegna Claude Code).
    // Nello schermo vero fra «2. » e «No» c'è un colore: si lavora sulla riga com'è.
    const righe = schermo('permesso').flatMap((r) => (/2\. .*No/.test(pulite([r])[0]!) ? [r.replace(`mNo${ESC}`, `m${lunga}${ESC}`),r.replace('2. ', '3. ')] : [r]))
    expect(scelteDiTerminale(righe.join('\n'))?.opzioni.map((o) => o.testo)).toContain(lunga)
    const b = pcB(() => righe, (n) => n >= 1)
    const a = pcA(b, battitoDi(righe))
    const c = await schedaSuA(a)
    const toccata = c?.scheda?.scelte[1]?.testo ?? ''
    const r = await a.rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'pc:pc-b:s-prova', opzione: toccata } })
    expect(r.stato).toBe(200)
  })

  it('D1: la riga che taglia è ancora in index.ts (se sparisce, rivedere D1)', () => {
    expect(sorgente('src/main/index.ts')).toContain('testo: o.testo.slice(0, 200)')
  })

  /**
   * D2. `premiEVerifica` conta il tempo sommando le pause (`passato += ogni`,
   * `risposta-verificata.ts:71`), non con l'orologio: il tempo di ogni
   * lettura dello schermo non si conta. Quando nessuna finestra disegna la
   * chat, `chiediRigheAlleFinestre` aspetta `ATTESA_RIGHE_MS` = 3 s
   * (`index.ts:280`, `:362`) prima di ripiegare sulla foto: 19 letture da
   * 3,2 s fanno ~1 minuto per tentativo, ~2 minuti in tutto. Il ponte di A
   * smette di aspettare dopo 14 s (`pc-remoto.ts:174`) e l'app dopo 15 s:
   * Nicholas legge «non so se è arrivato» mentre B sta ancora premendo.
   */
  it('D2: la verifica finisce entro l’attesa del ponte (14 s) anche se ogni lettura dello schermo è lenta', async () => {
    expect(ROTTE_CON_VERIFICA).toContain('/api/scegli')
    const s = scelteDiTerminale(schermo('singola').join('\n')) as Scelta
    let orologio = 0
    const e = await premiEVerifica(s, {
      leggi: async () => { orologio += 3000; return s },
      tasti: (x) => tastiPerRisposta(x, { tipo: 'opzione', testo: 'Blu' }),
      manda: () => {}, pausa: async (ms) => { orologio += ms }, log: () => {}, cosa: '«Blu»',
      // L'orologio della prova: le letture lente lo fanno avanzare.
      ora: () => orologio
    })
    expect(e.esito).toBe('non-presa')
    expect(orologio).toBeLessThanOrEqual(14_000)
  })

  /**
   * D3. «Nicholas vede l'esito»: PC e pagina mostrano la frase («Presa: …»,
   * «Mandata: … non controlla»), l'app no. `Fatto` in
   * `android/.../ModelliLavoro.kt:342` ha solo `fatto` e `autopilota`:
   * `esito` e `frase` della risposta 200 si perdono. Nell'app si vede solo
   * la «non presa» (come errore, dal 409); una presa e una mandata senza
   * verifica sono uguali.
   */
  it('D3: l’app legge la frase dell’esito dopo un tocco', () => {
    const modelli = sorgente('android/app/src/main/java/it/ferrariconsulenze/sierradeck/ModelliLavoro.kt')
    const da = modelli.indexOf('data class Fatto(')
    expect(modelli.slice(da, modelli.indexOf(')', da) + 1)).toContain('frase')
  })

  /**
   * D4. Le spiegazioni delle opzioni non viaggiano nel battito
   * (`index.ts:1934` passa numero, testo, libera, spuntata, invio: niente
   * `descrizione`). Sullo stesso PC la scheda ha «Le scelte, spiegate»
   * («Rosso — Il colore della passione…»); per la stessa domanda da un altro
   * PC no. Spesso sono proprio le conseguenze della scelta.
   */
  it('D4: la scheda di una domanda di un altro PC ha «Le scelte, spiegate» come quella di questo PC', async () => {
    const b = pcB(() => schermo('singola'), () => true)
    const a = pcA(b, battitoDi(schermo('singola')))
    const c = await schedaSuA(a)
    expect(c?.scheda?.dettagli.map((d) => d.etichetta)).toContain('Le scelte, spiegate')
  })

  it('D4: sullo stesso PC le spiegazioni ci sono (il confronto)', () => {
    const righe = schermo('singola')
    const chat = [{ id: 'p-1', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', codaGrezza: righe, coda: pulite(righe) }]
    const voci = raccogliDomande({ domande: [], autopiloti: [], chat, scelteDi: (_id, r) => scelteDiTerminale(r.join('\n')) })
    const [c] = conversazioniDomande({ voci, autopiloti: [] })
    expect(c?.scheda?.dettagli.map((d) => d.etichetta)).toContain('Le scelte, spiegate')
  })
})
