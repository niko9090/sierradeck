import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DOMANDA_DECIDO_IO_MS, seNonRispondi } from '../../src/autopilot-host/domande-in-chat'
import { campiScadenza, decisaDaDialogo, decisaDaRisolta, DECIDO_IO_MS, rigaDecisa, rigaSeNonRispondi, scadenzaDaTesto, scadenzaDi } from '@shared/scadenza-domanda'
import { SUPERATA } from '@shared/domande-telefono'
import { conversazioniDomande } from '@shared/domande-conversazioni'
import { conversazione } from '@shared/chat-autopilota'
import { domandeScheda } from '@shared/domande-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { haSigle } from '@shared/titoli-in-parole'

const APERTA = Date.parse('2026-11-11T10:00:00.000Z')
const UN_ORA_DOPO = '2026-11-11T11:00:00.000Z'

describe('quando sceglie il programma', () => {
  it('la stessa ora del servizio', () => {
    expect(DECIDO_IO_MS).toBe(DOMANDA_DECIDO_IO_MS)
  })
  it('dal contesto della domanda aperta', () => {
    expect(scadenzaDi({ apertaIl: APERTA, contesto: { rischiosa: false } })).toEqual({ scadeIl: UN_ORA_DOPO, rischiosa: false })
    expect(scadenzaDi({ apertaIl: APERTA, contesto: { rischiosa: true } })).toEqual({ rischiosa: true })
    expect(scadenzaDi({ apertaIl: APERTA, contesto: { rischiosa: false, maiDaSola: true } })).toEqual({ rischiosa: true })
    // Le domande di prima (senza il segno): non si sa, niente campi.
    expect(scadenzaDi({ apertaIl: APERTA })).toEqual({})
    expect(scadenzaDi({ contesto: { rischiosa: false } })).toEqual({ rischiosa: false })
  })
  it('dal testo della domanda in chat: riconosce le frasi del servizio', () => {
    const q = '2026-11-11T10:00:00.000Z'
    expect(scadenzaDaTesto(`Quale?\n\nSe non rispondi: ${seNonRispondi({ rischiosa: true })}`, q)).toEqual({ rischiosa: true })
    expect(scadenzaDaTesto(`Quale?\n\nSe non rispondi: ${seNonRispondi({ rischiosa: false, consigliata: 'Sì' })}`, q)).toEqual({ scadeIl: UN_ORA_DOPO, rischiosa: false })
    expect(scadenzaDaTesto(`Quale?\n\nSe non rispondi: ${seNonRispondi({ rischiosa: false })}`, q)).toEqual({ scadeIl: UN_ORA_DOPO, rischiosa: false })
    expect(scadenzaDaTesto('Quale preferisci?', q)).toEqual({})
  })
  it('campiScadenza mette solo quello che c’è', () => {
    expect(campiScadenza({})).toEqual({})
    expect(campiScadenza({ rischiosa: true })).toEqual({ rischiosa: true })
  })
})

describe('la riga sotto la domanda', () => {
  const ora = APERTA + 20 * 60_000
  it('le parole', () => {
    expect(rigaSeNonRispondi(UN_ORA_DOPO, false, 'Sì', ora)).toBe('Se non rispondi: fra 40 min scelgo io «Sì»')
    expect(rigaSeNonRispondi(UN_ORA_DOPO, false, undefined, ora)).toBe('Se non rispondi: fra 40 min scelgo io la strada più prudente')
    expect(rigaSeNonRispondi(UN_ORA_DOPO, false, 'Sì', APERTA - 30 * 60_000)).toBe('Se non rispondi: fra 2 ore scelgo io «Sì»')
    expect(rigaSeNonRispondi(UN_ORA_DOPO, false, 'Sì', APERTA + 2 * 3_600_000)).toBe('Se non rispondi: scelgo io a momenti «Sì»')
    expect(rigaSeNonRispondi(undefined, true, 'Sì', ora)).toBe('Aspetta te: non scelgo io al posto tuo')
    expect(rigaSeNonRispondi(undefined, undefined, 'Sì', ora)).toBe('')
    expect(rigaSeNonRispondi('non è una data', false, 'Sì', ora)).toBe('')
  })
  it('si può mettere nella pagina così com’è: niente apici inversi, niente barre, niente altre funzioni', () => {
    const src = rigaSeNonRispondi.toString()
    expect(src).not.toContain('`')
    expect(src).not.toContain('\\')
    const f = new Function(`return (${src})`)() as typeof rigaSeNonRispondi
    expect(f(UN_ORA_DOPO, false, 'Sì', ora)).toBe('Se non rispondi: fra 40 min scelgo io «Sì»')
    expect(f(null as never, null as never, null as never, ora)).toBe('')
  })
})

describe('come è finita una domanda', () => {
  const r = (motivo: string): { risposta: string; quando: string } => ({ risposta: `${SUPERATA}${motivo}`, quando: UN_ORA_DOPO })
  it('dalle risolte', () => {
    expect(decisaDaRisolta(r('nessuna risposta in un’ora: scelta la consigliata, «Sì, rifallo»'))).toEqual({ come: 'programma', testo: 'Sì, rifallo', quando: UN_ORA_DOPO })
    expect(decisaDaRisolta(r('nessuna risposta in un’ora: decide l’autopilota, con la strada più prudente'))).toMatchObject({ come: 'programma', testo: 'la strada più prudente' })
    expect(decisaDaRisolta(r('Nicholas ha scritto nel dialogo dopo la domanda'))).toMatchObject({ come: 'tu' })
    expect(decisaDaRisolta(r('ritirata dall’autopilota: la chat ha già trovato la strada'))).toMatchObject({ come: 'ritirata', testo: 'La chat ha già trovato la strada' })
    const sigla = decisaDaRisolta(r('la richiesta r-12 è fatta: non serve più'))
    expect(sigla).toMatchObject({ come: 'ritirata', testo: 'La richiesta è fatta: non serve più' })
    expect(haSigle(sigla.testo)).toBe(false)
    expect(decisaDaRisolta({ risposta: 'Sì, la prima', quando: UN_ORA_DOPO })).toMatchObject({ come: 'programma', testo: 'Sì, la prima' })
  })
  it('dalle righe della chat dopo la domanda', () => {
    const domanda = '«Unico» ti chiede:\n\nRifaccio la pagina da capo?\n\nSe non rispondi: …'
    expect(decisaDaDialogo(domanda, [
      { quando: 'a', da: 'lui', testo: 'Altro' },
      { quando: 'b', da: 'tu', testo: 'Hai risposto a «Altra domanda»: no' },
      { quando: 'c', da: 'tu', testo: 'Hai risposto a «Rifaccio la pagina da capo?»: sì, da capo' }
    ])).toEqual({ come: 'tu', testo: 'sì, da capo', quando: 'c' })
    expect(decisaDaDialogo(domanda, [
      { quando: 'd', da: 'lui', testo: 'Non hai risposto a «Rifaccio la pagina da capo?»: ho scelto «Sì», la scelta consigliata. Se non va bene scrivimelo e cambio strada.' }
    ])).toEqual({ come: 'programma', testo: 'Sì', quando: 'd' })
    expect(decisaDaDialogo(domanda, [])).toBeUndefined()
  })
  it('le righe', () => {
    expect(rigaDecisa({ come: 'programma', testo: 'Sì', quando: '' })).toBe('Ha scelto il programma: Sì')
    expect(rigaDecisa({ come: 'tu', testo: 'no', quando: '' })).toBe('Hai risposto: no')
    expect(rigaDecisa({ come: 'ritirata', testo: 'Non serve più', quando: '' })).toBe('Non serve più')
    expect(rigaDecisa({ come: 'ritirata', testo: 'La chat ha finito', quando: '' })).toBe('Non serve più: La chat ha finito')
  })
  it('le frasi riconosciute sono ancora quelle che scrive il servizio', () => {
    const s = readFileSync('src/autopilot-host/servizio-orchestratore.ts', 'utf8')
    for (const frase of [
      'nessuna risposta in un’ora: scelta la consigliata, «${s.scelta}»',
      'nessuna risposta in un’ora: decide l’autopilota, con la strada più prudente',
      'Nicholas ha scritto nel dialogo dopo la domanda',
      'ritirata dall’autopilota: ${perche}',
      'Hai risposto a «${domanda.slice(0, 200)}»: ${testo}',
      'Non hai risposto a «${domanda.slice(0, 200)}»: ho scelto «${scelta}»'
    ]) expect(s, frase).toContain(frase)
    expect(readFileSync('src/autopilot-host/domande-in-chat.ts', 'utf8')).toContain('non decido io al posto tuo')
  })
})

describe('sulle schede e nelle bolle', () => {
  const ap = (o: Partial<Autopilota> = {}): Autopilota => ({ ...nuovoAutopilota({ id: 'ap-1', nome: 'Unico', obiettivo: 'x', cwd: 'C:\\p', iniziatoIl: '2026-11-11T09:00:00.000Z' }), ...o })
  it('la scheda delle Domande dice quando sceglie il programma', () => {
    const conv = conversazioniDomande({
      voci: [{ tipo: 'autopilota', id: 'd-1', autopilotaId: 'ap-1', autopilota: 'Unico', origine: 'lavoro', testo: 'Quale?', apertaIl: APERTA, opzioni: ['A', 'B'], rischio: { rischiosa: false } }],
      autopiloti: [ap()]
    })
    expect(conv[0]!.scheda).toMatchObject({ scadeIl: UN_ORA_DOPO, rischiosa: false })
  })
  it('la linguetta Domande dell’autopilota anche', () => {
    const d = domandeScheda(ap({ stato: 'attesa' }), [{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Cancello la cartella?', apertaIl: APERTA, contesto: { rischiosa: true } }])
    expect(d[0]!.scheda).toMatchObject({ rischiosa: true })
    expect(d[0]!.scheda!.scadeIl).toBeUndefined()
  })
  it('una domanda decisa dal programma: «Ha scelto il programma: X» e la scheda con `decisa`', () => {
    const conv = conversazioniDomande({
      voci: [{ tipo: 'risolta', autopilotaId: 'ap-1', autopilota: 'Unico', domanda: 'Quale?', risposta: `${SUPERATA}nessuna risposta in un’ora: scelta la consigliata, «A»`, quando: UN_ORA_DOPO }],
      autopiloti: [ap()]
    })
    expect(conv[0]!.messaggi.map((m) => m.testo)).toContain('Ha scelto il programma: A')
    expect(conv[0]!.scheda?.decisa).toEqual({ come: 'programma', testo: 'A', quando: UN_ORA_DOPO })
  })
  it('la bolla in chat: consigliata e scadenza se aperta, come è finita se chiusa', () => {
    const testo = (q: string): string => `«Unico» ti chiede:\n\n${q}\n\nSe non rispondi: ${seNonRispondi({ rischiosa: false, consigliata: 'Sì' })}`
    const a = ap({
      dialogo: [
        { quando: '2026-11-11T10:00:00.000Z', da: 'lui', testo: testo('Rifaccio la pagina?'), domanda: { id: 'd-1', scelte: ['Sì', 'No'] } },
        { quando: '2026-11-11T10:05:00.000Z', da: 'lui', testo: testo('Tengo i colori?'), domanda: { id: 'd-2', scelte: ['Sì', 'No'], chiusa: true } },
        { quando: '2026-11-11T11:05:00.000Z', da: 'lui', testo: 'Non hai risposto a «Tengo i colori?»: ho scelto «Sì», la scelta consigliata. Se non va bene scrivimelo e cambio strada.' }
      ]
    })
    const chat = conversazione(a)
    const aperta = chat.find((b) => b.domanda?.id === 'd-1')
    expect(aperta?.domanda).toEqual({ id: 'd-1', scelte: ['Sì', 'No'], consigliata: 'Sì', scadeIl: UN_ORA_DOPO, rischiosa: false })
    const chiusa = chat.find((b) => b.testo.includes('Tengo i colori?') && b.tono === 'domanda')
    expect(chiusa?.domanda).toBeUndefined()
    expect(chiusa?.decisa).toEqual({ come: 'programma', testo: 'Sì', quando: '2026-11-11T11:05:00.000Z' })
  })
})
