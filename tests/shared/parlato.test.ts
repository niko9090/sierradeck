import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTACCO_MS, ATTESA_DOPO_SVEGLIA_MS, CODA_VOCE_MS, cercaParolaSveglia, comandoParlato, decidiFrase, dopoEventoFinestra, eAllucinazione,
  FINE_SILENZIO_MS, formaSveglia, FRASE_MAX_MS, PASSO_MS, parolaSvegliaValida, passoVad, puoAscoltare, regoleModo, VAD_INIZIO, valutaFrase,
  type FineFrase, type Vad
} from '@shared/parlato'

/**
 * «Parlato» (Nicholas, 13/11): microfono aperto, parola di sveglia, filtro
 * del rumore. Qui le regole pure: parola di sveglia, frasi da tenere, taglio
 * delle frasi, regole dei modi (in Normale niente parte da solo).
 */

describe('parola di sveglia', () => {
  it('riconosce i modi in cui Whisper scrive «Sierra»', () => {
    for (const t of ['Sierra, aggiungi un test.', 'sierra aggiungi un test', 'Siera, aggiungi un test.', 'SIERRA. Aggiungi un test', 'Cierra, aggiungi un test', 'Sierra! Aggiungi un test', 'Sierrà, aggiungi un test']) {
      expect(cercaParolaSveglia(t, 'Sierra')?.resto.toLowerCase().replace(/\.$/u, ''), t).toBe('aggiungi un test')
    }
  })

  it('perdona i riempitivi davanti («Ehi Sierra», «Ok, Sierra»)', () => {
    expect(cercaParolaSveglia('Ehi Sierra, fammi il riassunto', 'Sierra')?.resto).toBe('fammi il riassunto')
    expect(cercaParolaSveglia('Ok, Sierra: ripeti', 'Sierra')?.resto).toBe('ripeti')
  })

  it('unisce «Si, era,» solo se dopo c’è una pausa scritta', () => {
    expect(cercaParolaSveglia('Si, era, aggiungi un controllo', 'Sierra')?.resto).toBe('aggiungi un controllo')
    expect(cercaParolaSveglia('Si era detto che domani si pubblica', 'Sierra')).toBeUndefined()
  })

  it('non si sveglia con frasi qualunque né con la parola in mezzo', () => {
    expect(cercaParolaSveglia('Domani andiamo in Sierra Nevada', 'Sierra')).toBeUndefined()
    expect(cercaParolaSveglia('Guerra e pace è un libro lungo', 'Sierra')).toBeUndefined()
    expect(cercaParolaSveglia('Terra chiama luna', 'Sierra')).toBeUndefined()
    expect(cercaParolaSveglia('', 'Sierra')).toBeUndefined()
  })

  it('funziona con una parola scelta da Nicholas, anche di due parole', () => {
    expect(cercaParolaSveglia('Jarvis, apri il riassunto', 'Jarvis')?.resto).toBe('apri il riassunto')
    expect(cercaParolaSveglia('Ehi Deck, ripeti', 'Ehi Deck')?.resto).toBe('ripeti')
    expect(cercaParolaSveglia('Sierra, ripeti', 'Jarvis')).toBeUndefined()
  })

  it('la forma di confronto unisce doppie e accenti', () => {
    expect(formaSveglia('Sierra')).toBe(formaSveglia('siera'))
    expect(formaSveglia('Sièrra')).toBe('siera')
  })

  it('parole di sveglia accettate', () => {
    expect(parolaSvegliaValida('Sierra')).toBe(true)
    expect(parolaSvegliaValida('Ehi Deck')).toBe(true)
    expect(parolaSvegliaValida('a')).toBe(false)
    expect(parolaSvegliaValida('1234')).toBe(false)
    expect(parolaSvegliaValida('una parola troppo lunga')).toBe(false)
  })
})

describe('cosa fare con una frase trascritta', () => {
  const c = { parola: 'Sierra', adesso: 1_000_000 }

  it('senza parola di sveglia si butta', () => {
    expect(decidiFrase('Hai visto la partita ieri sera?', c)).toEqual({ tipo: 'scarta', motivo: 'senza parola di sveglia' })
  })

  it('con la parola va all’autopilota, con la maiuscola', () => {
    expect(decidiFrase('Sierra, aggiungi un controllo sui salvataggi.', c)).toEqual({ tipo: 'manda', testo: 'Aggiungi un controllo sui salvataggi.' })
  })

  it('la sola parola apre l’attesa; la frase dopo vale anche senza parola, finché dura', () => {
    expect(decidiFrase('Sierra.', c)).toEqual({ tipo: 'sveglia' })
    const svegliaFinoA = c.adesso + ATTESA_DOPO_SVEGLIA_MS
    expect(decidiFrase('pubblica la versione', { ...c, adesso: c.adesso + 3000, svegliaFinoA })).toEqual({ tipo: 'manda', testo: 'Pubblica la versione' })
    expect(decidiFrase('pubblica la versione', { ...c, adesso: svegliaFinoA + 1, svegliaFinoA })).toMatchObject({ tipo: 'scarta' })
  })

  it('i comandi di voce funzionano dopo la parola di sveglia', () => {
    expect(decidiFrase('Sierra, riassunto.', c)).toEqual({ tipo: 'comando', comando: 'riassunto' })
    expect(decidiFrase('Sierra, riassunto generale', c)).toEqual({ tipo: 'comando', comando: 'generale' })
    expect(decidiFrase('Sierra, ripeti.', c)).toEqual({ tipo: 'comando', comando: 'ripeti' })
    expect(decidiFrase('Sierra basta', c)).toEqual({ tipo: 'comando', comando: 'zitto' })
    expect(decidiFrase('Sierra, smetti di ascoltare.', c)).toEqual({ tipo: 'comando', comando: 'spegni' })
    // «fermati» resta un messaggio all'autopilota: ferma il lavoro.
    expect(decidiFrase('Sierra, fermati', c)).toEqual({ tipo: 'manda', testo: 'Fermati' })
  })

  it('le frasi inventate da Whisper sul silenzio si buttano', () => {
    for (const t of ['Sottotitoli creati dalla comunità Amara.org', '[Musica]', '(applausi)', 'Grazie per la visione!', '[BLANK_AUDIO]', '   ']) {
      expect(eAllucinazione(t), t).toBe(true)
      expect(decidiFrase(t, c).tipo, t).toBe('scarta')
    }
    expect(eAllucinazione('Sierra, aggiungi un test')).toBe(false)
    expect(decidiFrase('Sierra, sottotitoli creati dalla comunità Amara.org', c)).toMatchObject({ tipo: 'scarta', motivo: 'allucinazione' })
  })

  it('comandoParlato riconosce «smetti di ascoltare» e lascia il resto ai comandi della voce', () => {
    expect(comandoParlato('spegni il microfono')).toBe('spegni')
    expect(comandoParlato('ripeti per favore')).toBe('ripeti')
    expect(comandoParlato('aggiungi un test')).toBeUndefined()
  })
})

describe('quali frasi si tengono', () => {
  const buona = { parlatoMs: 1200, rmsMedio: 0.08, rumore: 0.01, parlavaLaVoce: false }
  it('tiene una frase vera', () => {
    expect(valutaFrase(buona)).toEqual({ tieni: true })
  })
  it('butta quella sentita mentre parlava SierraDeck', () => {
    expect(valutaFrase({ ...buona, parlavaLaVoce: true })).toEqual({ tieni: false, motivo: 'parlava SierraDeck' })
  })
  it('butta le troppo corte (un colpo, una sillaba)', () => {
    expect(valutaFrase({ ...buona, parlatoMs: 200 })).toEqual({ tieni: false, motivo: 'troppo corta' })
  })
  it('butta le voci lontane e quelle che non si staccano dal rumore', () => {
    expect(valutaFrase({ ...buona, rmsMedio: 0.01 })).toEqual({ tieni: false, motivo: 'troppo piano' })
    expect(valutaFrase({ ...buona, rmsMedio: 0.05, rumore: 0.03 })).toEqual({ tieni: false, motivo: 'solo rumore' })
  })
})

describe('taglio delle frasi (VAD)', () => {
  const giro = (s: Vad, livello: number, ms: number): { s: Vad; eventi: Array<'inizio' | FineFrase> } => {
    const eventi: Array<'inizio' | FineFrase> = []
    for (let t = 0; t < ms; t += PASSO_MS) {
      const r = passoVad(s, livello)
      s = r.stato
      if (r.evento !== undefined) eventi.push(r.evento)
    }
    return { s, eventi }
  }

  it('un colpo più corto dell’attacco non apre una frase', () => {
    const { eventi } = giro(VAD_INIZIO, 0.2, ATTACCO_MS - PASSO_MS)
    expect(eventi).toEqual([])
  })

  it('voce poi silenzio: inizio, poi fine dopo un secondo e mezzo di quiete', () => {
    let { s, eventi } = giro(VAD_INIZIO, 0.001, 2000)
    expect(eventi).toEqual([])
    ;({ s, eventi } = giro(s, 0.1, 1500))
    expect(eventi).toEqual(['inizio'])
    const fine = giro(s, 0.001, FINE_SILENZIO_MS - PASSO_MS)
    expect(fine.eventi).toEqual([])
    const ultimo = passoVad(fine.s, 0.001)
    expect(ultimo.evento).toMatchObject({ motivo: 'silenzio' })
    const f = ultimo.evento as FineFrase
    expect(f.parlatoMs).toBeGreaterThanOrEqual(1400)
    expect(f.rmsMedio).toBeCloseTo(0.1, 2)
    expect(ultimo.stato.fase).toBe('quiete')
  })

  it('una frase che non finisce si chiude comunque a 15 s', () => {
    const { s } = giro(VAD_INIZIO, 0.1, ATTACCO_MS)
    const { eventi } = giro(s, 0.1, FRASE_MAX_MS + 500)
    expect(eventi.find((e) => e !== 'inizio')).toMatchObject({ motivo: 'lunga' })
  })

  it('il rumore di fondo alza la soglia: un ronzio costante non diventa voce', () => {
    // Un ronzio che entra piano: la stima del fondo lo segue e non apre frasi.
    let s = VAD_INIZIO
    const eventi: unknown[] = []
    for (let i = 0; i < 400; i += 1) { const r = passoVad(s, Math.min(0.03, 0.005 + i * 0.0002)); s = r.stato; if (r.evento) eventi.push(r.evento) }
    expect(eventi).toEqual([])
    expect(s.rumore).toBeGreaterThan(0.02)
  })
})

describe('regole dei modi', () => {
  it('in Normale niente parte da solo e il microfono non resta aperto', () => {
    const n = regoleModo('normale')
    expect(n.dettatoParteDaSolo).toBe(false)
    expect(n.microfonoAperto).toBe(false)
    expect(n.serveParolaSveglia).toBe(false)
  })
  it('in Parlato il microfono resta aperto, legge le risposte e vuole la parola di sveglia; il dettato non parte da solo nemmeno qui', () => {
    expect(regoleModo('parlato')).toEqual({ dettatoParteDaSolo: false, microfonoAperto: true, leggeRisposte: true, serveParolaSveglia: true })
  })
  it('si ascolta solo in Parlato, mai mentre parla il programma o subito dopo, mai con la dettatura aperta', () => {
    const base = { modo: 'parlato' as const, voceParla: false, msDaFineVoce: 10_000, dettaturaAperta: false }
    expect(puoAscoltare(base)).toBe(true)
    expect(puoAscoltare({ ...base, modo: 'normale' })).toBe(false)
    expect(puoAscoltare({ ...base, voceParla: true })).toBe(false)
    expect(puoAscoltare({ ...base, msDaFineVoce: CODA_VOCE_MS - 1 })).toBe(false)
    expect(puoAscoltare({ ...base, dettaturaAperta: true })).toBe(false)
  })
  it('la finestra nell’area di notifica spegne, ridotta a icona resta, la chat chiusa spegne', () => {
    expect(dopoEventoFinestra('nascosta')).toBe('spegni')
    expect(dopoEventoFinestra('ridotta')).toBe('resta')
    expect(dopoEventoFinestra('chat-chiusa')).toBe('spegni')
  })
  it('il campo della chat non manda più da solo il testo dettato (niente conto alla rovescia)', () => {
    const campo = readFileSync(join(__dirname, '../../src/renderer/components/CampoChatAutopilota.tsx'), 'utf8')
    expect(campo).not.toMatch(/QUIETE_INVIO_MS|invioDaSolo|mandaRef|Mando fra/u)
    const voce = readFileSync(join(__dirname, '../../src/renderer/voce.ts'), 'utf8')
    expect(voce).not.toMatch(/invioDaSolo:/u)
  })
})
