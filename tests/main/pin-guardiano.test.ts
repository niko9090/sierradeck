import { describe, it, expect } from 'vitest'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'

/** 0.49.0: il guardiano del PIN, con un orologio finto. */
function guardiano(): { g: ReturnType<typeof creaGuardianoPin>; disco: unknown[]; ora: { t: number } } {
  const disco: unknown[] = []
  const ora = { t: 1_000_000 }
  const g = creaGuardianoPin({
    leggi: () => undefined,
    scrivi: (p) => { disco.push(JSON.parse(JSON.stringify(p))) },
    passphraseGiusta: async (p) => p === 'la passphrase lunga della cassaforte',
    adesso: () => ora.t
  })
  return { g, disco, ora }
}
const CHAT = { id: 'p-1', sessione: 's1', workspace: 'Lavoro' }

describe('il guardiano del PIN', () => {
  it('sul disco solo l’impronta, mai il PIN; il pannello non vede nemmeno l’impronta', async () => {
    const { g, disco } = guardiano()
    expect(await g.impostaPin('48213')).toEqual({ ok: true })
    expect(JSON.stringify(disco)).not.toContain('48213')
    expect(JSON.stringify(disco)).toContain('scrypt')
    expect(g.stato()).toMatchObject({ attivo: true, impostato: true })
    expect(JSON.stringify(g.stato())).not.toContain('scrypt')
  })
  it('una chat protetta è chiusa per tutti finché ognuno non mette il PIN; poi si richiude dopo l’inattività', async () => {
    const { g, ora } = guardiano()
    await g.impostaPin('4821')
    g.proteggiChat('s1', true)
    expect(g.chiusa('locale', CHAT)).toBe(true)
    expect(g.sblocca('tel:1', CHAT, '0000')).toMatchObject({ ok: false, errore: 'PIN sbagliato.' })
    expect(g.sblocca('tel:1', CHAT, '4821')).toEqual({ ok: true })
    expect(g.chiusa('tel:1', CHAT)).toBe(false)
    expect(g.chiusa('locale', CHAT)).toBe(true)
    ora.t += 16 * 60_000
    expect(g.chiusa('tel:1', CHAT)).toBe(true)
  })
  it('per workspace; spento il PIN, niente è chiuso', async () => {
    const { g } = guardiano()
    await g.impostaPin('4821')
    g.proteggiWorkspace('Lavoro', true)
    expect(g.chiusa('locale', { sessione: 's9', workspace: 'Lavoro' })).toBe(true)
    g.attiva(false)
    expect(g.chiusa('locale', { sessione: 's9', workspace: 'Lavoro' })).toBe(false)
  })
  it('i tentativi sono uno solo per tutte le strade: tre sbagliati da tre posti diversi, e anche il giusto aspetta', async () => {
    const { g, ora } = guardiano()
    await g.impostaPin('4821')
    g.proteggiChat('s1', true)
    g.sblocca('locale', CHAT, '1111')
    g.sblocca('tel:1', CHAT, '2222')
    expect(g.sblocca('pc:LAPTOP', CHAT, '3333')).toMatchObject({ ok: false, fraMs: 30_000 })
    expect(g.sblocca('tel:1', CHAT, '4821')).toMatchObject({ ok: false, fraMs: 30_000 })
    ora.t += 30_000
    expect(g.sblocca('tel:1', CHAT, '4821')).toEqual({ ok: true })
  })
  it('cambiare il PIN chiede quello di adesso; azzerarlo chiede la password della cassaforte', async () => {
    const { g } = guardiano()
    await g.impostaPin('4821')
    expect((await g.impostaPin('9999')).ok).toBe(false)
    expect((await g.impostaPin('9999', '4821')).ok).toBe(true)
    expect((await g.azzera('sbagliata')).ok).toBe(false)
    expect(await g.azzera('la passphrase lunga della cassaforte')).toEqual({ ok: true })
    expect(g.stato()).toMatchObject({ attivo: false, impostato: false })
    expect(g.attiva(true).ok).toBe(false)
  })
})
