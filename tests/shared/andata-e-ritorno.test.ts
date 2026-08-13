import { describe, it, expect } from 'vitest'
import { parseIstantanee, nuovaIstantanea, VERSIONE_ISTANTANEE } from '@shared/istantanea'
import { parseArchivio, VERSIONE_ARCHIVIO } from '@shared/workspace'
import { parseAutopilota, nuovoAutopilota, VERSIONE_AUTOPILOTA } from '@shared/autopilota'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE } from '@shared/preferenze'

/**
 * Quello che si scrive si rilegge, tutto.
 *
 * È il difetto che ha fatto sparire i workspace dai salvataggi: il campo c'era
 * nel tipo, veniva scritto sul file, e il parser non lo guardava. Nessun errore,
 * nessun avviso — solo tre workspace su quattro che non tornavano più, e mesi
 * per accorgersene.
 *
 * Un controllo campo per campo non basta: qui si prende un oggetto **pieno**,
 * lo si scrive e lo si rilegge, e si pretende che sia identico. Un campo nuovo
 * aggiunto al tipo e dimenticato nel parser fa fallire questo test il giorno
 * stesso, che è l'unico momento in cui costa poco.
 */

describe('un salvataggio riletto è quello che si era scritto', () => {
  const layout = {
    root: { type: 'split' as const, id: 's1', direction: 'horizontal' as const,
      children: [{ type: 'pane' as const, id: 'p1' }, { type: 'pane' as const, id: 'p2' }],
      sizes: [0.5, 0.5] },
    panes: [
      { id: 'p1', sessionUuid: 'u-1', cwd: 'C:\\a', title: 'prima', ibernata: true },
      { id: 'p2', sessionUuid: 'u-2', cwd: 'C:\\b', title: 'seconda' }
    ]
  }

  it('istantanea: finestre, workspace, quale era davanti, autopiloti', () => {
    const scritta = nuovaIstantanea({
      nome: 'desk',
      salvataIl: '2026-08-13T10:00:00.000Z',
      finestre: [{ monitor: 'm1', layout }],
      workspace: [
        { nome: 'lavoro', perMonitor: { m1: layout } },
        { nome: 'casa', perMonitor: {} }
      ],
      workspaceAttivo: 'lavoro',
      autopiloti: [{
        nome: 'notte',
        obiettivo: 'far passare i test',
        cwd: 'C:\\p',
        criteri: [{ descrizione: 'verdi', comando: 'npm test' }],
        tettoChat: 3
      }]
    })

    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [JSON.parse(JSON.stringify(scritta))]
    })
    expect(scartati).toEqual([])
    expect(istantanee[0]).toEqual(scritta)
  })

  it('archivio dei workspace: nomi, attivo, layout, chat che dormono', () => {
    const scritto = {
      versione: VERSIONE_ARCHIVIO,
      attivo: 'lavoro',
      workspace: [{ nome: 'lavoro', perMonitor: { m1: layout } }]
    }
    const { archivio, scartati } = parseArchivio(JSON.parse(JSON.stringify(scritto)))
    expect(scartati).toEqual([])
    expect(archivio).toEqual(scritto)
  })

  it('autopilota: tutto lo stato con cui riparte dopo un riavvio', () => {
    const scritto = {
      ...nuovoAutopilota({
        id: 'ap-1',
        nome: 'notte',
        obiettivo: 'far passare i test',
        cwd: 'C:\\p',
        criteri: [{ descrizione: 'verdi', comando: 'npm test', soddisfatto: true }],
        iniziatoIl: '2026-08-13T10:00:00.000Z'
      }),
      sessionId: 'sess-1',
      riprendiAlRiavvio: false,
      cicli: 7
    }
    // La versione la aggiunge l archivio al momento di scrivere, come in
    // produzione: senza, si proverebbe una forma che sul disco non esiste.
    const suDisco = JSON.parse(JSON.stringify({ ...scritto, versione: VERSIONE_AUTOPILOTA }))
    const letto = parseAutopilota(suDisco)
    expect(letto.scartati).toEqual([])
    expect(letto.autopilota).toEqual(scritto)
  })

  it('preferenze: ogni interruttore torna com era', () => {
    // Una preferenza che non si rilegge torna al predefinito a ogni riavvio, e
    // chi l'aveva cambiata pensa che il programma non gli dia retta.
    const scritte = {
      ...PREFERENZE_PREDEFINITE,
      accento: '#ff0000',
      chiarore: 42,
      portaClient: 47999,
      clientOltreLaRete: true,
      ibernaCambiandoWorkspace: true
    }
    expect(normalizzaPreferenze(JSON.parse(JSON.stringify(scritte)))).toEqual(scritte)
  })
})
