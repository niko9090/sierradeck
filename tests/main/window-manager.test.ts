import { describe, it, expect } from 'vitest'
import { creaRegistro, instradaEventoHost, type Destinatario } from '../../src/main/window-manager'

function finestraFinta(id: number): Destinatario & { ricevuti: { canale: string; msg: unknown }[]; morta: boolean } {
  const stato = {
    id,
    morta: false,
    ricevuti: [] as { canale: string; msg: unknown }[],
    vivo: (): boolean => !stato.morta,
    invia: (canale: string, msg: unknown): void => { stato.ricevuti.push({ canale, msg }) }
  }
  return stato
}

describe('creaRegistro', () => {
  it('instrada un messaggio solo al proprietario del pty', () => {
    const r = creaRegistro()
    const a = finestraFinta(1)
    const b = finestraFinta(2)
    r.collega(a); r.collega(b)
    r.assegna('p1', 1)

    expect(r.inviaAlProprietario('p1', 'pty:evento', { x: 1 })).toBe(true)
    expect(a.ricevuti).toHaveLength(1)
    expect(b.ricevuti).toHaveLength(0)
  })

  it('riferisce il mancato recapito di un pty senza proprietario', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1))
    expect(r.inviaAlProprietario('orfano', 'pty:evento', {})).toBe(false)
  })

  it('non invia a una finestra distrutta e la dimentica', () => {
    const r = creaRegistro()
    const a = finestraFinta(1)
    r.collega(a); r.assegna('p1', 1)
    a.morta = true

    expect(r.inviaAlProprietario('p1', 'pty:evento', {})).toBe(false)
    expect(a.ricevuti).toHaveLength(0)
    // "la dimentica" nel senso osservabile dall'esterno: non compare piu'
    // fra le finestre collegate.
    //
    // Questa asserzione NON pinna `finestre.delete(id)` dentro `viva()`, ed e'
    // stato verificato togliendolo: `finestreCollegate` filtra richiamando
    // `viva()` per ogni chiave, quindi risponde vuoto con o senza la
    // cancellazione. Quella riga e' igiene di memoria senza conseguenza
    // osservabile, e il perche' non sia testata e' scritto accanto a lei in
    // window-manager.ts.
    expect(r.finestreCollegate()).toEqual([])
  })

  it('scollegando una finestra restituisce i pty che erano suoi', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1)); r.collega(finestraFinta(2))
    r.assegna('p1', 1); r.assegna('p2', 1); r.assegna('p3', 2)

    expect(r.scollega(1).sort()).toEqual(['p1', 'p2'])
    // Scollegata: i suoi pty non hanno più proprietario.
    expect(r.proprietarioDi('p1')).toBeUndefined()
    expect(r.proprietarioDi('p3')).toBe(2)
  })

  it('scollegare due volte non restituisce gli stessi pty', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1)); r.assegna('p1', 1)
    expect(r.scollega(1)).toEqual(['p1'])
    // Senza questo, il chiamante ucciderebbe due volte gli stessi pty e il
    // secondo giro produrrebbe errori su id inesistenti.
    expect(r.scollega(1)).toEqual([])
  })

  it('rilascia un singolo pty senza toccare gli altri', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1)); r.assegna('p1', 1); r.assegna('p2', 1)
    r.rilascia('p1')
    expect(r.ptyDi(1)).toEqual(['p2'])
  })

  it('trasferisce un pty a un altra finestra', () => {
    const r = creaRegistro()
    const a = finestraFinta(1); const b = finestraFinta(2)
    r.collega(a); r.collega(b); r.assegna('p1', 1)

    expect(r.trasferisci('p1', 2)).toBe(true)
    expect(r.ptyDi(1)).toEqual([])
    expect(r.ptyDi(2)).toEqual(['p1'])
    r.inviaAlProprietario('p1', 'pty:evento', {})
    expect(b.ricevuti).toHaveLength(1)
    expect(a.ricevuti).toHaveLength(0)
  })

  it('non trasferisce verso una finestra non collegata', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1)); r.assegna('p1', 1)
    expect(r.trasferisci('p1', 99)).toBe(false)
    expect(r.ptyDi(1)).toEqual(['p1'])
  })

  it('assegnare a una finestra non collegata non crea un proprietario fantasma', () => {
    const r = creaRegistro()
    r.assegna('p1', 42)
    expect(r.proprietarioDi('p1')).toBeUndefined()
    // Questa e' l'asserzione che pinna la guardia in `assegna`. `proprietarioDi`
    // da sola non basta: filtra gia' con `viva()`, quindi risponde undefined per
    // una finestra mai collegata a prescindere da cosa abbia fatto `assegna`.
    // `ptyDi` invece non filtra — e deve non filtrare, perche' serve a sapere
    // quali pty chiudere quando una finestra si chiude, momento in cui la
    // finestra puo' gia' essere distrutta. Senza la guardia, qui comparirebbe
    // 'p1' associato a una finestra inesistente.
    expect(r.ptyDi(42)).toEqual([])
  })

  it('invia a tutte le finestre vive', () => {
    const r = creaRegistro()
    const a = finestraFinta(1); const b = finestraFinta(2); const c = finestraFinta(3)
    r.collega(a); r.collega(b); r.collega(c)
    c.morta = true
    r.inviaATutte('sessioni:esito', { ok: true })
    expect(a.ricevuti).toHaveLength(1)
    expect(b.ricevuti).toHaveLength(1)
    expect(c.ricevuti).toHaveLength(0)
  })

  it('salta la finestra esclusa e raggiunge le altre', () => {
    // Serve al cambio di workspace: chi l'ha chiesto ha gia' applicato il
    // cambio, e ricevendo il proprio annuncio lo applicherebbe una seconda
    // volta salvando il layout nuovo sotto il workspace vecchio.
    const r = creaRegistro()
    const a = finestraFinta(1); const b = finestraFinta(2)
    r.collega(a); r.collega(b)
    r.inviaATutteTranne(1, 'workspace:cambiato', { attivo: 'Due' })
    expect(a.ricevuti).toHaveLength(0)
    expect(b.ricevuti).toHaveLength(1)
  })

  it('con un escluso sconosciuto raggiunge tutte le finestre', () => {
    const r = creaRegistro()
    const a = finestraFinta(1)
    r.collega(a)
    r.inviaATutteTranne(99, 'workspace:cambiato', { attivo: 'Due' })
    expect(a.ricevuti).toHaveLength(1)
  })
})

describe('instradaEventoHost', () => {
  it('consegna assente al proprietario PRIMA di rilasciare l associazione', () => {
    const r = creaRegistro()
    const a = finestraFinta(1)
    r.collega(a); r.assegna('p1', 1)

    expect(instradaEventoHost(r, { id: 'p1', kind: 'assente' })).toBe(true)
    // Il riquadro ha ricevuto l'avviso: e' cio' che gli dice di rilanciare.
    expect(a.ricevuti).toHaveLength(1)
    // ...e solo dopo l'associazione e' sparita.
    expect(r.proprietarioDi('p1')).toBeUndefined()
  })

  it('non rilascia l associazione per gli altri eventi', () => {
    const r = creaRegistro()
    r.collega(finestraFinta(1)); r.assegna('p1', 1)
    instradaEventoHost(r, { id: 'p1', kind: 'data', data: 'x' })
    expect(r.proprietarioDi('p1')).toBe(1)
  })

  it('riferisce il mancato recapito di un evento senza proprietario', () => {
    expect(instradaEventoHost(creaRegistro(), { id: 'orfano', kind: 'exit', code: 0 })).toBe(false)
  })
})
