import { describe, it, expect } from 'vitest'
import {
  SEPARATORE, TESTO_MAX, VOCI_MAX, eSeparatore, eSottomenu, testoVisibile, vociAltroPc, vociAutopilota, vociChat, vociDivisore,
  vociDomanda, vociFileTelefono, vociProgetto, vociSchedaPanoramica, vociSpecialista, vociValide, vociWorkspace, vociWorkspaceRemoto,
  type VoceMenu
} from '../../src/shared/menu-contestuale'
import { azioniMenuWorkspace } from '../../src/shared/menu-workspace'

/** Gli id in ordine, con «-» per i separatori e «>testo» per i sottomenu: si legge come il menu. */
function forma(voci: readonly VoceMenu[]): string[] {
  return voci.map((v) => (eSeparatore(v) ? '-' : eSottomenu(v) ? `>${v.testo}` : v.id))
}
function voce(voci: readonly VoceMenu[], id: string): Extract<VoceMenu, { id: string }> {
  const v = voci.find((x) => 'id' in x && x.id === id)
  if (v === undefined || !('id' in v)) throw new Error(`manca ${id}`)
  return v
}

describe('tasto destro: le voci che arrivano al main (13/11)', () => {
  it('scarta voci rotte, separatori in testa, doppi e in coda', () => {
    const v = vociValide([SEPARATORE, { id: 'a', testo: 'A' }, SEPARATORE, SEPARATORE, { id: '', testo: 'x' }, { id: 'b', testo: '  ' }, 7, null, { id: 'c', testo: 'C', spenta: true, pericolo: true, spunta: true, altro: 1 }, SEPARATORE])
    expect(forma(v)).toEqual(['a', '-', 'c'])
    expect(v[2]).toEqual({ id: 'c', testo: 'C', spenta: true, pericolo: true, spunta: true })
  })

  it('non è un elenco: nessuna voce', () => {
    expect(vociValide(undefined)).toEqual([])
    expect(vociValide({ id: 'a', testo: 'A' })).toEqual([])
  })

  it('testi lunghi tagliati, al massimo VOCI_MAX voci', () => {
    const lunghe = Array.from({ length: VOCI_MAX + 10 }, (_, i) => ({ id: `v${i}`, testo: 'x'.repeat(TESTO_MAX + 30) }))
    const v = vociValide(lunghe)
    expect(v).toHaveLength(VOCI_MAX)
    expect((v[0] as { testo: string }).testo).toHaveLength(TESTO_MAX)
    expect((v[0] as { testo: string }).testo.endsWith('…')).toBe(true)
  })

  it('sottomenu di un livello solo, mai vuoti', () => {
    const v = vociValide([
      { testo: 'Sposta in', sotto: [{ id: 'x', testo: 'X' }, { testo: 'dentro', sotto: [{ id: 'y', testo: 'Y' }] }] },
      { testo: 'Vuoto', sotto: [SEPARATORE] }
    ])
    expect(forma(v)).toEqual(['>Sposta in'])
    expect(forma((v[0] as { sotto: VoceMenu[] }).sotto)).toEqual(['x'])
  })

  it('le azioni che cancellano o chiedono conferma finiscono con «…»', () => {
    expect(testoVisibile({ testo: 'Elimina dal PC', pericolo: true })).toBe('Elimina dal PC…')
    expect(testoVisibile({ testo: 'Elimina…', pericolo: true })).toBe('Elimina…')
    expect(testoVisibile({ testo: 'Apri' })).toBe('Apri')
  })
})

describe('tasto destro: le voci di ogni cosa', () => {
  it('workspace della fascia: le azioni del «⋯», il PIN, Gestisci, Elimina in fondo', () => {
    const az = azioniMenuWorkspace({ nome: 'Lavoro', qui: true }, { attivo: 'Altro', quanti: 3, cartella: true, soloQui: false })
    const v = vociWorkspace({ azioni: az, nome: 'Lavoro', pin: { acceso: true, protetto: false } })
    expect(forma(v)).toEqual(['apri', 'rinomina', 'cartella', 'soloQui', '-', 'pin-metti', 'gestisci', '-', 'elimina'])
    expect(voce(v, 'elimina').pericolo).toBe(true)
    expect(voce(v, 'pin-metti').spenta).toBeUndefined()
  })

  it('workspace davanti: «Sei qui» spento; l’ultimo non si elimina; PIN spento nelle Impostazioni', () => {
    const az = azioniMenuWorkspace({ nome: 'Solo', qui: true }, { attivo: 'Solo', quanti: 1, cartella: true, soloQui: true })
    const v = vociWorkspace({ azioni: az, nome: 'Solo', pin: { acceso: false, protetto: false } })
    expect(voce(v, 'apri').spenta).toBe(true)
    expect(voce(v, 'elimina').spenta).toBe(true)
    expect(voce(v, 'soloQui').spunta).toBe(true)
    expect(voce(v, 'soloQui').testo).toBe('Solo su questo PC')
    expect(voce(v, 'pin-metti').spenta).toBe(true)
  })

  it('workspace protetto: «Togli il PIN»; nel menu dei workspace niente PIN né Gestisci', () => {
    const az = azioniMenuWorkspace({ nome: 'W', qui: true }, { attivo: 'X', quanti: 2 })
    expect(forma(vociWorkspace({ azioni: az, nome: 'W', pin: { acceso: true, protetto: true } }))).toContain('pin-togli')
    expect(forma(vociWorkspace({ azioni: az, nome: 'W', gestisci: false }))).toEqual(['apri', 'rinomina', 'cartella', '-', 'elimina'])
  })

  it('chat locale: tutte le azioni della testata, con Sposta in come sottomenu', () => {
    const v = vociChat({ remota: false, ibernata: false, pinAcceso: true, protetta: false, sposta: { finestre: [{ id: 2, titolo: 'Finestra 2' }], workspace: ['B'] } })
    expect(forma(v)).toEqual(['rinomina', 'cartella', '>Sposta in', 'iberna', '-', 'pin-metti', '-', 'chiudi', 'archivia', 'elimina'])
    const sotto = (v[2] as { sotto: VoceMenu[] }).sotto
    expect(forma(sotto)).toEqual(['finestra:2', '-', 'ws:B'])
    expect(['chiudi', 'archivia', 'elimina'].every((id) => voce(v, id).pericolo === true)).toBe(true)
  })

  it('chat che dorme: «Sveglia»; nessuna destinazione: Sposta spento; il motivo del PC spegne Elimina', () => {
    const v = vociChat({ remota: false, ibernata: true, pinAcceso: false, protetta: true, sposta: { finestre: [], workspace: [] }, eliminaNo: 'sta lavorando' })
    expect(forma(v)).toContain('sveglia')
    expect(voce(v, 'sposta-nulla').spenta).toBe(true)
    expect(voce(v, 'pin-togli')).toBeDefined()
    expect(voce(v, 'elimina')).toMatchObject({ spenta: true, testo: 'Elimina dal PC (sta lavorando)' })
  })

  it('chat di un altro PC: niente cartella, PIN né Chiudi/Archivia/Elimina da qui', () => {
    const v = vociChat({ remota: true, ibernata: false, pinAcceso: true, protetta: false, sposta: { finestre: [], workspace: ['B'] } })
    expect(forma(v)).toEqual(['rinomina', '>Sposta in', '-', 'chiudi-riquadro'])
  })

  it('scheda della Panoramica: apri, solo mia, le tre azioni; remota senza azioni; motivi', () => {
    expect(forma(vociSchedaPanoramica({ apribile: true, remota: false, soloMia: false, gestibile: true }))).toEqual(['apri', 'solo-mia', '-', 'chiudi', 'archivia', 'elimina'])
    expect(forma(vociSchedaPanoramica({ apribile: false, remota: true, gestibile: false }))).toEqual(['apri'])
    const m = vociSchedaPanoramica({ apribile: true, remota: false, gestibile: true, chiudiNo: 'non è aperta qui', eliminaNo: 'aspetta te' })
    expect(voce(m, 'chiudi')).toMatchObject({ spenta: true })
    expect(voce(m, 'elimina').testo).toBe('Elimina dal PC (aspetta te)')
    expect(voce(vociSchedaPanoramica({ apribile: true, remota: false, soloMia: true, gestibile: true }), 'solo-mia').spunta).toBe(true)
  })

  it('autopilota: nella colonna e nell’elenco', () => {
    expect(forma(vociAutopilota({ dove: 'colonna' }))).toEqual(['autopiloti', 'domande', 'specialisti', 'cartella', '-', 'misura', 'chiudi-colonna'])
    expect(forma(vociAutopilota({ dove: 'colonna', remoto: true }))).not.toContain('cartella')
    expect(forma(vociAutopilota({ dove: 'elenco', scelto: false }))).toEqual(['dettaglio', 'cartella', '-', 'aggiorna'])
    expect(forma(vociAutopilota({ dove: 'elenco', scelto: true }))[0]).toBe('nascondi')
  })

  it('altri PC e i loro workspace', () => {
    expect(forma(vociAltroPc({ nome: 'Portatile', aperto: false }))).toEqual(['mostra', 'rileggi'])
    expect(voce(vociWorkspaceRemoto({ nome: 'W', pc: 'P', aperto: true, davanti: true, occupato: false }), 'apri').spenta).toBe(true)
    expect(voce(vociWorkspaceRemoto({ nome: 'W', pc: 'P', aperto: false, davanti: false, occupato: false }), 'apri').testo).toContain('P')
    expect(forma(vociWorkspaceRemoto({ nome: 'W', pc: 'P', aperto: false, davanti: false, occupato: true }))).toEqual(['apri', 'porta-qui'])
  })

  it('progetto: dettaglio, le sue azioni (con conferma = «…»), il quaderno', () => {
    const v = vociProgetto({ scelto: false, azioni: [{ id: 'apri', titolo: 'Apri' }, { id: 'sposta-qui', titolo: 'Sposta su questo PC', conferma: 'sicuro?' }], quaderno: true })
    expect(forma(v)).toEqual(['dettaglio', '-', 'azione:apri', 'azione:sposta-qui', '-', 'quaderno'])
    expect(voce(v, 'azione:sposta-qui').pericolo).toBe(true)
    expect(forma(vociProgetto({ scelto: true, azioni: [], quaderno: false }))).toEqual(['nascondi'])
  })

  it('specialista: al lavoro, di un altro PC, in fila', () => {
    expect(forma(vociSpecialista({ stato: 'lavora', fermaRichiesta: false }))).toEqual(['cima', 'ferma'])
    expect(voce(vociSpecialista({ stato: 'lavora', fermaRichiesta: true }), 'ferma').spenta).toBe(true)
    expect(vociSpecialista({ stato: 'lavora', perPc: 'Fisso', fermaRichiesta: false })).toEqual([{ id: 'nulla', testo: 'Lo segue Fisso', spenta: true }])
    const f = vociSpecialista({ stato: 'fila', primo: true, ultimo: false })
    expect(forma(f)).toEqual(['su', 'giu', 'cima', '-', 'togli'])
    expect(voce(f, 'su').spenta).toBe(true)
    expect(voce(f, 'giu').spenta).not.toBe(true)
  })

  it('domanda: apri, il filtro, chiudi la colonna', () => {
    expect(forma(vociDomanda({ aperta: false, filtro: 'aspettano' }))).toEqual(['apri', '-', 'tutte', 'chiudi-colonna'])
    expect(forma(vociDomanda({ aperta: true, filtro: 'tutte' }))).toContain('aspettano')
  })

  it('file verso il telefono: Annulla solo finché non è arrivato', () => {
    expect(forma(vociFileTelefono({ inCorso: true, quanteFinite: 0 }))).toEqual(['annulla'])
    const fin = vociFileTelefono({ inCorso: false, quanteFinite: 2 })
    expect(voce(fin, 'annulla').spenta).toBe(true)
    expect(voce(fin, 'pulisci').testo).toBe('Togli le finite (2)')
  })

  it('il bordo di una sezione: la misura iniziale', () => {
    expect(vociDivisore('la colonna dell’autopilota')).toEqual([{ id: 'iniziale', testo: 'Misura iniziale per la colonna dell’autopilota' }])
  })

  it('ogni builder dà voci che il main accetta così come sono', () => {
    const tutti = [
      vociChat({ remota: false, ibernata: false, pinAcceso: true, protetta: false, sposta: { finestre: [{ id: 1, titolo: 'F' }], workspace: ['W'] } }),
      vociSchedaPanoramica({ apribile: true, remota: false, soloMia: false, gestibile: true }),
      vociAutopilota({ dove: 'colonna' }), vociAltroPc({ nome: 'P', aperto: true }),
      vociProgetto({ scelto: false, azioni: [{ id: 'apri', titolo: 'Apri' }], quaderno: true }),
      vociSpecialista({ stato: 'fila', primo: false, ultimo: true }), vociDomanda({ aperta: false, filtro: 'tutte' }),
      vociFileTelefono({ inCorso: true, quanteFinite: 1 })
    ]
    for (const v of tutti) expect(vociValide(v)).toEqual(v)
  })
})
