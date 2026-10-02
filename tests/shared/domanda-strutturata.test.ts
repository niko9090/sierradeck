import { describe, it, expect } from 'vitest'
import {
  domandaControllata, leggiParti, partiBloccato, partiDaRisposta, partiNonMisurati, partiPubblica, richiestaRiscrittura,
  sezioniDomanda, testoDomanda, validaDomanda, type PartiDomanda
} from '@shared/domanda-strutturata'

/**
 * 0.41.0, Nicholas (02/10): «le domande che fa l'autopilota spesso non si
 * capisce cosa stia chiedendo». Ogni domanda ha cinque parti, il programma le
 * controlla, e una domanda incompleta torna indietro una volta.
 */
const BUONA: PartiDomanda = {
  staFacendo: 'Sto preparando il rilascio sul server di produzione.',
  domanda: 'Quale chiave SSH uso per il server di produzione?',
  perche: 'Sul server ce ne sono due e non è scritto da nessuna parte quale.',
  scelte: [
    { scelta: 'id_ed25519', conseguenza: 'uso la chiave nuova' },
    { scelta: 'id_rsa', conseguenza: 'uso la chiave dei rilasci di agosto' }
  ],
  seNonRispondi: 'resto fermo: non provo chiavi a caso'
}

describe('la validazione', () => {
  it('una domanda con le cinque parti è completa', () => {
    expect(validaDomanda(BUONA)).toEqual({ completa: true, mancano: [], note: [] })
  })
  it('una stringa sola (com’era prima) manca di tutto il resto', () => {
    const v = validaDomanda(leggiParti('Quale chiave SSH uso?'))
    expect(v.completa).toBe(false)
    expect(v.mancano).toEqual(['staFacendo', 'perche', 'scelte', 'seNonRispondi'])
  })
  it('la domanda va detta in una frase, con il punto interrogativo', () => {
    expect(validaDomanda({ ...BUONA, domanda: 'Dimmi la chiave.' }).note[0]).toContain('punto interrogativo')
    expect(validaDomanda({ ...BUONA, domanda: `${'x'.repeat(450)}?` }).note[0]).toContain('in una frase')
  })
  it('le scelte: almeno due, ognuna con la sua conseguenza', () => {
    expect(validaDomanda({ ...BUONA, scelte: [BUONA.scelte[0]!] }).mancano).toEqual(['scelte'])
    const senza = validaDomanda({ ...BUONA, scelte: BUONA.scelte.map((s) => ({ ...s, conseguenza: '' })) })
    expect(senza.mancano).toEqual(['scelte'])
    expect(senza.note[0]).toContain('cosa succede')
  })
  it('le parti si leggono con i nomi prevedibili, e le scelte possono essere stringhe', () => {
    const p = leggiParti({ contesto: 'Lavoro al login.', domanda: 'Che provider?', motivo: 'serve la chiave', opzioni: ['Google', 'GitHub'], senzaRisposta: 'aspetto' })
    expect(p.staFacendo).toBe('Lavoro al login.')
    expect(p.scelte).toEqual([{ scelta: 'Google', conseguenza: '' }, { scelta: 'GitHub', conseguenza: '' }])
    expect(p.seNonRispondi).toBe('aspetto')
    expect(leggiParti(null).domanda).toBe('')
  })
})

describe('la riscrittura, una volta sola', () => {
  it('incompleta: chiede di riscriverla dicendo cosa manca; la seconda, completa, vince', async () => {
    const richieste: string[] = []
    const r = await domandaControllata('Caccia bug', leggiParti('Quale chiave SSH uso?'), async (q) => { richieste.push(q); return JSON.stringify(BUONA) }, partiDaRisposta)
    expect(richieste).toHaveLength(1)
    expect(richieste[0]).toContain('cosa stai facendo adesso')
    expect(richieste[0]).toContain('Riscrivila completa')
    expect(r.riscritta).toBe(true)
    expect(r.avvertenza).toBeUndefined()
    expect(r.opzioni).toEqual(['id_ed25519', 'id_rsa'])
  })
  it('ancora incompleta dopo la riscrittura: passa con l’avvertenza, e non si chiede una seconda volta', async () => {
    let volte = 0
    const r = await domandaControllata('Caccia bug', leggiParti('Quale chiave SSH uso?'), async () => { volte += 1; return '{"domanda": "Quale chiave SSH uso?"}' }, partiDaRisposta)
    expect(volte).toBe(1)
    expect(r.avvertenza).toContain('Domanda incompleta')
    expect(r.testo).toContain('⚠ Domanda incompleta')
  })
  it('una riscrittura peggiore (o illeggibile) non sostituisce la prima', async () => {
    const prima = { ...BUONA, seNonRispondi: '' }
    const r = await domandaControllata('X', prima, async () => 'non ho capito', partiDaRisposta)
    expect(r.riscritta).toBe(false)
    expect(r.parti.domanda).toBe(BUONA.domanda)
  })
  it('completa: nessuna riscrittura', async () => {
    let volte = 0
    await domandaControllata('X', BUONA, async () => { volte += 1; return '' }, partiDaRisposta)
    expect(volte).toBe(0)
  })
  it('la richiesta riporta la domanda com’era e la forma giusta', () => {
    const q = richiestaRiscrittura(leggiParti('Che faccio?'), validaDomanda(leggiParti('Che faccio?')))
    expect(q).toContain('"domanda":"Che faccio?"')
    expect(q).toContain('"seNonRispondi"')
  })
  it('la risposta del modello: l’oggetto può essere la domanda o contenerla', () => {
    expect(partiDaRisposta(`ecco: ${JSON.stringify({ domanda: BUONA })}`)?.scelte).toHaveLength(2)
    expect(partiDaRisposta(JSON.stringify(BUONA))?.domanda).toBe(BUONA.domanda)
    expect(partiDaRisposta('niente')).toBeUndefined()
  })
})

describe('il testo e le sezioni, in ordine', () => {
  it('prima chi chiede e la domanda, poi contesto, perché, scelte con conseguenze, se non rispondi', () => {
    const t = testoDomanda('Caccia bug', BUONA)
    const ordine = ['«Caccia bug» ti chiede:', 'Quale chiave SSH', 'Cosa sta facendo:', 'Perché gli serve:', 'Le scelte:', '• id_rsa → uso la chiave dei rilasci di agosto', 'Se non rispondi:']
    const posti = ordine.map((x) => t.indexOf(x))
    expect(posti.every((p) => p >= 0)).toBe(true)
    expect([...posti].sort((a, b) => a - b)).toEqual(posti)
  })
  it('le sezioni per il PC: solo quelle che ci sono, e l’avvertenza in fondo', () => {
    expect(sezioniDomanda(BUONA).map((s) => s.tipo)).toEqual(['domanda', 'testo', 'testo', 'scelte', 'testo'])
    expect(sezioniDomanda(leggiParti('Solo questo?'), 'manca il resto').map((s) => s.tipo)).toEqual(['domanda', 'avvertenza'])
  })
})

describe('le domande scritte dal programma sono complete', () => {
  it('«sono bloccato», i criteri non misurati, «Pubblico adesso?»', () => {
    expect(validaDomanda(partiBloccato('Fai passare i test', 6, ['dividi', 'ricomincia'], 'npm test: 3 falliti')).completa).toBe(true)
    expect(validaDomanda(partiNonMisurati([{ descrizione: 'i test passano', comando: 'npm tst' }])).completa).toBe(true)
    const pub = partiPubblica('SierraDeck', true)
    expect(validaDomanda(pub).completa).toBe(true)
    // Le scelte restano quelle di prima: «sì, pubblica» è ancora un sì.
    expect(pub.scelte.map((s) => s.scelta)).toEqual(['sì, pubblica', 'no, lascia così'])
    expect(testoDomanda('SierraDeck', pub)).toMatch(/Pubblico adesso\?/)
  })
})
