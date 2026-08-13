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
    prontoARicevere: () => (partita && parteDavvero ? false : pronto),
    // Nel banco base non c'e' nessuna chat da adottare: quel caso ha i suoi
    // test, che il ponte se lo costruiscono.
    adottabile: () => undefined,
    adotta: () => undefined,
    terminaleDi: (paneId) => Object.values(riquadri).find((r) => r.paneId === paneId)?.ptyId
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
  return { ponte, scritti, aperti, riquadri, dopo, scadi }
}

describe('portare un istruzione dentro una chat', () => {
  it('la scrive nel terminale, con l invio', () => {
    // Lo stesso gesto che fai tu: per la chat i due messaggi sono
    // indistinguibili, ed è la ragione per cui puoi intervenire in mezzo.
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti).toEqual([
      { ptyId: 'pty-1', testo: incollato('continua da dove eri') },
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
      { ptyId: 'pty-9', testo: incollato('continua da dove eri') },
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
    expect(b.scritti.map((x) => x.testo)).toEqual([incollato('continua da dove eri'), INVIO])
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
    expect(b.scritti.map((s) => s.testo)).toEqual([incollato('continua da dove eri'), INVIO])
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
    expect(b.scritti.map((s) => s.testo)).toEqual([incollato('continua da dove eri'), INVIO])
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
    const invii = b.scritti.filter((s) => s.testo === INVIO)
    expect(invii.length).toBeLessThanOrEqual(4)
  })

  it('quando parte, non insiste', () => {
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.scritti.filter((s) => s.testo === INVIO)).toHaveLength(1)
  })
})

describe('la chat che c e gia', () => {
  /** La stessa cartella della consegna di prova, senza doppi sensi di escape. */
  const CARTELLA = consegna().cwd
  const ALTROVE = 'D:\altrove'

  /** Un banco con delle chat gia' aperte, e un ponte che sa adottarle. */
  function bancoConChat(
    aperte: { paneId: string; ptyId?: string; cwd: string; padrone?: string }[],
    riquadri: Record<string, { paneId: string; ptyId?: string }> = {}
  ) {
    const scritti: { ptyId: string; testo: string }[] = []
    const aperti: Consegna[] = []
    const adottati: string[] = []
    const chiesti: { cwd: string; autopilotaId: string; workspace?: string }[] = []
    const rinviati: (() => void)[] = []
    let partita = false
    const ponte: Ponte = {
      riquadroDi: (s) => riquadri[s],
      apri: (c) => { aperti.push(c); riquadri[c.sessionId] = { paneId: 'p-nuovo' }; return 'p-nuovo' },
      scrivi: (ptyId, testo) => { scritti.push({ ptyId, testo }); if (testo === INVIO) partita = true },
      prontoARicevere: () => !partita,
      adottabile: (cwd, autopilotaId, workspace) => {
        chiesti.push({ cwd, autopilotaId, workspace })
        const libera = aperte.find(
          (c) => c.cwd === cwd && (c.padrone === undefined || c.padrone === autopilotaId)
        )
        return libera === undefined
          ? undefined
          : { paneId: libera.paneId, ...(libera.ptyId !== undefined ? { ptyId: libera.ptyId } : {}) }
      },
      adotta: (paneId) => { adottati.push(paneId) },
      terminaleDi: (paneId) => aperte.find((c) => c.paneId === paneId)?.ptyId
    }
    const dopo = (_ms: number, cosa: () => void): void => { rinviati.push(cosa) }
    const scadi = (): void => {
      for (let giro = 0; giro < 10 && rinviati.length > 0; giro += 1) {
        for (const f of rinviati.splice(0, rinviati.length)) f()
      }
    }
    return { ponte, scritti, aperti, adottati, chiesti, riquadri, dopo, scadi }
  }

  it('scrive nella chat gia aperta su quella cartella, invece di aprirne una', () => {
    // «Se attivo l'autopilota non opero io»: quella chat e' sua. Aprirne una
    // nuova accanto lascia due conversazioni da seguire per un lavoro solo, e
    // quella che si stava guardando resta ferma.
    const b = bancoConChat([{ paneId: 'p-1', ptyId: 'pty-1', cwd: CARTELLA }])
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.aperti).toEqual([])
    expect(b.adottati).toEqual(['p-1'])
    expect(b.scritti.map((s) => s.ptyId)).toContain('pty-1')
  })

  it('chi cerca la chat da adottare sa anche dove deve stare', () => {
    // Il criterio era la cartella e basta: due chat sulla stessa cartella in
    // due workspace diversi erano indistinguibili, e l'autopilota si prendeva
    // quella che ti trovavi davanti.
    const b = bancoConChat([{ paneId: 'p-1', ptyId: 'pty-1', cwd: CARTELLA }])
    eseguiConsegna(consegna({ workspace: 'lavoro' }), b.ponte, b.dopo)
    b.scadi()
    expect(b.chiesti[0]?.workspace).toBe('lavoro')
  })

  it('non ruba la chat di un altro autopilota', () => {
    const b = bancoConChat([
      { paneId: 'p-1', ptyId: 'pty-1', cwd: CARTELLA, padrone: 'ap-altro' }
    ])
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(b.aperti.map((c) => c.sessionId)).toEqual(['sess-1'])
    expect(b.adottati).toEqual([])
  })

  it('se non ce n e nessuna su quella cartella, la apre come prima', () => {
    const b = bancoConChat([{ paneId: 'p-9', ptyId: 'pty-9', cwd: 'C:\altrove' }])
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(b.aperti.map((c) => c.cwd)).toEqual([CARTELLA])
    expect(b.adottati).toEqual([])
  })

  it('la sua chat, quando c e gia, viene prima di qualunque adozione', () => {
    const b = bancoConChat(
      [{ paneId: 'p-1', ptyId: 'pty-1', cwd: CARTELLA }],
      { 'sess-1': { paneId: 'p-sua', ptyId: 'pty-sua' } }
    )
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    expect(b.adottati).toEqual([])
    expect(b.scritti.map((s) => s.ptyId)).toContain('pty-sua')
  })
})

describe('la chat adottata deve diventare governata', () => {
  it('la fa rinascere, invece di scriverci dentro e basta', () => {
    // Il difetto trovato sul campo: l'hook che dice all'autopilota «la chat ha
    // finito di rispondere» si attacca **quando il terminale nasce**. Una chat
    // gia' aperta non ce l'ha: il compito arrivava, la chat lavorava, e
    // l'autopilota restava a zero cicli in attesa di un segnale che non
    // sarebbe mai arrivato. Adottare vuol dire far rinascere il terminale con
    // i suoi hook - la conversazione resta, e' su disco.
    const rinati: string[] = []
    const b = banco({ 'sess-1': { paneId: 'p-1', ptyId: 'pty-1' } })
    b.ponte.adottabile = () => ({ paneId: 'p-2', ptyId: 'pty-2' })
    b.ponte.adotta = (paneId) => { rinati.push(paneId) }
    // La sua chat non c'e': si adotta quella aperta.
    delete b.riquadri['sess-1']
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    expect(rinati).toEqual(['p-2'])
  })
})

describe('dopo l adozione, il terminale e un altro', () => {
  it('non scrive in quello che e stato ucciso', () => {
    // Adottare fa rinascere il terminale: quello di prima non c'e' piu, e
    // scriverci dentro manderebbe il compito a un processo morto - in silenzio.
    const b = banco()
    let terminale: string | undefined = 'pty-vecchio'
    b.ponte.adottabile = () => ({ paneId: 'p-2', ptyId: 'pty-vecchio' })
    b.ponte.adotta = () => { terminale = undefined }
    b.ponte.terminaleDi = () => terminale
    eseguiConsegna(consegna(), b.ponte, b.dopo)
    b.scadi()
    // Nessuno scrive: il terminale nuovo non e ancora nato.
    expect(b.scritti).toEqual([])
    // Appena nasce, il compito ci arriva.
    terminale = 'pty-nuovo'
    b.scadi()
    expect(b.scritti.map((s) => s.ptyId)).toContain('pty-nuovo')
    expect(b.scritti.map((s) => s.ptyId)).not.toContain('pty-vecchio')
  })
})

describe('il ponte vero, davanti ai workspace', () => {
  // Lo store contiene i riquadri del workspace che la finestra sta mostrando:
  // se il viaggio verso quello dell'autopilota non e' riuscito, quelle chat
  // sono di un altro posto e non sono sue.
  const conUnaChat = (): void => {
    useLayoutStore.getState().reset()
    useLayoutStore.getState().addPane('C:\progetto', 'La tua')
  }

  it('adotta quando siamo dove il lavoro deve stare', () => {
    conUnaChat()
    const ponte = ponteReale(() => true, () => 'lavoro')
    expect(ponte.adottabile('C:\progetto', 'ap-1', 'lavoro')).toBeDefined()
  })

  it('non adotta niente quando siamo altrove', () => {
    conUnaChat()
    const ponte = ponteReale(() => true, () => 'home')
    expect(ponte.adottabile('C:\progetto', 'ap-1', 'lavoro')).toBeUndefined()
  })

  it('un autopilota che non ha scelto adotta dove sei, come prima', () => {
    conUnaChat()
    const ponte = ponteReale(() => true, () => 'home')
    expect(ponte.adottabile('C:\progetto', 'ap-1', undefined)).toBeDefined()
  })
})
