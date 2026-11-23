import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BufferFlusso, RegistroFlussi, RiceviFlusso, rispostaFlusso, flussoSicuro, FLUSSO_PEZZO_MAX
} from '@shared/flusso-terminale'

/** Un giro: chiede a «quel PC» dal cursore e applica la risposta, come fa il riquadro. */
function giro(b: BufferFlusso, r: RiceviFlusso): string {
  let fuori = ''
  for (let i = 0; i < 100; i++) {
    const p = r.ricevi(rispostaFlusso('chat-1', b, r.dopo))
    if (p.tipo !== 'scrivi') break
    if (p.ripulisci) fuori = ''
    fuori += p.testo
    if (!p.subito) break
  }
  return fuori
}

describe('flusso del terminale remoto: in ordine', () => {
  it('i pezzi arrivano interi e nell’ordine in cui sono usciti', () => {
    const b = new BufferFlusso()
    const r = new RiceviFlusso()
    let visto = ''
    for (const t of ['uno ', 'due ', 'tre ']) {
      b.aggiungi(t)
      visto += giro(b, r)
    }
    expect(visto).toBe('uno due tre ')
    expect(r.dopo).toBe(b.fine)
  })

  it('un’uscita lunga si legge a pezzi, senza buchi né doppioni', () => {
    const b = new BufferFlusso()
    const r = new RiceviFlusso()
    const lungo = 'abcdefghij'.repeat(FLUSSO_PEZZO_MAX / 10 * 2 + 7)
    b.aggiungi(lungo)
    const prima = rispostaFlusso('c', b, 0)
    expect(prima.testo.length).toBe(FLUSSO_PEZZO_MAX)
    expect(prima.altro).toBe(true)
    expect(giro(b, r)).toBe(lungo)
  })

  it('senza niente di nuovo non scrive niente', () => {
    const b = new BufferFlusso()
    const r = new RiceviFlusso()
    b.aggiungi('x')
    giro(b, r)
    expect(r.ricevi(rispostaFlusso('c', b, r.dopo)).tipo).toBe('niente')
  })

  it('un pezzo che non attacca a quello di prima non si scrive fuori ordine', () => {
    const r = new RiceviFlusso()
    const p = r.ricevi({ flusso: true, chat: 'c', da: 50, a: 55, testo: 'xxxxx', salto: false, altro: false })
    expect(p.tipo).toBe('niente')
    expect(r.dopo).toBe(0)
  })
})

describe('flusso del terminale remoto: ripresa dopo la caduta', () => {
  it('dopo un errore di rete riprende dalla stessa posizione, senza ripetere', () => {
    const b = new BufferFlusso()
    const r = new RiceviFlusso()
    b.aggiungi('prima ')
    let visto = giro(b, r)
    const posizione = r.dopo
    // La linea cade: errori di rete, mentre là l’uscita continua.
    expect(r.errore(undefined).tipo).toBe('niente')
    expect(r.errore(502).tipo).toBe('niente')
    b.aggiungi('durante ')
    b.aggiungi('la caduta ')
    expect(r.dopo).toBe(posizione)
    visto += giro(b, r)
    expect(visto).toBe('prima durante la caduta ')
    expect(r.eVecchio).toBe(false)
  })

  it('leggere non cambia niente là: due richieste uguali danno lo stesso pezzo', () => {
    const b = new BufferFlusso()
    b.aggiungi('ciao')
    const fine = b.fine
    expect(rispostaFlusso('c', b, 0)).toEqual(rispostaFlusso('c', b, 0))
    expect(b.fine).toBe(fine)
  })

  it('se là la memoria ha scartato il pezzo che serviva: salto, il terminale si ripulisce e riparte', () => {
    const b = new BufferFlusso(10)
    const r = new RiceviFlusso()
    b.aggiungi('0123456789')
    expect(giro(b, r)).toBe('0123456789')
    b.aggiungi('abcdefghijklmnopqrst') // più della memoria: il vecchio è andato
    const p = r.ricevi(rispostaFlusso('c', b, r.dopo))
    expect(p).toMatchObject({ tipo: 'scrivi', ripulisci: true, testo: 'klmnopqrst' })
    expect(r.dopo).toBe(b.fine)
  })

  it('se quel PC è ripartito da zero (cursore oltre la fine) si riparte dall’inizio', () => {
    const b = new BufferFlusso()
    const r = new RiceviFlusso()
    b.aggiungi('x'.repeat(30))
    giro(b, r)
    const nuovo = new BufferFlusso()
    nuovo.aggiungi('nuovo')
    const p = r.ricevi(rispostaFlusso('c', nuovo, r.dopo))
    expect(p).toMatchObject({ tipo: 'scrivi', ripulisci: true, testo: 'nuovo' })
  })
})

describe('flusso del terminale remoto: limite di memoria', () => {
  it('il buffer non supera mai il limite e tiene gli ultimi caratteri', () => {
    const b = new BufferFlusso(100)
    for (let i = 0; i < 50; i++) b.aggiungi(`riga-${String(i).padStart(3, '0')}\n`)
    expect(b.peso).toBeLessThanOrEqual(100)
    expect(b.fine).toBe(50 * 9)
    expect(b.primo).toBe(b.fine - b.peso)
    expect(b.leggi(b.primo).testo.endsWith('riga-049\n')).toBe(true)
  })

  it('il registro tiene un buffer per terminale e lo toglie all’uscita', () => {
    const reg = new RegistroFlussi(20)
    reg.scrivi('a', 'x'.repeat(50))
    reg.scrivi('b', 'y')
    expect(reg.di('a')?.peso).toBe(20)
    expect(reg.di('b')?.peso).toBe(1)
    reg.togli('a')
    expect(reg.di('a')).toBeUndefined()
  })
})

describe('flusso del terminale remoto: PC vecchio senza flusso', () => {
  it('rotta assente (404, 405, 409, 501): passa a «vecchio» e non chiede più, senza errori', () => {
    for (const stato of [404, 405, 409, 501]) {
      const r = new RiceviFlusso()
      expect(r.errore(stato)).toEqual({ tipo: 'vecchio' })
      expect(r.eVecchio).toBe(true)
      expect(r.ricevi({ flusso: true, chat: 'c', da: 0, a: 1, testo: 'x', salto: false, altro: false })).toEqual({ tipo: 'vecchio' })
    }
  })

  it('una risposta senza il segno del flusso (un PC che risponde altro) è «vecchio», non un errore', () => {
    for (const x of [undefined, null, {}, { fatto: true }, 'ok', { flusso: true }, { flusso: true, testo: 1, da: 0, a: 0 }]) {
      const r = new RiceviFlusso()
      expect(r.ricevi(x)).toEqual({ tipo: 'vecchio' })
    }
    expect(flussoSicuro({ flusso: true, chat: 'c', da: 3, a: 2, testo: '' })).toBeUndefined()
  })

  it('una chat là senza terminale (assente) non scrive niente e non è «vecchio»', () => {
    const r = new RiceviFlusso()
    expect(r.ricevi(rispostaFlusso('c', undefined, 0))).toEqual({ tipo: 'niente' })
    expect(r.eVecchio).toBe(false)
  })

  it('azzera: un’altra chat nel riquadro riparte da zero', () => {
    const r = new RiceviFlusso()
    r.errore(404)
    r.azzera()
    expect(r.eVecchio).toBe(false)
    expect(r.dopo).toBe(0)
  })
})

describe('flusso del terminale remoto: cablaggio', () => {
  const leggi = (p: string): string => readFileSync(p, 'utf8')
  it('la rotta, il ponte, il preload e il riquadro sono collegati', () => {
    const rotte = leggi('src/main/client-rotte.ts')
    expect(rotte).toContain("r.percorso === '/api/flusso'")
    expect(rotte).toMatch(/ROTTE_DENTRO_CHAT = new Set\(\[[^\]]*'\/api\/flusso'/)
    expect(leggi('src/main/index.ts')).toContain("'remoto:flusso'")
    expect(leggi('src/main/index.ts')).toContain('flussoDi: flussoDiSessione')
    expect(leggi('src/preload/index.ts')).toContain("'remoto:flusso'")
    expect(leggi('src/main/ipc.ts')).toContain('flussiPty.scrivi(msg.id, msg.data)')
    expect(leggi('src/renderer/components/RiquadroRemoto.tsx')).toContain('<TerminaleRemoto')
  })
})
