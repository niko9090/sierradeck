import { describe, it, expect } from 'vitest'
import { gruppoChat, nomiDistinti, riassuntoWorkspace, rigaUtile, statoAggiornamento, statoChat } from '@shared/chat-vista'
import { peggiore, trova } from '@shared/stato-vista'

/** La schermata principale (0.70.0): lo stato di ogni chat in una parola. */
describe('lo stato di una chat', () => {
  it('chi chiede te vince su tutto', () => {
    expect(statoChat({ chiede: true, lavora: true, governata: true }).parola).toBe('aspetta te')
    expect(statoChat({ errore: '529 overloaded', lavora: true })).toMatchObject({ id: 'errore', colore: 'rosso', ragione: '529 overloaded' })
    expect(statoChat({ lavora: true }).parola).toBe('al lavoro')
    expect(statoChat({ lavora: true, governata: true }).parola).toBe('autopilota')
    expect(statoChat({ dorme: true }).parola).toBe('dorme')
    expect(statoChat({ altrove: 'PORTATILE' }).parola).toBe('su PORTATILE')
    expect(statoChat({})).toMatchObject({ parola: 'ferma', colore: 'quieto' })
  })
  it('il workspace prende il peggiore, con quante sono', () => {
    expect(riassuntoWorkspace([statoChat({ lavora: true }), statoChat({ chiede: true }), statoChat({ chiede: true })])).toMatchObject({ numero: 2, stato: { id: 'aspetta' } })
    expect(riassuntoWorkspace([]).numero).toBe(0)
  })
  it('i gruppi della pagina e dell’app', () => {
    expect(gruppoChat(statoChat({ chiede: true }))).toBe('aspettano')
    expect(gruppoChat(statoChat({ lavora: true }))).toBe('lavorano')
    expect(gruppoChat(statoChat({}))).toBe('altre')
  })
})

describe('nomi e righe', () => {
  it('tre chat con lo stesso nome si distinguono', () => {
    const n = nomiDistinti([{ id: 'a', titolo: 'Lavoro' }, { id: 'b', titolo: 'Lavoro' }, { id: 'c', titolo: 'Altro' }, { id: 'd', titolo: 'Lavoro' }])
    expect([...n.values()]).toEqual(['Lavoro', 'Lavoro #2', 'Altro', 'Lavoro #3'])
  })
  it('l’ultima riga utile salta i piedi di Claude Code', () => {
    expect(rigaUtile(['> Ho finito il refactoring', '', '─────────', 'Enter to confirm · Esc to cancel', '? for shortcuts'])).toBe('> Ho finito il refactoring')
    expect(rigaUtile([])).toBe('')
  })
  it('l’aggiornamento: una parola solo quando c’è da dire', () => {
    expect(statoAggiornamento({ fase: 'cerco' })).toBeUndefined()
    expect(statoAggiornamento({ fase: 'pronto' })?.colore).toBe('verde')
    expect(statoAggiornamento({ fase: 'errore' })?.colore).toBe('rosso')
  })
  it('stato-vista: il peggiore e la ricerca senza accenti', () => {
    expect(peggiore([{ id: 'b', parola: 'b', colore: 'blu' }, { id: 'a', parola: 'a', colore: 'ambra' }], ['a', 'b'])?.id).toBe('a')
    expect(trova('Città di prova', 'citta prova')).toBe(true)
    expect(trova('Città', 'mare')).toBe(false)
  })
})

import { ultimaRigaDalloSchermo } from '../../src/renderer/ultime-righe'
describe('l’ultima riga mandata al telefono (0.70.0)', () => {
  it('salta «Enter to confirm · Esc to cancel»: si leggeva al posto della chat', () => {
    expect(ultimaRigaDalloSchermo(['❯ 1. Yes, I trust this folder', '  2. No, exit', '', 'Enter to confirm · Esc to cancel'])).toBe('2. No, exit')
    expect(ultimaRigaDalloSchermo(['Fatto il refactoring', ' · Esc to cancel'])).toBe('Fatto il refactoring')
  })
})
