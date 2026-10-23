import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { adessoDi } from '@shared/adesso'
import { rigaTraguardo } from '@shared/chat-autopilota'
import { puntoDi, senzaSigle } from '@shared/punto-autopilota'
import { giroMaiFermo, notaFerma, type VistaMaiFermo } from '../../src/autopilot-host/mai-fermo'

// Collaudo c-96 (23/10) del Punto della 0.84.3 (fatto da c-90): l'autopilota
// unico interlocutore. Le prove passate restano come guardia; i difetti
// trovati sono `it.fails` e quando uno è corretto il suo `.fails` va tolto.
// Scheda: .sierradeck/quaderno/collaudo-punto-0-84-3.md

const MIN = 60_000
const ORA = Date.parse('2026-10-23T12:00:00.000Z')
const fa = (min: number): string => new Date(ORA - min * MIN).toISOString()

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({
  id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, dal: fa(90), ...extra
})

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> & { segniChat?: Record<string, string> } = {}): Autopilota & { segniChat?: Record<string, string>; segniDal?: string } {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: 'La 0.84.3', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', soddisfatto: false }], iniziatoIl: fa(300) }),
    stato: 'lavoro',
    chats,
    segniDal: fa(120),
    segniChat: Object.fromEntries(chats.map((c) => [c.id, fa(1)])),
    ...extra
  }
}

function vista(extra: Partial<VistaMaiFermo> = {}): VistaMaiFermo {
  return { ora: ORA, avvioServizio: ORA - 600 * MIN, ultimoSegnale: () => undefined, inGiudizio: () => false, fermaAlPrompt: () => true, domandeAperte: 0, ...extra }
}

describe('collaudo del Punto: quello che va', () => {
  it('una chat senza ruolo nel Punto non si chiama col suo numero', () => {
    const p = puntoDi(ap([chat('c-14', { compito: 'Il riquadro (c-14)' })]), ORA)
    expect(p.chat[0]?.chi).toBe('Una chat')
    // L'id resta (serve a riconoscere la riga), le parole no.
    const { chat: righe, ...resto } = p
    expect(JSON.stringify([resto, righe.map(({ id: _id, ...r }) => r)])).not.toMatch(/\bc-\d+/)
  })

  it('i compiti veri della lista restano leggibili e senza sigle', () => {
    expect(senzaSigle('Collaudo del gruppo 3: la pagina del telefono')).not.toMatch(/gruppo \d/)
    expect(senzaSigle('Riprendi il lavoro di c-81 sul ramo ap/ap-f1e631f5/c-81')).not.toMatch(/c-\d|ap\//)
    // Le parole normali con un trattino non si toccano.
    expect(senzaSigle('La e-mail e il check-in restano')).toBe('La e-mail e il check-in restano')
  })

  it('la chat ferma da più di 15 minuti mentre la sorella lavora viene ripresa, con la riga e l’azione', () => {
    const a = ap([chat('c-1', { ruolo: 'sviluppo', compito: 'Il menu' }), chat('c-2', { ruolo: 'interfaccia', compito: 'La pagina' })])
    const segni: Record<string, number> = { 'ap-1::c-1': ORA - MIN, 'ap-1::c-2': ORA - 16 * MIN }
    const g = giroMaiFermo(a, vista({ ultimoSegnale: (k) => segni[k] }))
    expect(g?.mosse).toEqual([{ tipo: 'riprendi', chatId: 'c-2', interrompi: false, muta: 16 * MIN }])
    const nota = notaFerma(g!.mosse[0]!)!
    expect(rigaTraguardo(a, { chat: 'c-2', esito: 'ferma', nota })).toBe('Interfaccia («La pagina») è ferma da 16 minuti senza segnali: le riscrivo l’ultima istruzione.')
  })

  it('a 14 minuti non la tocca ancora', () => {
    const a = ap([chat('c-1'), chat('c-2')])
    const segni: Record<string, number> = { 'ap-1::c-1': ORA - MIN, 'ap-1::c-2': ORA - 14 * MIN }
    expect(giroMaiFermo(a, vista({ ultimoSegnale: (k) => segni[k] }))).toBeUndefined()
  })

  it('il Punto dice «Da te» la risposta quando c’è una domanda, e niente quando non serve', () => {
    expect(puntoDi(ap([chat('c-1')]), ORA, { domandeAperte: 2 }).daTe).toEqual(['2 risposte: le domande sono nella linguetta «Domande».'])
    expect(puntoDi(ap([chat('c-1')]), ORA).daTe).toEqual([])
  })
})

describe('collaudo del Punto: i difetti', () => {
  // D1 — Sul PC, nella Panoramica (la vista del workspace con la conversazione
  // dell'autopilota, `WorkspacePanoramica.tsx:215`), il Punto è `senzaChat` e le
  // chat stanno nella sezione «Adesso» (`AdessoAutopilota`, DalVivoAutopilota.tsx:153),
  // che usa `adessoDi` così com'è: una chat senza ruolo si chiama «c-14»
  // (adesso.ts:85), il compito tiene «(c-14)» e il segnale non c'è. Sulla pagina
  // e nell'app invece il Punto ha le chat col segnale: il PC dice meno del telefono.
  it('D1: le righe delle chat che il PC mostra nella Panoramica sono senza sigle', () => {
    const a = ap([chat('c-14', { compito: 'Il riquadro (c-14)', segnale: { tipo: 'bloccata', quando: fa(2), dichiarato: true, motivo: 'manca la chiave' } })])
    const righe = adessoDi(a, ORA).righe
    expect(JSON.stringify(righe.map((r) => [r.chi, r.compito, r.testo]))).not.toMatch(/\bc-\d+/)
  })

  // D2 — Una chat che ha chiuso il turno con «SEGNALE: aspetto c-1» mentre c-1
  // lavora (attesa giusta, dichiarata) è trattata come ferma: a 15 minuti il giro
  // da solo la «riprende» (mai-fermo.ts:192, il filtro guarda solo il silenzio) e
  // la conversazione dice «è ferma da 16 minuti senza segnali». Ogni 15 minuti,
  // finché la sorella lavora. Nel Punto la stessa chat è rossa «nessun segno da
  // 16 min» (adesso.ts:108) con accanto il segnale ambra «aspetta Sviluppo».
  it('D2: chi aspetta una sorella al lavoro non è «ferma» e non si riprende a 15 minuti', () => {
    const a = ap([
      chat('c-1', { ruolo: 'sviluppo', compito: 'Il menu' }),
      chat('c-2', { ruolo: 'collaudo', compito: 'Collaudo del menu', segnale: { tipo: 'aspetto', di: 'c-1', quando: fa(16), dichiarato: true } })
    ], { segniChat: { 'c-1': fa(1), 'c-2': fa(16) } })
    const segni: Record<string, number> = { 'ap-1::c-1': ORA - MIN, 'ap-1::c-2': ORA - 16 * MIN }
    expect(giroMaiFermo(a, vista({ ultimoSegnale: (k) => segni[k] }))).toBeUndefined()
    expect(puntoDi(a, ORA).chat.find((r) => r.id === 'c-2')?.tono).not.toBe('ferma')
  })

  // D3 — `senzaSigle` toglie la sigla ma lascia la frase rotta: «di c-90 e
  // c-91» diventa «di e», «del gruppo 3» diventa «del». Sono compiti veri della
  // lista dei lavori (riga 6: «la Revisione di c-90 e c-91»). Il test di c-90
  // stesso accetta «del gestionale del» (punto-autopilota.test.ts:44).
  it('D3: tolta la sigla, la frase resta italiana (niente «di e», niente «del» in fondo)', () => {
    expect(senzaSigle('La Revisione di c-90 e c-91')).not.toMatch(/\bdi e\b/)
    expect(senzaSigle('Chiudi l’autopilota del gestionale del gruppo 3')).not.toMatch(/\bdel$/)
  })
})
