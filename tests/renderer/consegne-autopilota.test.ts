import { describe, it, expect } from 'vitest'
import { eseguiConsegna, ponteReale, type Consegna, type Ponte } from '../../src/renderer/consegne-autopilota'
import { useLayoutStore } from '../../src/renderer/state/layout'

const INVIO = String.fromCharCode(13)
const APRI = '[200~'
const CHIUDI = '[201~'
/** Il testo com'e' che arriva al terminale: dichiarato come incollato. */
const incollato = (t: string): string => APRI + t + CHIUDI
const CTRL_C = String.fromCharCode(3)

const consegna = (over: Partial<Consegna> = {}): Consegna => ({
  id: 'c-1',
  autopilotaId: 'ap-1',
  chatId: 'ch-1',
  cwd: 'C:\\progetto',
  sessionId: 'sess-1',
  titolo: 'Notte',
  cosa: 'scrivi',
  testo: 'continua da dove eri',
  ...over
})

function banco(
  riquadri: Record<string, { paneId: string; ptyId?: string }> = {},
  pronto = true,
  /** Come nella realta': ricevuto l'invio la chat si mette a lavorare, e
      smette di essere «pronta a ricevere». Con `false` resta ferma, che e' il
      difetto contro cui esiste il ritentativo. */
  parteDavvero = true
) {
  const scritti: { ptyId: string; testo: string }[] = []
  const aperti: Consegna[] = []
  const rinviati: (() => void)[] = []
  let partita = false
  const ponte: Ponte = {
    riquadroDi: (s) => riquadri[s],
    apri: (c) => {
      aperti.push(c)
      // Come nella realtà: il riquadro compare subito, il terminale più tardi.
      riquadri[c.sessionId] = { paneId: 'p-nuovo' }
      return 'p-nuovo'
    },
    scrivi: (ptyId, testo) => {
      scritti.push({ ptyId, testo })
      if (testo === INVIO) partita = true
    },
    // Nel banco il terminale ascolta sempre: quando *non* ascolta lo dice il
    // suo test, in ultime-righe.
    prontoARicevere: () => (partita && parteDavvero ? false : pronto)
  }
  const dopo = (_ms: number, cosa: () => void): void => { rinviati.push(cosa) }
  // Far scadere un'attesa puo' aprirne un'altra - il testo prima, l'invio
  // subito dopo - e vanno eseguite tutte, come farebbe il tempo vero.
  const scadi = (): void => {
    for (let giro = 0; giro < 10 && rinviati.length > 0; giro += 1) {
      const ora = rinviati.splice(0, rinviati.length)
      for (const f of ora) f()
    }
  }
  /** Un giro solo di attese: quelle in coda adesso, non quelle che aprono. */
  const scadiUnGiro = (): void => { for (const f of rinviati.splice(0, rinviati.length)) f() }
  return { ponte, scritti, aperti, riquadri, dopo, scadi, scadiUnGiro }
}

describe('portare un istruzione dentro una chat', () => {
  it('la scrive nel terminale, con l invio', () => {
    // Lo stesso gesto che fai tu: per la chat i due messaggi sono
    // indistinguibili, ed è la ragione per cui puoi intervenire in mezzo.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti).toEqual([
      { ptyId: 'pty-1', testo: 'continua da dove eri' },
      { ptyId: 'pty-1', testo: INVIO }
    ])
    expect(b.aperti).toEqual([])
  })

  it('senza invio il messaggio resterebbe nel campo', () => {
    // È lo stesso inciampo che il Client aveva quando si scriveva dal telefono:
    // la chat ferma, e l'autopilota ad aspettare una risposta mai chiesta.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti[b.scritti.length - 1]?.testo).toBe(INVIO)
  })

  it('se la chat non c e la apre, e scrive quando e nata', () => {
    const b = banco()
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(b.aperti.map((c) => c.sessionId)).toEqual(['sess-1'])
    // Il terminale non è ancora nato: scrivere adesso finirebbe nel vuoto.
    expect(b.scritti).toEqual([])
    b.riquadri['sess-1'] = { paneId: 'p-nuovo', ptyId: 'pty-9' }
    b.scadi()
    expect(b.scritti).toEqual([
      { ptyId: 'pty-9', testo: 'continua da dove eri' },
      { ptyId: 'pty-9', testo: INVIO }
    ])
  })

  it('la apre con la sessione decisa dall autopilota', () => {
    // È ciò che gli permette di scrivere in **quella** conversazione, anche
    // dopo un riavvio: senza, ogni giro ricomincerebbe da capo.
    const b = banco()
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(b.aperti[0]?.sessionId).toBe('sess-1')
    expect(b.aperti[0]?.cwd).toBe('C:\\progetto')
  })

  it('un riquadro che c e ma senza terminale non viene aperto due volte', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(b.aperti).toEqual([])
    b.riquadri['sess-1'] = { paneId: 'p-1', ptyId: 'pty-1' }
    b.scadi()
    // Una consegna sola: il testo e il suo invio, non due messaggi.
    expect(b.scritti.map((x) => x.testo)).toEqual(['continua da dove eri', INVIO])
  })

  it('se la chat non nasce, non scrive nel vuoto', () => {
    const b = banco()
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti).toEqual([])
  })

  it('interrompere e un ctrl+c, non una chiusura', () => {
    // La chat resta lì con dentro tutto il lavoro fatto: fermare un autopilota
    // non deve costare la conversazione.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna({ cosa: 'interrompi', testo: '' }), b.ponte, b.dopo)
    expect(b.scritti).toEqual([{ ptyId: 'pty-1', testo: CTRL_C }])
  })

  it('interrompere una chat che non c e non apre niente', () => {
    const b = banco()
    eseguiConsegna(consegna({ cosa: 'interrompi', testo: '' }), b.ponte, b.dopo)
    expect(b.aperti).toEqual([])
    expect(b.scritti).toEqual([])
  })
})

describe('l invio che non arrivava', () => {
  it('manda il testo e l invio in due volte, non in un blocco solo', () => {
    // Sul campo: tre chat aperte, il compito scritto per intero nel campo di
    // ognuna, e nessuna che partiva. Claude Code riceve un testo che arriva
    // tutto insieme come **incollato**, e dentro un incollaggio l'invio finale
    // e' un altro a capo del testo, non il gesto che manda il messaggio.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna({ testo: 'prima riga\nseconda riga' }), b.ponte, b.dopo)
    // 0.38.2: anche un riquadro vivo aspetta il primo controllo di prontezza.
    expect(b.scritti).toEqual([])
    b.scadiUnGiro()

    // Prima il testo, dichiarato come incollato e senza invio appiccicato.
    expect(b.scritti).toEqual([{ ptyId: 'pty-1', testo: incollato('prima riga\nseconda riga') }])
    // L'invio arriva staccato, quando l'incollaggio e' finito.
    b.scadi()
    expect(b.scritti[1]).toEqual({ ptyId: 'pty-1', testo: INVIO })
  })

  it('anche nella chat che deve ancora nascere', () => {
    const b = banco()
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.riquadri['sess-1'] = { paneId: 'p-nuovo', ptyId: 'pty-9' }
    b.scadi()
    expect(b.scritti.map((s) => s.testo)).toEqual(['continua da dove eri', INVIO])
  })
})

describe('aspettare che la chat sia pronta a ricevere', () => {
  it('non scrive finche il terminale non ascolta', () => {
    // Provato sul campo: scrivere mentre Claude Code si sta ancora disegnando
    // lascia il testo nel campo e perde l'invio. La chat resta ferma con il
    // compito davanti, e l'autopilota aspetta una risposta che nessuno scrive.
    const b = banco({ 'sess-1': { paneId: 'p-1' } }, false)
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.riquadri['sess-1'] = { paneId: 'p-1', ptyId: 'pty-1' }
    b.scadi()
    expect(b.scritti).toEqual([])
  })

  it('appena ascolta, consegna', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti.map((s) => s.testo)).toEqual(['continua da dove eri', INVIO])
  })
})

describe('quando l invio non basta', () => {
  it('se la chat resta ferma, preme di nuovo', () => {
    // Il difetto peggiore visto sul campo: il compito scritto nel campo, la
    // chat ferma, e l'autopilota che aspetta una risposta che nessuno sta
    // scrivendo. Se dopo l'invio la chat e' ancora li' che ascolta, l'invio
    // non e' arrivato dove doveva.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } }, true, false)
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    const invii = b.scritti.filter((s) => s.testo === INVIO)
    expect(invii.length).toBeGreaterThan(1)
  })

  it('ma non all infinito: dopo qualche tentativo lo dice', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } }, true, false)
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    // 0.38.1: quattro invii, poi un secondo modo da solo (altri quattro), poi
    // il guasto nel diario. Mai all'infinito.
    const invii = b.scritti.filter((s) => s.testo === INVIO)
    expect(invii.length).toBeLessThanOrEqual(8)
  })

  it('quando parte, non insiste', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti.filter((s) => s.testo === INVIO)).toHaveLength(1)
  })
})

describe('mai la chat di qualcun altro', () => {
  // Il 13 settembre 2026 il primo mandato dell'autopilota e' finito dentro la
  // chat che Nicholas stava usando nella stessa cartella (sessione
  // ffea9ea8-…): qui si «adottava» la prima chat libera sulla stessa cartella,
  // le si uccideva il terminale e lo si faceva rinascere con gli hook
  // dell'autopilota. Da adesso un autopilota apre **sempre** una chat sua.
  it('con una chat aperta sulla stessa cartella, ne apre comunque una sua', () => {
    const b = banco({ 'sess-di-nicholas': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.aperti.map((c) => c.sessionId)).toEqual(['sess-1'])
    // E nella chat di Nicholas non entra niente.
    expect(b.scritti.map((x) => x.ptyId)).not.toContain('pty-1')
  })

  it('il ponte vero non sa piu adottare: apre e basta', () => {
    useLayoutStore.getState().reset()
    useLayoutStore.getState().addPane('C:\\progetto', 'La tua', undefined, { sessionUuid: 'sess-tua' })
    const ponte = ponteReale(() => true)
    expect((ponte as unknown as Record<string, unknown>).adottabile).toBeUndefined()
    expect(ponte.riquadroDi('sess-1')).toBeUndefined()
    const nuovo = ponte.apri(consegna())
    const riquadro = useLayoutStore.getState().panes[nuovo]
    expect(riquadro?.sessionUuid).toBe('sess-1')
    expect(riquadro?.autopilota).toEqual({ id: 'ap-1', chat: 'ch-1' })
    // La chat che c'era prima e' ancora sua, e non governata.
    const tua = Object.values(useLayoutStore.getState().panes).find((p) => p.sessionUuid === 'sess-tua')
    expect(tua?.autopilota).toBeUndefined()
  })
})

describe('il riquadro trovato diventa governato (0.56.3)', () => {
  // Il difetto del 09/10: la chat aperta a mano e poi affidata a un autopilota
  // riceveva le consegne, ma il riquadro non sapeva di essere governato. Al
  // riavvio claude.exe rinasceva senza l hook di fine turno dell autopilota, e
  // il Gestore non mandava i battiti di quella chat: coda piena, cicli fermi.
  it('la consegna segna il riquadro che trova, e lo scrive nel registro', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    const segnati: Array<{ paneId: string; id: string; chat: string }> = []
    const passi: string[] = []
    b.ponte.governa = (paneId, a) => { segnati.push({ paneId, ...a }); return true }
    b.ponte.registra = (p) => { passi.push(p) }
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(segnati).toEqual([{ paneId: 'p-1', id: 'ap-1', chat: 'ch-1' }])
    expect(passi.some((p) => p.includes('non sapeva di essere governato'))).toBe(true)
  })

  it('non tocca i riquadri che guardano un altro PC, né le consegne senza autopilota', () => {
    const segnati: string[] = []
    const remoto = banco({ 'sess-1': { paneId: 'p-1', remotoSu: 'PC-ESEMPIO' } as { paneId: string } })
    remoto.ponte.governa = (paneId) => { segnati.push(paneId); return true }
    eseguiConsegna(consegna(), remoto.ponte, remoto.dopo)
    const senza = banco({ 'sess-1': { paneId: 'p-2', ptyId: 'pty-2' } })
    senza.ponte.governa = (paneId) => { segnati.push(paneId); return true }
    eseguiConsegna(consegna({ autopilotaId: '', cosa: 'interrompi', testo: '' }), senza.ponte, senza.dopo)
    expect(segnati).toEqual([])
  })

  it('il ponte vero mette il segno nel riquadro una volta sola', () => {
    const paneId = useLayoutStore.getState().addPane('C:\Progetti\Esempio', 'Esempio', undefined, { sessionUuid: 'sess-governa' })
    const ponte = ponteReale(() => true)
    expect(useLayoutStore.getState().panes[paneId]?.autopilota).toBeUndefined()
    expect(ponte.governa?.(paneId, { id: 'ap-1', chat: 'ap-1' })).toBe(true)
    expect(useLayoutStore.getState().panes[paneId]?.autopilota).toEqual({ id: 'ap-1', chat: 'ap-1' })
    expect(ponte.governa?.(paneId, { id: 'ap-1', chat: 'ap-1' })).toBe(false)
    expect(ponte.governa?.('p-che-non-c-e', { id: 'ap-1', chat: 'ap-1' })).toBe(false)
  })
})
