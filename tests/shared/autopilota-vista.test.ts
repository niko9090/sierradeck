import { describe, it, expect } from 'vitest'
import { descriviAutopilota, ledDi, misuraPasso, passaggi } from '../../src/shared/autopilota-vista'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [
        { descrizione: 'i test passano', comando: 'npm test', soddisfatto: false },
        { descrizione: 'compila', comando: 'npm run build', soddisfatto: true }
      ],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

describe('descriviAutopilota', () => {
  it('conta i criteri soddisfatti', () => {
    expect(descriviAutopilota(ap()).avanzamento).toBe('1 criterio su 2')
  })

  it('accorda il plurale quando i criteri soddisfatti sono piu di uno', () => {
    const tutti = ap({
      criteri: [
        { descrizione: 'a', soddisfatto: true },
        { descrizione: 'b', soddisfatto: true }
      ]
    })
    expect(descriviAutopilota(tutti).avanzamento).toBe('2 criteri su 2')
  })

  it('dice che e bloccato, e su cosa sta provando, invece di dire solo al lavoro', () => {
    // Dall'esterno «lavora» e «lavora ma gira a vuoto» si somigliano troppo:
    // la differenza e' proprio cio' che l'utente vuole vedere.
    const d = descriviAutopilota(ap({ stato: 'lavoro', strategia: 'dubitare della misura' }))
    expect(d.sottotitolo).toContain('bloccato')
    expect(d.sottotitolo).toContain('dubitare della misura')
  })

  it('dice al lavoro quando lavora', () => {
    expect(descriviAutopilota(ap()).sottotitolo).toContain('al lavoro')
  })

  it('mostra il motivo quando e sospeso, invece di dire solo sospeso', () => {
    const s = descriviAutopilota(ap({ stato: 'sospeso', motivoSospensione: 'stallo: 3 tentativi' }))
    expect(s.sottotitolo).toContain('stallo: 3 tentativi')
  })

  it('mostra la domanda quando e in attesa', () => {
    const s = descriviAutopilota(ap({
      stato: 'attesa', motivoSospensione: 'permission_prompt: quale chiave uso?'
    }))
    expect(s.sottotitolo).toContain('quale chiave uso?')
  })

  it('dice finito senza motivo appiccicato', () => {
    const s = descriviAutopilota(ap({ stato: 'finito', motivoSospensione: 'vecchio motivo' }))
    expect(s.sottotitolo).toContain('finito')
    expect(s.sottotitolo).not.toContain('vecchio motivo')
  })

  it('usa il nome come titolo e ripiega sull obiettivo', () => {
    expect(descriviAutopilota(ap()).titolo).toBe('Test verdi')
    expect(descriviAutopilota(ap({ nome: '' })).titolo).toBe('Fai passare la suite')
  })
})

describe('descriviAutopilota con una flotta', () => {
  it('dice quante chat stanno lavorando', () => {
    const conFlotta = ap({
      tettoChat: 3,
      chats: [
        { id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 2 },
        { id: 'c-2', compito: 'b', stato: 'finita', cicli: 5 },
        { id: 'c-3', compito: 'c', stato: 'lavoro', cicli: 1 }
      ]
    })
    expect(descriviAutopilota(conFlotta).sottotitolo).toContain('2 chat')
  })

  it('non parla di chat quando ne governa una sola', () => {
    // Il caso normale non deve diventare piu' rumoroso per una funzione che chi
    // non la usa non deve nemmeno vedere.
    expect(descriviAutopilota(ap()).sottotitolo).not.toContain('chat')
  })

  it('conta i compiti ancora in coda', () => {
    const conCoda = ap({
      tettoChat: 2,
      chats: [{ id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 0 }],
      compitiDaFare: ['b', 'c']
    })
    expect(descriviAutopilota(conCoda).sottotitolo).toContain('2 in coda')
  })
})

describe('ledDi', () => {
  it('verde quando lavora', () => {
    expect(ledDi(ap()).classe).toBe('led--lavoro')
  })

  it('ambra quando aspetta una risposta', () => {
    // E' l'unico stato che lampeggia in tutta l'applicazione: significa che
    // l'autopilota aspetta l'utente, e nient'altro.
    expect(ledDi(ap({ stato: 'attesa' })).classe).toBe('led--attesa')
  })

  it('rosso quando e fermo o fallito', () => {
    expect(ledDi(ap({ stato: 'sospeso' })).classe).toBe('led--fermo')
    expect(ledDi(ap({ stato: 'fallito' })).classe).toBe('led--fermo')
  })

  it('spento quando ha finito', () => {
    // Un lavoro concluso non e' un allarme: si spegne, non diventa verde.
    expect(ledDi(ap({ stato: 'finito' })).classe).toBe('led--finito')
  })

  it('il titolo del LED dice nome e stato, per chi ci passa sopra', () => {
    const t = ledDi(ap({ stato: 'attesa', motivoSospensione: 'Quale chiave?' })).titolo
    expect(t).toContain('Test verdi')
    expect(t).toContain('Quale chiave?')
  })

  it('chi si prepara lavora: verde finche non chiede davvero qualcosa', () => {
    // Lampeggiare mentre nessuno e' atteso e' il difetto che si e' gia' tolto
    // dalla banda in cima: un LED ambra dice «tocca a te», e se lo dice quando
    // non e' vero insegna a non fidarsi di quando lo e'.
    expect(ledDi(ap({ stato: 'intervista', criteri: [] })).classe).toBe('led--lavoro')
  })

  it('chi si prepara e ha fatto una domanda aspetta te', () => {
    const chiede = ap({ stato: 'intervista', criteri: [], motivoSospensione: 'Anche YAML?' })
    expect(ledDi(chiede).classe).toBe('led--attesa')
  })
})

describe('autopilota in intervista', () => {
  it('dice che si sta preparando, e cosa sta chiedendo', () => {
    const s = descriviAutopilota(ap({
      stato: 'intervista',
      criteri: [],
      motivoSospensione: 'Il lettore deve accettare anche YAML?'
    }))
    expect(s.sottotitolo).toContain('prepara')
    expect(s.sottotitolo).toContain('YAML')
  })

  it('non mostra un avanzamento sui criteri che non esistono ancora', () => {
    // «0 criteri su 0» sarebbe una misura di niente.
    expect(descriviAutopilota(ap({ stato: 'intervista', criteri: [] })).avanzamento).toBe('—')
  })

  it('il LED di chi si prepara dice se sta lavorando o se aspetta te', () => {
    // Prima erano la stessa cosa. Non lo sono: mentre guarda il progetto non
    // aspetta nessuno, e un LED ambra che lampeggia a vuoto e' il modo piu'
    // rapido per far smettere di guardare i LED.
    expect(ledDi(ap({ stato: 'intervista', criteri: [] })).classe).toBe('led--lavoro')
    expect(ledDi(ap({ stato: 'intervista', criteri: [], motivoSospensione: 'Anche YAML?' })).classe)
      .toBe('led--attesa')
  })
})

describe('passaggi', () => {
  /** Il passo che l'autopilota sta vivendo adesso, comunque si chiami. */
  function adesso(a: Autopilota): { nome: string; stato: string; nota?: string } {
    const qui = passaggi(a).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
    return qui ?? { nome: '', stato: '' }
  }

  it('sono sempre tre, dalla preparazione alla fine', () => {
    // Il percorso e' quello e non cambia: chi guarda deve poter vedere dove si
    // trova, non solo cosa sta facendo. Prima se ne raccontavano due su sei.
    expect(passaggi(ap()).map((p) => p.nome)).toEqual(['Prepara', 'Lavora', 'Fine'])
  })

  it('in preparazione il primo passo e quello corrente e gli altri sono davanti', () => {
    const p = passaggi(ap({ stato: 'intervista', criteri: [] }))
    expect(p.map((x) => x.stato)).toEqual(['corrente', 'davanti', 'davanti'])
  })

  it('la domanda della preparazione si vede nel suo passo', () => {
    const p = adesso(ap({ stato: 'intervista', criteri: [], motivoSospensione: 'Anche YAML?' }))
    expect(p.nome).toBe('Prepara')
    expect(p.stato).toBe('attesa')
    expect(p.nota).toContain('Anche YAML?')
  })

  it('al lavoro la preparazione risulta fatta', () => {
    const p = passaggi(ap({ stato: 'lavoro', cicli: 3 }))
    expect(p[0]!.stato).toBe('fatto')
    expect(p[1]!.stato).toBe('corrente')
    expect(p[1]!.nota).toContain('3')
  })

  it('chi aspetta una risposta lo dice nel passo del lavoro', () => {
    const p = adesso(ap({ stato: 'attesa', motivoSospensione: 'Quale chiave?' }))
    expect(p.nome).toBe('Lavora')
    expect(p.stato).toBe('attesa')
    expect(p.nota).toContain('Quale chiave?')
  })

  it('una preparazione fermata resta ferma sul suo passo, non su quello del lavoro', () => {
    // Senza criteri non ha mai lavorato: dire «fermo al lavoro» manderebbe a
    // cercare una chat che non e' mai partita.
    const p = adesso(ap({ stato: 'sospeso', criteri: [], motivoSospensione: 'claude.exe non parte' }))
    expect(p.nome).toBe('Prepara')
    expect(p.stato).toBe('fermo')
    expect(p.nota).toContain('claude.exe')
  })

  it('un lavoro fallito si ferma sul passo del lavoro', () => {
    const p = adesso(ap({ stato: 'fallito', motivoSospensione: 'la verifica non parte' }))
    expect(p.nome).toBe('Lavora')
    expect(p.stato).toBe('fermo')
  })

  it('finito accende l ultimo passo e lascia fatti i primi due', () => {
    const p = passaggi(ap({ stato: 'finito', cicli: 7 }))
    expect(p.map((x) => x.stato)).toEqual(['fatto', 'fatto', 'corrente'])
    expect(p[2]!.nota).toContain('7')
  })
})

describe('la misura del passo corrente', () => {
  it('durante la preparazione misura la preparazione, non i criteri', () => {
    // I criteri non ci sono ancora: misurarli darebbe zero su zero. Quello che
    // avanza qui sono i giri dell'intervista, e sono quelli da mostrare.
    const m = misuraPasso(ap({ stato: 'intervista', criteri: [] }))
    expect(m.di).toBe('preparazione')
    expect(m.percento).toBeGreaterThan(0)
    expect(m.percento).toBeLessThan(100)
  })

  it('ogni risposta manda avanti la preparazione', () => {
    const primo = misuraPasso(ap({ stato: 'intervista', criteri: [] })).percento
    const dopoUna = misuraPasso(ap({
      stato: 'intervista', criteri: [], intervista: [{ domanda: 'd', risposta: 'r' }]
    })).percento
    expect(dopoUna).toBeGreaterThan(primo)
  })

  it('al lavoro misura i criteri', () => {
    const m = misuraPasso(ap({ stato: 'lavoro' }))
    expect(m.di).toBe('criteri')
    expect(m.percento).toBe(50)
    expect(m.dettaglio).toBe('1 di 2')
  })

  it('finito e cento per cento, comunque siano andati i criteri', () => {
    expect(misuraPasso(ap({ stato: 'finito' })).percento).toBe(100)
  })

  it('il tono segue il passo: verde chi lavora, ambra chi aspetta, rosso chi e fermo', () => {
    expect(misuraPasso(ap({ stato: 'lavoro' })).tono).toBe('lavoro')
    expect(misuraPasso(ap({ stato: 'attesa' })).tono).toBe('attesa')
    expect(misuraPasso(ap({ stato: 'sospeso' })).tono).toBe('fermo')
    // La preparazione ha un tono suo: cosi la percentuale non si confonde con
    // quella dei criteri, che misura un'altra cosa.
    expect(misuraPasso(ap({ stato: 'intervista', criteri: [] })).tono).toBe('preparazione')
  })

  it('senza criteri e fuori dalla preparazione non inventa una misura', () => {
    const m = misuraPasso(ap({ stato: 'sospeso', criteri: [] }))
    expect(m.percento).toBeGreaterThanOrEqual(0)
    expect(m.di).toBe('preparazione')
  })
})
