import { describe, it, expect } from 'vitest'
import { spostaRiquadro, spostaInWorkspace, type SpostamentoDeps } from '../../src/renderer/spostamento'
import type { PaneSalvato } from '@shared/workspace'

const PANE: PaneSalvato = {
  id: 'pane-1', sessionUuid: 'u-1', cwd: 'C:\\p', title: 'Chat', ptyId: 'pty-1'
}

function ambiente(opts: { staccato?: PaneSalvato; errore?: unknown } = {}) {
  const chiamate: string[] = []
  const accolti: PaneSalvato[] = []
  const segnalati: unknown[] = []

  const deps: SpostamentoDeps = {
    stacca: (paneId) => {
      chiamate.push(`stacca:${paneId}`)
      return 'staccato' in opts ? opts.staccato : PANE
    },
    sposta: (pane, finestraId) => {
      chiamate.push(`sposta:${pane.id}->${finestraId}`)
      return opts.errore !== undefined ? Promise.reject(opts.errore) : Promise.resolve(true)
    },
    accogli: (pane) => { chiamate.push(`accogli:${pane.id}`); accolti.push(pane) },
    segnala: (err) => { segnalati.push(err) }
  }

  return { deps, chiamate, accolti, segnalati }
}

describe('spostaRiquadro', () => {
  it('stacca il riquadro e lo manda alla finestra scelta', async () => {
    const a = ambiente()
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.chiamate).toEqual(['stacca:pane-1', 'sposta:pane-1->7'])
    expect(a.accolti).toEqual([])
    expect(a.segnalati).toEqual([])
  })

  it('rimette il riquadro dov era se lo spostamento fallisce', async () => {
    // Senza questo ramo un errore produce esattamente l'orfano che il progetto
    // ha lavorato per eliminare: la sessione resta viva ma nessuna finestra la
    // disegna, quindi e' invisibile e irraggiungibile.
    const a = ambiente({ errore: new Error('finestra sparita') })
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.chiamate).toEqual(['stacca:pane-1', 'sposta:pane-1->7', 'accogli:pane-1'])
    expect(a.accolti[0]).toEqual(PANE)
    expect(String(a.segnalati[0])).toContain('finestra sparita')
  })

  it('non chiede niente al Core se il riquadro non esiste piu', async () => {
    const a = ambiente({ staccato: undefined })
    await spostaRiquadro(a.deps, 'sparito', 7)
    expect(a.chiamate).toEqual(['stacca:sparito'])
  })
})

describe('spostaInWorkspace', () => {
  function ambiente(opts: { ptyId?: string; fallisce?: boolean } = {}) {
    const fatti: string[] = []
    const pane: PaneSalvato = {
      id: 'p1',
      sessionUuid: 'u1',
      cwd: 'C:\p',
      title: 'chat',
      ...(opts.ptyId !== undefined ? { ptyId: opts.ptyId } : {})
    }
    const deps = {
      stacca: (id: string) => {
        fatti.push(`stacca:${id}`)
        return pane
      },
      consegna: (dove: string, p: PaneSalvato) => {
        fatti.push(`consegna:${dove}:${p.id}`)
        return opts.fallisce === true
          ? Promise.reject(new Error('destinazione inesistente'))
          : Promise.resolve(true)
      },
      ricorda: (dove: string) => { fatti.push(`ricorda:${dove}`) },
      chiudiTerminale: (ptyId: string) => { fatti.push(`chiudi:${ptyId}`) },
      dimentica: (id: string) => { fatti.push(`dimentica:${id}`) },
      accogli: (p: PaneSalvato) => { fatti.push(`accogli:${p.id}`) },
      segnala: () => { fatti.push('segnala') }
    }
    return { deps, fatti, pane }
  }

  it('chiude il terminale della chat spostata: senza, resta un claude.exe senza padrone', async () => {
    // `staccaPane` mette il riquadro fra i «ceduti», che dicono al Terminal di
    // staccare invece di chiudere: giusto verso un'altra finestra, dove qualcuno
    // riprende subito il pty; qui non lo riprende nessuno, perche' a
    // destinazione il riquadro arriva senza ptyId e ripartira' con --resume.
    const a = ambiente({ ptyId: 'pty-1' })
    await spostaInWorkspace(a.deps, 'p1', 'Altro')
    expect(a.fatti).toEqual([
      'stacca:p1',
      'consegna:Altro:p1',
      'ricorda:Altro',
      'chiudi:pty-1',
      'dimentica:p1'
    ])
  })

  it('chiude dopo la consegna, non prima', async () => {
    // Chiudendo prima, un fallimento lascerebbe la chat al suo posto ma morta.
    const a = ambiente({ ptyId: 'pty-1' })
    await spostaInWorkspace(a.deps, 'p1', 'Altro')
    expect(a.fatti.indexOf('chiudi:pty-1')).toBeGreaterThan(a.fatti.indexOf('consegna:Altro:p1'))
  })

  it('se la consegna fallisce rimette la chat dov era, terminale compreso', async () => {
    const a = ambiente({ ptyId: 'pty-1', fallisce: true })
    await spostaInWorkspace(a.deps, 'p1', 'Altro')
    expect(a.fatti).toEqual(['stacca:p1', 'consegna:Altro:p1', 'accogli:p1', 'segnala'])
    expect(a.fatti).not.toContain('chiudi:pty-1')
  })

  it('una chat senza terminale acceso non fa chiudere niente', async () => {
    // Un ptyId che non c'e' manderebbe al Core un id inesistente.
    const a = ambiente()
    await spostaInWorkspace(a.deps, 'p1', 'Altro')
    expect(a.fatti.some((f) => f.startsWith('chiudi:'))).toBe(false)
    expect(a.fatti).toContain('dimentica:p1')
  })
})

describe('i «ceduti» dopo uno spostamento fra finestre', () => {
  /** Come sopra, ma con la `dimentica` collegata: e' quella la novita'. */
  function conDimentica(opts: { errore?: unknown } = {}) {
    const dimenticati: string[] = []
    const deps: SpostamentoDeps = {
      stacca: () => PANE,
      sposta: () => (opts.errore !== undefined ? Promise.reject(opts.errore) : Promise.resolve(true)),
      dimentica: (id) => { dimenticati.push(id) },
      accogli: () => undefined,
      segnala: () => undefined
    }
    return { deps, dimenticati }
  }

  it('a consegna avvenuta il riquadro esce dai ceduti', async () => {
    // Restava li' per sempre: una voce per spostamento, per tutta la sessione.
    // E' lo stesso difetto gia' chiuso per lo spostamento fra workspace, qui
    // rimasto aperto perche' il ramo di successo non toccava niente.
    const a = conDimentica()
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.dimenticati).toEqual(['pane-1'])
  })

  it('se la consegna fallisce NON esce dai ceduti', async () => {
    // Il riquadro torna a casa: toglierlo dai ceduti vorrebbe dire che
    // chiuderlo non ucciderebbe piu' il suo claude.exe.
    const a = conDimentica({ errore: new Error('finestra sparita') })
    await spostaRiquadro(a.deps, 'pane-1', 7)
    expect(a.dimenticati).toEqual([])
  })

  it('un riquadro gia sparito non tocca niente', async () => {
    const dimenticati: string[] = []
    await spostaRiquadro(
      {
        stacca: () => undefined,
        sposta: () => Promise.resolve(true),
        dimentica: (id) => { dimenticati.push(id) },
        accogli: () => undefined,
        segnala: () => undefined
      },
      'pane-1',
      7
    )
    expect(dimenticati).toEqual([])
  })
})
