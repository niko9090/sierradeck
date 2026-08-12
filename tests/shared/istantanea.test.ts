import { describe, it, expect } from 'vitest'
import {
  parseIstantanee, nuovaIstantanea, scegliFinestre, daRiavviare, daSalvare, VERSIONE_ISTANTANEE,
  type Istantanea, type FinestraSalvata, type AutopilotaSalvato
} from '@shared/istantanea'

function layout(id = 'pane-1'): { root: { type: 'pane'; id: string }; panes: { id: string; sessionUuid: string; cwd: string; title: string }[] } {
  return {
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-1', cwd: 'C:\\p', title: 'Una chat' }]
  }
}

function istantanea(over: Partial<Istantanea> = {}): Istantanea {
  return {
    nome: 'Ieri sera',
    salvataIl: '2026-08-09T20:00:00.000Z',
    finestre: [{ monitor: 'm1', layout: layout() }],
    autopiloti: [],
    ...over
  }
}

describe('parseIstantanee', () => {
  it('legge un archivio ben formato', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea()]
    })
    expect(scartati).toEqual([])
    expect(istantanee[0]?.nome).toBe('Ieri sera')
    expect(istantanee[0]?.finestre[0]?.layout.panes).toHaveLength(1)
  })

  it('restituisce vuoto da un valore qualunque, senza sollevare', () => {
    for (const raw of [null, undefined, 42, 'niente', []]) {
      expect(parseIstantanee(raw).istantanee).toEqual([])
    }
  })

  it('rifiuta un archivio di versione futura invece di interpretarlo a caso', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE + 1,
      istantanee: [istantanea()]
    })
    expect(istantanee).toEqual([])
    expect(scartati.some((s) => s.includes('versione'))).toBe(true)
  })

  it('scarta un istantanea senza nome e tiene le buone', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{ salvataIl: 'x', finestre: [] }, istantanea({ nome: 'Buona' })]
    })
    expect(istantanee.map((i) => i.nome)).toEqual(['Buona'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('normalizza i layout con lo stesso parser dei workspace', () => {
    // Un riquadro senza dati viene potato: se passasse, l'istantanea
    // ricaricherebbe un riquadro che non si puo' disegnare.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        finestre: [{
          monitor: 'm1',
          layout: {
            root: {
              type: 'split', id: 's1', direction: 'horizontal',
              children: [{ type: 'pane', id: 'a' }, { type: 'pane', id: 'fantasma' }],
              sizes: [0.5, 0.5]
            },
            panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
          }
        }]
      })]
    })
    expect(istantanee[0]?.finestre[0]?.layout.root).toEqual({ type: 'pane', id: 'a' })
  })

  it('legge gli autopiloti salvati insieme alle chat', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        autopiloti: [{
          nome: 'Test verdi',
          obiettivo: 'Fai passare la suite',
          cwd: 'C:\\p',
          criteri: [{ descrizione: 'i test passano', comando: 'npm test' }],
          tettoChat: 2
        }]
      })]
    })
    expect(istantanee[0]?.autopiloti[0]?.obiettivo).toBe('Fai passare la suite')
    expect(istantanee[0]?.autopiloti[0]?.tettoChat).toBe(2)
  })

  it('scarta un autopilota senza obiettivo, che non si potrebbe far ripartire', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        autopiloti: [
          { nome: 'rotto', cwd: 'C:\\p' },
          { nome: 'buono', obiettivo: 'o', cwd: 'C:\\p', criteri: [{ descrizione: 'd' }] }
        ] as never
      })]
    })
    expect(istantanee[0]?.autopiloti.map((a) => a.nome)).toEqual(['buono'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('tiene solo l ultima istantanea con lo stesso nome', () => {
    // Salvare due volte con lo stesso nome e' un aggiornamento, non un
    // duplicato: l'elenco resta corto e la scelta resta chiara.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [
        istantanea({ nome: 'Lavoro', salvataIl: '2026-08-01T10:00:00.000Z' }),
        istantanea({ nome: 'Lavoro', salvataIl: '2026-08-09T10:00:00.000Z' })
      ]
    })
    expect(istantanee).toHaveLength(1)
    expect(istantanee[0]?.salvataIl).toBe('2026-08-09T10:00:00.000Z')
  })

  it('ordina dalla piu recente', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [
        istantanea({ nome: 'Vecchia', salvataIl: '2026-08-01T10:00:00.000Z' }),
        istantanea({ nome: 'Nuova', salvataIl: '2026-08-09T10:00:00.000Z' })
      ]
    })
    expect(istantanee.map((i) => i.nome)).toEqual(['Nuova', 'Vecchia'])
  })
})

describe('nuovaIstantanea', () => {
  it('e valida secondo il proprio parser', () => {
    const i = nuovaIstantanea({
      nome: 'Adesso',
      salvataIl: '2026-08-09T20:00:00.000Z',
      finestre: [{ monitor: 'm1', layout: layout() }],
      autopiloti: []
    })
    const { istantanee, scartati } = parseIstantanee({ versione: VERSIONE_ISTANTANEE, istantanee: [i] })
    expect(scartati).toEqual([])
    expect(istantanee).toHaveLength(1)
  })
})

describe('piu finestre nella stessa istantanea', () => {
  const layout = (n: number): unknown => ({
    root: { type: 'pane', id: `p${n}` },
    panes: [{ id: `p${n}`, sessionUuid: `u${n}`, cwd: 'C:\\p', title: `chat ${n}` }]
  })

  it('conserva una finestra per ogni disposizione salvata', () => {
    // Sei chat in due finestre: salvarne solo una ne riporta indietro quattro,
    // ed e' esattamente il difetto che si vedeva ricaricando.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'sera',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [{ monitor: 'm1', layout: layout(1) }, { monitor: 'm1', layout: layout(2) }],
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(2)
    expect(istantanee[0]?.finestre[1]?.layout.panes[0]?.title).toBe('chat 2')
  })

  it('legge i salvataggi vecchi, dove le finestre erano una per monitor', () => {
    // Chi ha gia' dei salvataggi non deve perderli: la forma precedente teneva
    // un layout per monitor, e ognuno di quelli era una finestra.
    const { istantanee, scartati } = parseIstantanee({
      versione: 1,
      istantanee: [{
        nome: 'ieri',
        salvataIl: '2026-08-09T10:00:00.000Z',
        perMonitor: { m1: layout(1), m2: layout(2) },
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(2)
    expect(istantanee[0]?.finestre.map((f) => f.monitor).sort()).toEqual(['m1', 'm2'])
    expect(scartati).toEqual([])
  })

  it('scarta una finestra senza layout leggibile senza perdere le altre', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'x',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [{ monitor: 'm1', layout: 'non sono un layout' }, { monitor: 'm1', layout: layout(2) }],
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(1)
  })

  it('un istantanea senza finestre resta leggibile', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{ nome: 'vuota', salvataIl: '2026-08-10T10:00:00.000Z', autopiloti: [] }]
    })
    expect(istantanee[0]?.finestre).toEqual([])
  })
})

describe('scegliFinestre', () => {
  const f = (monitor: string, titolo: string): FinestraSalvata => ({
    monitor,
    layout: { root: { type: 'pane', id: 'p' }, panes: [{ id: 'p', sessionUuid: 'u', cwd: 'C:\p', title: titolo }] }
  })

  it('da alla finestra che ricarica quella del suo monitor', () => {
    const { mia, altre } = scegliFinestre([f('m1', 'a'), f('m2', 'b')], 'm2')
    expect(mia?.layout.panes[0]?.title).toBe('b')
    expect(altre.map((x) => x.layout.panes[0]?.title)).toEqual(['a'])
  })

  it('se il monitor non c e prende la prima, invece di aprire tutto altrove', () => {
    // Un salvataggio fatto su due schermi e ricaricato sul portatile deve
    // comunque tornare: meglio tutto qui che niente da nessuna parte.
    const { mia, altre } = scegliFinestre([f('m1', 'a'), f('m2', 'b')], 'ignoto')
    expect(mia?.layout.panes[0]?.title).toBe('a')
    expect(altre).toHaveLength(1)
  })

  it('con due finestre sullo stesso monitor ne tiene una e apre l altra', () => {
    const { mia, altre } = scegliFinestre([f('m1', 'a'), f('m1', 'b')], 'm1')
    expect(mia?.layout.panes[0]?.title).toBe('a')
    expect(altre.map((x) => x.layout.panes[0]?.title)).toEqual(['b'])
  })

  it('senza finestre salvate non apre niente', () => {
    const { mia, altre } = scegliFinestre([], 'm1')
    expect(mia).toBeUndefined()
    expect(altre).toEqual([])
  })
})

describe('autopiloti salvati senza criteri', () => {
  it('li conserva, perche sara la preparazione a produrli', () => {
    // Da quando l'autopilota si configura da se', i criteri nascono
    // dall'intervista: scartarlo qui significava che un autopilota ancora in
    // preparazione spariva dal salvataggio, e al ricarico non tornava.
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'sera',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [],
        autopiloti: [{ nome: 'Controllo', obiettivo: 'controlla tutto', cwd: 'C:\p', criteri: [] }]
      }]
    })
    expect(istantanee[0]?.autopiloti).toHaveLength(1)
    expect(istantanee[0]?.autopiloti[0]?.criteri).toEqual([])
    expect(scartati).toEqual([])
  })

  it('ma senza obiettivo non c e niente da far ripartire', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'x', salvataIl: '2026-08-10T10:00:00.000Z', finestre: [],
        autopiloti: [{ nome: 'Senza', cwd: 'C:\p', criteri: [] }]
      }]
    })
    expect(istantanee[0]?.autopiloti).toEqual([])
  })
})

describe('autopiloti al ripristino', () => {
  const salvato = (nome: string, obiettivo: string, cwd = 'C:\\lavoro\\casa'): AutopilotaSalvato =>
    ({ nome, obiettivo, cwd, criteri: [] })

  it('non ricrea un autopilota che gia esiste', () => {
    // Il difetto osservato: ricaricando un salvataggio, i suoi autopiloti
    // venivano creati di nuovo ogni volta. Da uno solo se ne sono trovati sei,
    // nati a coppie a sei secondi di distanza — e ognuno rifaceva l'intervista,
    // cioe' le stesse domande gia' risposte.
    const da = daRiavviare(
      [salvato('Audit', 'controlla la configurazione')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da).toEqual([])
  })

  it('riavvia quelli che davvero non ci sono piu', () => {
    const da = daRiavviare(
      [salvato('Audit', 'controlla la configurazione'), salvato('Altro', 'sistema i test')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da.map((a) => a.nome)).toEqual(['Altro'])
  })

  it('non bada a maiuscole ne alla barra finale della cartella', () => {
    const da = daRiavviare(
      [salvato('Audit', 'Controlla La Configurazione', 'C:/lavoro/Casa/')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da).toEqual([])
  })

  it('lo stesso obiettivo in un altra cartella e un altro lavoro', () => {
    const da = daRiavviare(
      [salvato('Audit', 'controlla', 'C:\\altro')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla' }]
    )
    expect(da).toHaveLength(1)
  })

  it('due copie dentro lo stesso salvataggio diventano una', () => {
    const da = daRiavviare([salvato('A', 'controlla'), salvato('B', 'controlla')], [])
    expect(da).toHaveLength(1)
  })

  it('senza autopiloti salvati non riavvia niente', () => {
    expect(daRiavviare([], [{ cwd: 'C:\\p', obiettivo: 'x' }])).toEqual([])
  })
})

describe('autopiloti da salvare', () => {
  const vivo = (nome: string, stato: string): { nome: string; stato: string } => ({ nome, stato })

  it('non salva quelli che hanno gia finito', () => {
    // Rimetterli in moto al prossimo ricarico significa rifare un lavoro
    // gia' fatto: chat nuove, token spesi e, se l'obiettivo era gia' raggiunto,
    // un autopilota che gira per scoprire che non c'e' niente da fare.
    const da = daSalvare([vivo('Finito', 'finito'), vivo('Al lavoro', 'lavoro')])
    expect(da.map((a) => a.nome)).toEqual(['Al lavoro'])
  })

  it('salva quelli fermi a meta, che e proprio il caso da riprendere', () => {
    const da = daSalvare([vivo('Sospeso', 'sospeso'), vivo('In preparazione', 'intervista'), vivo('In attesa', 'attesa')])
    expect(da).toHaveLength(3)
  })

  it('non salva quelli falliti', () => {
    expect(daSalvare([vivo('Fallito', 'fallito')])).toEqual([])
  })
})
