import { describe, it, expect, vi } from 'vitest'
import { creaAggancio, type AggancioDeps } from '../../src/renderer/aggancio'
import type { HostToCore } from '@shared/protocol'

function ambiente(opts: { ptyIdIniziale?: string } = {}) {
  const scritti: string[] = []
  const inviati: { tipo: string; id?: string }[] = []
  const ascoltatori = new Map<string, (msg: HostToCore) => void>()
  let idAscoltato: string | undefined
  let risolviSpawn: ((id: string) => void) | undefined
  let rifiutaSpawn: ((err: unknown) => void) | undefined

  const deps: AggancioDeps = {
    ptyIdIniziale: opts.ptyIdIniziale,
    dimensioni: () => ({ cols: 80, rows: 24 }),
    spawn: () => {
      inviati.push({ tipo: 'spawn' })
      return new Promise<string>((ris, rif) => { risolviSpawn = ris; rifiutaSpawn = rif })
    },
    attach: (id) => { inviati.push({ tipo: 'attach', id }) },
    write: (id, d) => { inviati.push({ tipo: 'write', id }); scritti.push(`->${d}`) },
    resize: (id) => { inviati.push({ tipo: 'resize', id }) },
    kill: (id) => { inviati.push({ tipo: 'kill', id }) },
    // Il finto instrada per id e la disiscrizione riguarda un id solo, come fa
    // il bus vero (src/renderer/pty-bus.ts): un finto piu' permissivo del reale
    // renderebbe verdi test che nella realta' fallirebbero — per esempio uno in
    // cui due agganci convivono e i messaggi dell'uno finiscono all'altro.
    ascolta: (id, cb) => {
      idAscoltato = id
      ascoltatori.set(id, cb)
      return () => { ascoltatori.delete(id) }
    },
    scarta: (id) => {
      inviati.push({ tipo: 'scarta', id })
      // Come `dimentica` nel bus vero: scartare un id smette davvero di
      // consegnarlo, non solo annota che e' stato scartato.
      ascoltatori.delete(id)
    },
    scrivi: (testo) => { scritti.push(testo) },
    annunciaId: vi.fn()
  }

  return {
    deps,
    scritti,
    inviati,
    idAscoltato: () => idAscoltato,
    consegna: (msg: HostToCore) => ascoltatori.get(msg.id)?.(msg),
    risolviSpawn: (id: string) => risolviSpawn?.(id),
    rifiutaSpawn: (err: unknown) => rifiutaSpawn?.(err)
  }
}

describe('creaAggancio — senza ptyId iniziale', () => {
  it('rilancia subito e annuncia l id ottenuto', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    expect(a.inviati).toEqual([{ tipo: 'spawn' }])
    a.risolviSpawn('nuovo')
    await Promise.resolve()
    expect(agg.idCorrente()).toBe('nuovo')
    expect(a.deps.annunciaId).toHaveBeenCalledWith('nuovo')
  })

  it('mostra nel riquadro un avvio fallito invece di perderlo', async () => {
    const a = ambiente()
    creaAggancio(a.deps).avvia()
    a.rifiutaSpawn(new Error('niente da fare'))
    await Promise.resolve(); await Promise.resolve()
    expect(a.scritti.join('')).toContain('niente da fare')
  })

  it('se viene chiuso prima che lo spawn risponda, chiude il pty che arriva', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    agg.chiudi()
    a.risolviSpawn('tardivo')
    await Promise.resolve()
    // Senza questo il pty resterebbe vivo senza nessuno che lo guardi: e' la
    // via principale con cui si creano orfani.
    expect(a.inviati).toContainEqual({ tipo: 'kill', id: 'tardivo' })
    expect(a.inviati).toContainEqual({ tipo: 'scarta', id: 'tardivo' })
  })
})

describe('creaAggancio — con ptyId iniziale', () => {
  it('chiede il riaggancio e non rilancia', () => {
    const a = ambiente({ ptyIdIniziale: 'p1' })
    creaAggancio(a.deps).avvia()
    expect(a.inviati).toEqual([{ tipo: 'attach', id: 'p1' }])
    expect(a.idAscoltato()).toBe('p1')
  })

  it('scrive lo scrollback ricevuto e resta agganciato', () => {
    const a = ambiente({ ptyIdIniziale: 'p1' })
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.consegna({ id: 'p1', kind: 'scrollback', data: 'CRONOLOGIA' })
    expect(a.scritti.join('')).toContain('CRONOLOGIA')
    expect(agg.idCorrente()).toBe('p1')
    expect(a.inviati.some((i) => i.tipo === 'spawn')).toBe(false)
  })

  it('rilancia se il terminale non esiste piu', async () => {
    const a = ambiente({ ptyIdIniziale: 'morto' })
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.consegna({ id: 'morto', kind: 'assente' })
    expect(a.inviati.some((i) => i.tipo === 'spawn')).toBe(true)
    a.risolviSpawn('rinato')
    await Promise.resolve()
    expect(agg.idCorrente()).toBe('rinato')
    expect(a.deps.annunciaId).toHaveBeenCalledWith('rinato')
  })

  it('dopo la chiusura nessun messaggio raggiunge piu il riquadro', () => {
    const a = ambiente({ ptyIdIniziale: 'morto' })
    const agg = creaAggancio(a.deps)
    agg.avvia()
    agg.chiudi()

    // La protezione e' la disiscrizione dentro `chiudi()`, non una guardia nel
    // ramo `assente`: dopo di essa il bus non consegna piu' a questo aggancio.
    // Se qualcuno togliesse la disiscrizione, `assente` arriverebbe e farebbe
    // partire un rilancio — ed e' esattamente cio' che questa asserzione
    // intercetta.
    a.consegna({ id: 'morto', kind: 'assente' })
    a.consegna({ id: 'morto', kind: 'data', data: 'dopo la chiusura' })

    expect(a.inviati.some((i) => i.tipo === 'spawn')).toBe(false)
    expect(a.scritti.join('')).not.toContain('dopo la chiusura')
  })

  it('uno scrollback vuoto non fa rilanciare', () => {
    const a = ambiente({ ptyIdIniziale: 'p1' })
    creaAggancio(a.deps).avvia()
    a.consegna({ id: 'p1', kind: 'scrollback', data: '' })
    // Un pty appena avviato che non ha ancora scritto nulla e' vivo: rilanciare
    // creerebbe un secondo claude.exe sulla stessa sessione.
    expect(a.inviati.some((i) => i.tipo === 'spawn')).toBe(false)
  })

  it('inoltra dati, uscita ed errori al riquadro', () => {
    const a = ambiente({ ptyIdIniziale: 'p1' })
    creaAggancio(a.deps).avvia()
    a.consegna({ id: 'p1', kind: 'data', data: 'ciao' })
    a.consegna({ id: 'p1', kind: 'exit', code: 0 })
    a.consegna({ id: 'p1', kind: 'error', message: 'guasto' })
    const tutto = a.scritti.join('')
    expect(tutto).toContain('ciao')
    expect(tutto).toContain('terminata')
    expect(tutto).toContain('guasto')
  })
})

describe('creaAggancio — interazione', () => {
  it('non scrive né ridimensiona prima di avere un id', () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    agg.scrivi('x')
    agg.ridimensiona(100, 40)
    expect(a.inviati.filter((i) => i.tipo === 'write' || i.tipo === 'resize')).toEqual([])
  })

  it('scrive e ridimensiona verso l id corrente', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.risolviSpawn('p9')
    await Promise.resolve()
    agg.scrivi('x')
    agg.ridimensiona(100, 40)
    expect(a.inviati).toContainEqual({ tipo: 'write', id: 'p9' })
    expect(a.inviati).toContainEqual({ tipo: 'resize', id: 'p9' })
  })

  it('chiudendo termina il pty e smette di ascoltare', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.risolviSpawn('p9')
    await Promise.resolve()
    agg.chiudi()
    expect(a.inviati).toContainEqual({ tipo: 'kill', id: 'p9' })
    a.consegna({ id: 'p9', kind: 'data', data: 'dopo la chiusura' })
    expect(a.scritti.join('')).not.toContain('dopo la chiusura')
  })
})

describe('creaAggancio — cessione a un altra finestra', () => {
  it('staccando smette di ascoltare ma NON chiude il terminale', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.risolviSpawn('p9')
    await Promise.resolve()

    agg.stacca()
    // La differenza con chiudi() e' tutta qui: il pty deve sopravvivere, perche'
    // un'altra finestra sta per riagganciarvisi.
    expect(a.inviati.some((i) => i.tipo === 'kill')).toBe(false)
    a.consegna({ id: 'p9', kind: 'data', data: 'dopo lo stacco' })
    expect(a.scritti.join('')).not.toContain('dopo lo stacco')
  })

  it('dopo stacca, chiudi non uccide il terminale ceduto', async () => {
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    a.risolviSpawn('p9')
    await Promise.resolve()
    agg.stacca()
    agg.chiudi()
    // React chiama comunque la pulizia dell'effetto dopo lo smontaggio: senza
    // questa garanzia lo spostamento ucciderebbe la sessione appena ceduta.
    expect(a.inviati.some((i) => i.tipo === 'kill')).toBe(false)
  })

  it('dopo stacca, uno spawn tardivo non lascia un terminale orfano', async () => {
    // Cedere un riquadro che sta ancora aspettando il proprio spawn: l'id che
    // arriva non appartiene a nessuno — la finestra di destinazione non lo
    // conosce — e senza kill resterebbe vivo e invisibile.
    const a = ambiente()
    const agg = creaAggancio(a.deps)
    agg.avvia()
    agg.stacca()
    a.risolviSpawn('tardivo')
    await Promise.resolve()
    expect(a.inviati).toContainEqual({ tipo: 'kill', id: 'tardivo' })
  })
})
