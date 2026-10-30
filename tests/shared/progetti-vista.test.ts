import { describe, it, expect } from 'vitest'
import type { Problema, RigaProgetto } from '@shared/pannello-drive'
import type { VistaSposta } from '@shared/sposta'
import { azioniDivise, cercaProgetti, contaGruppi, conVista, copieDi, nelGruppo, ordinaProgetti, ragioneProblemi, statoProgetto, testoChat, testoSpazio, vistaDi } from '@shared/progetti-vista'

/**
 * La vista «Progetti» rifatta (0.69.0): «rifai il menu Progetti!! non si
 * capisce nulla» (Nicholas, 12/10). Stato in una parola, gruppi, ricerca e
 * ordinamento come funzioni pure.
 */
const riga = (x: Partial<RigaProgetto> = {}): RigaProgetto => ({
  id: 'p1', ids: ['p1'], nome: 'Gestionale', voluto: true, cartelle: [], cartellaQui: false, workspace: [], daUnire: 0,
  azioni: [], chat: 0, chatSenzaNome: 0, stato: 'residente', problemi: [], ...x
})
const problema = (tipo: Problema['tipo'], titolo: string = tipo): Problema => ({ tipo, titolo, spiega: '', cosaFare: '' })
const sposta = (x: Partial<VistaSposta> = {}): VistaSposta => ({
  progetto: 'p1', nome: 'Gestionale', daNome: 'PC-A', fase: 'scarico', messaggio: '', percorso: 'C:\\P\\Gestionale', ...x
})

describe('lo stato in una parola', () => {
  it('a posto, al lavoro, da sistemare, spostamento in corso', () => {
    expect(statoProgetto(riga())).toEqual({ id: 'a-posto', parola: 'a posto', colore: 'verde' })
    expect(statoProgetto(riga({ alLavoro: 2 }))).toMatchObject({ id: 'al-lavoro', ragione: '2 chat', colore: 'blu' })
    expect(statoProgetto(riga({ problemi: [problema('casa-assente')] }))).toMatchObject({ id: 'da-sistemare', ragione: 'PC assente da tempo', colore: 'ambra' })
    expect(statoProgetto(riga(), { sposta: sposta() })).toMatchObject({ id: 'spostamento', ragione: 'passo 3 di 6' })
    expect(statoProgetto(riga(), { sposta: sposta({ fase: 'attesa-proprietario' }) })).toMatchObject({ id: 'spostamento', ragione: 'aspetta PC-A' })
  })
  it('vince il più importante: spostamento > da sistemare > al lavoro', () => {
    const r = riga({ alLavoro: 1, problemi: [problema('casa-assente')] })
    expect(statoProgetto(r).id).toBe('da-sistemare')
    expect(statoProgetto(r, { sposta: sposta() }).id).toBe('spostamento')
  })
  it('uno spostamento fallito è da sistemare; uno finito, o di un altro progetto, non conta', () => {
    expect(statoProgetto(riga(), { sposta: sposta({ fase: 'fallita' }) })).toMatchObject({ id: 'da-sistemare', ragione: 'spostamento fermo' })
    expect(statoProgetto(riga(), { sposta: sposta({ fase: 'fatta' }) }).id).toBe('a-posto')
    expect(statoProgetto(riga(), { sposta: sposta({ progetto: 'altro' }) }).id).toBe('a-posto')
  })
  it('un PC sconosciuto è rosso', () => {
    expect(statoProgetto(riga({ problemi: [problema('casa-sconosciuta')] })).colore).toBe('rosso')
  })
  it('la ragione: il problema più grave, con +N', () => {
    expect(ragioneProblemi([problema('casa-assente'), problema('casa-sconosciuta')])).toBe('PC sconosciuto +1')
    expect(ragioneProblemi([problema('progetto-senza-casa')])).toBe('senza proprietario')
    expect(ragioneProblemi([])).toBeUndefined()
  })
})

describe('le colonne', () => {
  const r = riga({
    residente: { pc: 'a', nome: 'PC-Fisso', qui: false },
    cartelle: [{ pc: 'a', nome: 'PC-Fisso', percorso: 'E:\\G' }, { pc: 'b', nome: 'Portatile', percorso: 'C:\\G' }, { pc: 'c', nome: 'Ufficio', percorso: 'D:\\G' }],
    chat: 14, chatSenzaNome: 2, alLavoro: 1, spazioDrive: { byte: 340 * 1024 * 1024, file: 10, grandi: [{ percorso: 'v.mp4', byte: 30 * 1024 * 1024 }] }
  })
  it('dove vive, copie, chat, spazio', () => {
    const v = vistaDi(r)
    expect(v.dove).toBe('PC-Fisso')
    expect(copieDi(r)).toEqual({ testo: '2 PC', nomi: ['Portatile', 'Ufficio'] })
    expect(testoChat(r).testo).toBe('12 · 1 al lavoro')
    expect(testoSpazio(r.spazioDrive)).toMatchObject({ testo: '340 MB', avviso: true })
    expect(testoSpazio(undefined).testo).toBe('—')
    expect(vistaDi(riga({ residente: { pc: 'q', nome: 'X', qui: true } })).dove).toBe('Questo PC')
  })
})

describe('gruppi, ricerca e ordine', () => {
  const qui = riga({ id: 'q', ids: ['q'], nome: 'Sito Città', residente: { pc: 'io', nome: 'PC', qui: true }, cartellaQui: true, ultimoUso: '2026-10-10' })
  const la = riga({ id: 'l', ids: ['l'], nome: 'App', residente: { pc: 'b', nome: 'Portatile', qui: false }, spazioDrive: { byte: 10, file: 1, grandi: [] }, ultimoUso: '2026-10-12' })
  const rotto = riga({ id: 'r', ids: ['r'], nome: 'Vecchio', problemi: [problema('progetto-senza-casa')], cartelle: [{ pc: 'b', nome: 'Portatile', percorso: 'X:\\Vecchio' }] })
  const tutti = conVista({ progetti: [qui, la, rotto] }, {}).progetti

  it('i gruppi si contano, e «Tutti» è il totale', () => {
    expect(contaGruppi(tutti)).toEqual({ 'questo-pc': 1, 'altri-pc': 2, 'da-sistemare': 1, tutti: 3 })
    expect(tutti.filter((r) => nelGruppo(r, 'da-sistemare')).map((r) => r.nome)).toEqual(['Vecchio'])
  })
  it('la ricerca guarda nome, PC e cartelle, senza accenti né maiuscole', () => {
    expect(cercaProgetti(tutti, 'citta').map((r) => r.nome)).toEqual(['Sito Città'])
    expect(cercaProgetti(tutti, 'portatile').map((r) => r.nome)).toEqual(['App', 'Vecchio'])
    expect(cercaProgetti(tutti, 'x:\\vecchio').map((r) => r.nome)).toEqual(['Vecchio'])
    expect(cercaProgetti(tutti, '  ')).toHaveLength(3)
  })
  it('per stato: prima quello da sistemare, poi il più usato di recente', () => {
    expect(ordinaProgetti(tutti).map((r) => r.nome)).toEqual(['Vecchio', 'App', 'Sito Città'])
  })
  it('per nome nei due versi; i «—» sempre in fondo', () => {
    expect(ordinaProgetti(tutti, 'nome').map((r) => r.nome)).toEqual(['App', 'Sito Città', 'Vecchio'])
    expect(ordinaProgetti(tutti, 'nome', 'giu').map((r) => r.nome)).toEqual(['Vecchio', 'Sito Città', 'App'])
    expect(ordinaProgetti(tutti, 'spazio', 'giu').map((r) => r.nome)).toEqual(['App', 'Sito Città', 'Vecchio'])
    expect(ordinaProgetti(tutti, 'dove').map((r) => r.nome)).toEqual(['Sito Città', 'App', 'Vecchio'])
  })
})

describe('le azioni', () => {
  it('Apri è la principale; «Sposta su questo PC» a parte, con la sua conferma', () => {
    expect(azioniDivise([{ id: 'apri-remoto' }, { id: 'sposta-qui' }])).toEqual({ primaria: { id: 'apri-remoto' }, secondarie: [], pericolo: { id: 'sposta-qui' } })
    expect(azioniDivise([{ id: 'apri' }])).toEqual({ primaria: { id: 'apri' }, secondarie: [] })
  })
})

describe('la copia di questo PC', () => {
  it('si chiama «questo PC»', () => {
    const r = riga({ residente: { pc: 'b', nome: 'Portatile', qui: false }, cartelle: [{ pc: 'b', nome: 'Portatile', percorso: 'D:\G' }, { pc: 'io', nome: 'PC-Fisso', percorso: 'E:\G' }] })
    expect(conVista({ io: { id: 'io' }, progetti: [r] }, {}).progetti[0]?.vista?.copie.testo).toBe('questo PC')
  })
})
