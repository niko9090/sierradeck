import { describe, expect, it, vi } from 'vitest'
import { chiediAzionePc, creaEsecutoriLocali, eseguiAzionePc, rispondiAzione, type DipendenzeEsecutore } from '../../src/main/azione-pc'
import { ErroreRemoto } from '../../src/main/pc-remoto'
import { validaAzione } from '../../src/shared/azione-pc'
import type { CapacitaPc } from '../../src/shared/capacita-pc'

const cap = (o: Partial<CapacitaPc> = {}): CapacitaPc => ({ programmi: ['git', 'node'], telefono: false, aiutante: false, il: '2026-01-01T00:00:00.000Z', ...o })

function deps(c: CapacitaPc | undefined, extra: Partial<DipendenzeEsecutore['esecutori']> = {}): DipendenzeEsecutore {
  return {
    capacita: () => c,
    esecutori: {
      versioneProgramma: async (p) => ({ ok: true, valore: { versione: `${p} 1.2.3` } }),
      raggiungibile: async () => ({ ok: true, valore: { raggiungibile: true, ms: 5 } }),
      ...extra
    }
  }
}

describe('azione fra PC: chi riceve', () => {
  it('esegue un’azione valida e restituisce il risultato', async () => {
    const r = await eseguiAzionePc({ tipo: 'versione-programma', programma: 'git' }, deps(cap()))
    expect(r).toEqual({ ok: true, valore: { versione: 'git 1.2.3' } })
  })

  it('stato-programma dice se è installato, senza lanciarlo', async () => {
    const d = deps(cap())
    expect(await eseguiAzionePc({ tipo: 'stato-programma', programma: 'node' }, d)).toEqual({ ok: true, valore: { installato: true } })
    expect(await eseguiAzionePc({ tipo: 'stato-programma', programma: 'docker' }, d)).toEqual({ ok: true, valore: { installato: false } })
  })

  it('rifiuta un’azione sconosciuta con un motivo in italiano', async () => {
    const r = await eseguiAzionePc({ tipo: 'esegui-comando', comando: 'rm -rf /' }, deps(cap()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/non esiste/u)
  })

  it('rifiuta argomenti non validi', async () => {
    expect(validaAzione({ tipo: 'versione-programma', programma: 'git; calc' }).ok).toBe(false)
    expect(validaAzione({ tipo: 'raggiungibile', host: 'a b/c', porta: 80 }).ok).toBe(false)
    expect(validaAzione({ tipo: 'raggiungibile', host: 'server.locale', porta: 70000 }).ok).toBe(false)
    expect(validaAzione({ tipo: 'manda-file-telefono', percorso: 'relativo/file.txt' }).ok).toBe(false)
    expect(validaAzione('testo').ok).toBe(false)
    expect(validaAzione({ tipo: 'raggiungibile', host: 'server.locale', porta: 443 }).ok).toBe(true)
  })

  it('un PC senza la capacità rifiuta e non esegue niente', async () => {
    const mandaFileTelefono = vi.fn(async () => ({ ok: true as const, valore: { consegna: 'x', stato: 'conferma' } }))
    const versioneProgramma = vi.fn(async () => ({ ok: true as const, valore: { versione: '1' } }))
    const d = deps(cap({ telefono: false }), { mandaFileTelefono, versioneProgramma })
    const a = await eseguiAzionePc({ tipo: 'manda-file-telefono', percorso: '/tmp/a.txt' }, d)
    expect(a).toMatchObject({ ok: false })
    if (!a.ok) expect(a.motivo).toMatch(/telefono/u)
    const b = await eseguiAzionePc({ tipo: 'versione-programma', programma: 'docker' }, d)
    expect(b.ok).toBe(false)
    expect(mandaFileTelefono).not.toHaveBeenCalled()
    expect(versioneProgramma).not.toHaveBeenCalled()
  })

  it('senza capacità note (PC appena acceso) rifiuta dicendolo', async () => {
    const r = await eseguiAzionePc({ tipo: 'versione-programma', programma: 'git' }, deps(undefined))
    expect(r.ok).toBe(false)
  })

  it('un esecutore che lancia diventa un rifiuto, non un’eccezione', async () => {
    const d = deps(cap(), { raggiungibile: async () => { throw new Error('rete rotta') } })
    const r = await eseguiAzionePc({ tipo: 'raggiungibile', host: 'server.locale', porta: 80 }, d)
    expect(r).toMatchObject({ ok: false })
  })

  it('la rotta risponde solo a POST /api/azione', async () => {
    const d = deps(cap())
    expect(await rispondiAzione({ metodo: 'POST', percorso: '/api/altro', corpo: {} }, d)).toBeUndefined()
    expect((await rispondiAzione({ metodo: 'GET', percorso: '/api/azione', corpo: undefined }, d))?.stato).toBe(405)
    const ok = await rispondiAzione({ metodo: 'POST', percorso: '/api/azione', corpo: { tipo: 'versione-programma', programma: 'node' } }, d)
    expect(ok).toEqual({ stato: 200, corpo: { ok: true, valore: { versione: 'node 1.2.3' } } })
    expect((await rispondiAzione({ metodo: 'POST', percorso: '/api/azione', corpo: {} }, undefined))?.stato).toBe(404)
  })
})

describe('azione fra PC: chi chiede', () => {
  const azione = { tipo: 'versione-programma', programma: 'git' }

  it('manda la richiesta e torna il risultato', async () => {
    const chiama = vi.fn(async () => ({ ok: true, valore: { versione: 'git 9' } }))
    const r = await chiediAzionePc({ chiama }, 'pc-1', azione)
    expect(r).toEqual({ ok: true, valore: { versione: 'git 9' } })
    expect(chiama).toHaveBeenCalledWith('pc-1', '/api/azione', azione)
  })

  it('non disturba un PC che nel battito dice di non avere la capacità', async () => {
    const chiama = vi.fn()
    const r = await chiediAzionePc({ chiama }, 'pc-1', { tipo: 'manda-file-telefono', percorso: '/tmp/a' }, { capacitaDi: cap({ telefono: false }) })
    expect(r.ok).toBe(false)
    expect(chiama).not.toHaveBeenCalled()
  })

  it('rifiuta subito un’azione sconosciuta, senza chiamare', async () => {
    const chiama = vi.fn()
    const r = await chiediAzionePc({ chiama }, 'pc-1', { tipo: 'shell', riga: 'dir' })
    expect(r.ok).toBe(false)
    expect(chiama).not.toHaveBeenCalled()
  })

  it('scade se quel PC non risponde', async () => {
    vi.useFakeTimers()
    try {
      const chiama = vi.fn(() => new Promise<unknown>(() => {}))
      const p = chiediAzionePc({ chiama }, 'pc-1', azione, { scadenzaMs: 3000 })
      await vi.advanceTimersByTimeAsync(3001)
      const r = await p
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.motivo).toMatch(/3 secondi/u)
    } finally { vi.useRealTimers() }
  })

  it('un errore del canale diventa un rifiuto con il suo motivo', async () => {
    const chiama = vi.fn(async () => { throw new ErroreRemoto('irraggiungibile', 'Quel PC non risponde.') })
    expect(await chiediAzionePc({ chiama }, 'pc-1', azione)).toEqual({ ok: false, motivo: 'Quel PC non risponde.' })
  })

  it('una risposta di forma strana (PC vecchio) è un rifiuto', async () => {
    const r = await chiediAzionePc({ chiama: async () => ({ qualcosa: 1 }) }, 'pc-1', azione)
    expect(r.ok).toBe(false)
  })
})

describe('esecutori locali', () => {
  it('versione: prende la prima riga non vuota, anche da stderr, e usa un solo argomento fisso', async () => {
    const lancia = vi.fn((_f: string, _a: string[], _o: unknown, cb: (e: Error | null, o: string, s: string) => void) => cb(null, '', '\nopenjdk version "21"\naltro'))
    const e = creaEsecutoriLocali({ lancia })
    expect(await e.versioneProgramma('java')).toEqual({ ok: true, valore: { versione: 'openjdk version "21"' } })
    expect(lancia.mock.calls[0]?.[1]).toEqual(['-version'])
  })

  it('versione: programma che non parte = rifiuto con motivo', async () => {
    const e = creaEsecutoriLocali({ lancia: (_f, _a, _o, cb) => cb(new Error('ENOENT'), '', '') })
    const r = await e.versioneProgramma('git')
    expect(r.ok).toBe(false)
  })
})
