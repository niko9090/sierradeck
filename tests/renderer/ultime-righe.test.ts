import { describe, it, expect } from 'vitest'
import {
  chatAspetta, creaUltimeRighe, senzaColori, terminalePronto, ultimaRigaUtile, ultimaRigaDalloSchermo
} from '../../src/renderer/ultime-righe'

const ESC = String.fromCharCode(27)

describe('senzaColori', () => {
  it('toglie i codici di colore', () => {
    // Mostrati come sono, riempirebbero lo schermo del telefono di parentesi
    // quadre e numeri, e la riga che conta sparirebbe nel rumore.
    expect(senzaColori(`${ESC}[31mrosso${ESC}[0m`)).toBe('rosso')
  })

  it('lascia stare il testo normale', () => {
    expect(senzaColori('una riga qualunque')).toBe('una riga qualunque')
  })

  it('toglie anche le sequenze private e quelle con i due punti', () => {
    // `ESC[>4;2m`, `ESC[?2026h`, `ESC[4:3m`: la forma di prima le lasciava a
    // meta', e dal telefono si leggeva «[>4;2m» in mezzo alle parole.
    expect(senzaColori(`${ESC}[>4;2m${ESC}[?2026hciao${ESC}[4:3m${ESC}[?2026l`)).toBe('ciao')
  })

  it('toglie i titoli di finestra, i collegamenti e le stringhe DCS', () => {
    const BEL = String.fromCharCode(7)
    expect(senzaColori(`${ESC}]0;titolo${BEL}testo${ESC}]8;;http://x${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe('testolink')
    expect(senzaColori(`${ESC}Pq...${ESC}\\dopo`)).toBe('dopo')
  })

  it('una sequenza spezzata alla fine del pezzo non lascia residui', () => {
    expect(senzaColori(`ciao${ESC}[38;2;1`)).toBe('ciao')
    expect(senzaColori(`ciao${ESC}`)).toBe('ciao')
  })
})

describe('ultimaRigaDalloSchermo', () => {
  // Il flusso di un'interfaccia che si ridisegna in posizione finisce con un
  // frammento: dal telefono, nelle notifiche, si leggevano caratteri a caso.
  // Lo schermo disegnato e' lo stato, e da li' si legge l'ultima riga vera.
  const schermo = [
    '● Ho aggiornato il file di configurazione.',
    '',
    '╭──────────────────────────────╮',
    '│ >                            │',
    '╰──────────────────────────────╯',
    '  ? for shortcuts                       bypass permissions on (shift+tab to cycle)'
  ]

  it('salta il campo vuoto, le cornici e le righe fisse dell interfaccia', () => {
    expect(ultimaRigaDalloSchermo(schermo)).toBe('● Ho aggiornato il file di configurazione.')
  })

  it('mentre lavora, la riga dello spinner e il battito', () => {
    const lavora = ['risposta precedente', '✻ Cogitating… (esc to interrupt · 12s)', '', '╭───╮', '│ > │', '╰───╯', '? for shortcuts']
    expect(ultimaRigaDalloSchermo(lavora)).toBe('✻ Cogitating… (esc to interrupt · 12s)')
  })

  it('il testo dentro una cornice si legge senza la cornice', () => {
    expect(ultimaRigaDalloSchermo(['│ Vuoi procedere? │', '╰───╯'])).toBe('Vuoi procedere?')
  })

  it('senza schermo, o con solo interfaccia, non inventa niente', () => {
    expect(ultimaRigaDalloSchermo(undefined)).toBe('')
    expect(ultimaRigaDalloSchermo(['╭───╮', '│ > │', '╰───╯', '? for shortcuts'])).toBe('')
  })
})

describe('ultimaRigaUtile', () => {
  it('prende l ultima riga con dentro qualcosa', () => {
    expect(ultimaRigaUtile('prima\nseconda\n\n\n')).toBe('seconda')
  })

  it('salta le cornici, che non dicono niente', () => {
    // Sono decorazione: da lontano contano meno di una riga di testo vero.
    expect(ultimaRigaUtile('lavoro in corso\n───────────────\n')).toBe('lavoro in corso')
  })

  it('senza niente da leggere non inventa una riga', () => {
    expect(ultimaRigaUtile('\n\n   \n')).toBe('')
  })

  it('una riga lunghissima si taglia', () => {
    expect(ultimaRigaUtile('x'.repeat(500)).length).toBeLessThan(200)
  })
})

describe('creaUltimeRighe', () => {
  it('ricompone una riga arrivata a pezzi', () => {
    // Un terminale manda i dati a pezzetti: senza rimetterli insieme si
    // mostrerebbero mezze parole.
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'sto lavo')
    r.aggiorna('p1', 'rando al file\n')
    expect(r.di('p1')).toBe('sto lavorando al file')
  })

  it('tiene le chat separate', () => {
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'una cosa\n')
    r.aggiorna('p2', 'un altra\n')
    expect(r.di('p1')).toBe('una cosa')
    expect(r.di('p2')).toBe('un altra')
  })

  it('una chat mai vista non ha righe', () => {
    expect(creaUltimeRighe().di('mai-vista')).toBe('')
  })

  it('dimenticare una chat la toglie di mezzo', () => {
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'qualcosa\n')
    r.dimentica('p1')
    expect(r.di('p1')).toBe('')
    expect(r.codaDi('p1')).toEqual([])
  })

  it('pota tiene i terminali vivi e scorda gli altri', () => {
    // Il difetto del leak: il flusso scrive per ogni id che passa — rilanci
    // compresi, con un id nuovo a ogni resume — e senza potare le mappe crescono
    // per sempre. `pota` tiene solo gli id che un riquadro aperto ha ancora in mano.
    const r = creaUltimeRighe()
    r.aggiorna('vivo', 'lavoro\n')
    r.aggiorna('vecchio-resume', 'ero questo prima\n')
    r.aggiorna('chat-chiusa', 'addio\n')
    r.pota(new Set(['vivo']))
    expect(r.di('vivo')).toBe('lavoro')
    expect(r.di('vecchio-resume')).toBe('')
    expect(r.di('chat-chiusa')).toBe('')
    expect(r.codaDi('vecchio-resume')).toEqual([])
    // Anche l'attivita' se ne va: niente voci morte che restano «quasi pronte».
    expect(r.attivitaDi('chat-chiusa')).toEqual({ ultimoDato: 0, prontoVisto: false })
  })

  it('un dato in ritardo dopo l exit non fa resuscitare il terminale', () => {
    // Il PTY puo' sputare i suoi ultimi byte **dopo** l'exit (coda, o eventi
    // riordinati): se `aggiorna` dimenticasse `morto`, il terminale tornerebbe
    // «pronto» e un compito ci finirebbe dentro, perduto.
    const r = creaUltimeRighe()
    r.aggiorna('p1', '❯ pronto\n')
    r.segnaMorto('p1')
    r.aggiorna('p1', 'byte in ritardo\n')
    expect(r.attivitaDi('p1').morto).toBe(true)
    expect(terminalePronto(r.attivitaDi('p1'), 10_000)).toBe(false)
  })

  it('tiene le ultime righe, non solo l ultima', () => {
    // Una riga dice che si muove, quattordici dicono **cosa** sta facendo: è
    // la differenza fra guardare da fuori e poter decidere se intervenire.
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'npm test\n\n3 falliti\nil quarto passa\n')
    // Le righe vuote non contano: da un telefono occupano spazio e non dicono
    // niente.
    expect(r.codaDi('p1')).toEqual(['npm test', '3 falliti', 'il quarto passa'])
  })

  it('non tiene tutto quello che una chat ha mai scritto', () => {
    // Conservare il flusso vorrebbe dire tenere in memoria ore di terminale
    // per ogni chat aperta.
    const r = creaUltimeRighe()
    for (let i = 0; i < 100; i += 1) r.aggiorna('p1', `riga ${i}\n`)
    const coda = r.codaDi('p1')
    expect(coda.length).toBeLessThanOrEqual(14)
    expect(coda[coda.length - 1]).toBe('riga 99')
  })
})

describe('quando il terminale e pronto a ricevere', () => {
  it('non lo e finche non ha disegnato il suo prompt', () => {
    // Provato sul campo: scrivendo dopo due secondi il messaggio entra nel
    // campo e l'invio si perde, perche' Claude Code sta ancora nascendo. Il
    // silenzio dei primi secondi non e' attesa: e' un programma che non ha
    // ancora cominciato a disegnarsi.
    const r = creaUltimeRighe()
    r.aggiorna('pty-1', 'Claude Code v2.1\n')
    expect(terminalePronto(r.attivitaDi('pty-1'), 10_000)).toBe(false)
  })

  it('lo e quando ha disegnato il prompt e poi ha taciuto', () => {
    const r = creaUltimeRighe()
    r.aggiorna('pty-1', 'bypass permissions on (shift+tab to cycle)\n')
    const a = r.attivitaDi('pty-1')
    // Appena scritto: sta ancora disegnando.
    expect(terminalePronto(a, a.ultimoDato + 100)).toBe(false)
    // Un secondo di silenzio dopo il prompt: adesso ascolta.
    expect(terminalePronto(a, a.ultimoDato + 1000)).toBe(true)
  })

  it('riconosce il prompt anche dal suo segno', () => {
    const r = creaUltimeRighe()
    r.aggiorna('pty-2', '\u276f ')
    const a = r.attivitaDi('pty-2')
    expect(terminalePronto(a, a.ultimoDato + 1000)).toBe(true)
  })

  it('un terminale mai visto non e pronto', () => {
    const r = creaUltimeRighe()
    expect(terminalePronto(r.attivitaDi('mai-nato'), 99_999)).toBe(false)
  })
})

describe('un terminale che e morto', () => {
  it('non e piu un posto dove scrivere', () => {
    // Senza, sembra il piu' pronto di tutti: ha visto il prompt e da allora
    // tace. Il compito ci finiva dentro - «terminale inesistente: 10965
    // caratteri non consegnati» - e l'autopilota restava fermo.
    const r = creaUltimeRighe()
    r.aggiorna('pty-1', 'bypass permissions on\n')
    const vivo = r.attivitaDi('pty-1')
    expect(terminalePronto(vivo, vivo.ultimoDato + 5000)).toBe(true)
    r.segnaMorto('pty-1')
    const morto = r.attivitaDi('pty-1')
    expect(terminalePronto(morto, morto.ultimoDato + 5000)).toBe(false)
  })
})

describe('chatAspetta — due fonti invece di una', () => {
  const schermoFermo = ['> ', '  ? for shortcuts', '❯ ']
  const schermoAlLavoro = ['✻ Sto pensando…', '  (esc to interrupt)']

  it('quando il flusso ha visto il prompt comanda il flusso, ma lo schermo ha il veto', () => {
    const a = { ultimoDato: 1000, prontoVisto: true }
    // Il flusso tace da quattro secondi, ma lo schermo dice «esc to interrupt»:
    // sta eseguendo un comando che non scrive niente. E' la chat sopra cui un
    // aggiornamento e' partito, perche' per il solo flusso «aspettava te».
    expect(chatAspetta(a, schermoAlLavoro, 5000)).toBe(false)
    // Schermo fermo e flusso quieto: aspetta te.
    expect(chatAspetta(a, schermoFermo, 5000)).toBe(true)
    // Ancora dentro la quiete: sta ridisegnando, non si scrive.
    expect(chatAspetta(a, schermoFermo, 1100)).toBe(false)
  })

  it('un terminale morto non aspetta nessuno, qualunque cosa dica lo schermo', () => {
    expect(chatAspetta({ ultimoDato: 0, prontoVisto: true, morto: true }, schermoFermo, 9000))
      .toBe(false)
  })

  it('il riquadro riagganciato dopo un riavvio: tace perché ha finito', () => {
    // È il difetto pagato aggiornando. Il flusso non ha mai parlato — la chat
    // era già ferma quando la finestra è nata — e per il solo flusso risultava
    // «con qualcosa in mano»: l'aggiornamento le scriveva dentro «finisci
    // quello che stai facendo» a una chat ferma da ore.
    const maiParlato = { ultimoDato: 0, prontoVisto: false }
    expect(chatAspetta(maiParlato, schermoFermo, 9_000_000)).toBe(true)
  })

  it('ma se lo schermo dice che sta lavorando, non si tocca', () => {
    expect(chatAspetta({ ultimoDato: 0, prontoVisto: false }, schermoAlLavoro, 9_000_000))
      .toBe(false)
  })

  it('schermo assente o muto: si resta prudenti', () => {
    const maiParlato = { ultimoDato: 0, prontoVisto: false }
    expect(chatAspetta(maiParlato, undefined, 9_000_000)).toBe(false)
    expect(chatAspetta(maiParlato, ['npm install in corso'], 9_000_000)).toBe(false)
  })
})
