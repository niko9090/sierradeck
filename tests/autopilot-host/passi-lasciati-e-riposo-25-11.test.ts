import { describe, it, expect } from 'vitest'
import { creaTurni, TurnoLasciato, TurnoScaduto } from '../../src/autopilot-host/turni-criteri'
import { fraseRiposo, fraseUscitaDopoScadenze, oraBreve } from '../../src/autopilot-host/unioni-che-scadono'
import { lavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { codaVuota, type Coda } from '../../src/shared/coda-richieste'
import type { CompitoPiano, Piano } from '../../src/shared/piano-orchestratore'

/**
 * 25/11 (sera): **un passo git in fila non tiene il posto per chi se n'è andato**, e **il riposo dopo troppe
 * scadenze vale per tutte le strade**. Prima un passo della chiusura di una prova già scaduta restava in fila
 * fino al suo limite di 12 minuti (e intanto la cartella era ferma per i comandi pesanti e per le chat); e
 * unisci, anche quello mandato dalla spinta del lavoro fermo, faceva ripartire l'unione a riposo.
 */

const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))

describe('il passo git in fila lascia il posto quando chi lo ha chiesto si ferma', () => {
  it('aspetta dietro un’altra unione: con `vaVia` esce subito, non parte, e la cartella torna libera', async () => {
    const turni = creaTurni()
    let liberaPrimo = (): void => {}
    const primo = turni.unione('/a', () => new Promise<string>((ris) => { liberaPrimo = () => ris('primo') }))
    const via = new AbortController()
    let partito = false
    const passo = turni.unione('/a', () => { partito = true; return 'passo' }, { vaVia: via.signal })
    passo.catch(() => {})
    await pausa(20)
    expect(turni.stato().unioni).toBe(2)
    const t0 = Date.now()
    via.abort()
    const err = await passo.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TurnoLasciato)
    // Per chi chiama è una scadenza: la prova esce «scaduta» e l'unione torna in fila.
    expect(err).toBeInstanceOf(TurnoScaduto)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(partito).toBe(false)
    expect(turni.stato().unioni).toBe(1)
    liberaPrimo()
    expect(await primo).toBe('primo')
    expect(turni.stato().unioni).toBe(0)
    // Nessun posto tenuto: una chat prende subito il turno pesante in quella cartella.
    expect(turni.prenota('c-1', '/a', 1000)).toEqual({ ok: true })
    turni.rilascia('c-1')
  })

  it('il passo già partito non si ferma per `vaVia`: un commit o un annullo finisce sempre', async () => {
    const turni = creaTurni()
    const via = new AbortController()
    let finisci = (): void => {}
    let partito = false
    const passo = turni.unione('/a', async () => { partito = true; await new Promise<void>((ris) => { finisci = ris }); return 'chiuso' }, { vaVia: via.signal })
    await pausa(20)
    expect(partito).toBe(true)
    via.abort()
    await pausa(20)
    finisci()
    expect(await passo).toBe('chiuso')
    expect(turni.stato().unioni).toBe(0)
  })

  it('chi se n’è già andato prima di chiedere: il passo non parte nemmeno (vale anche per il segnale della scadenza)', async () => {
    const turni = creaTurni()
    let partiti = 0
    const fai = (): string => { partiti += 1; return 'x' }
    await expect(turni.unione('/a', fai, { vaVia: AbortSignal.abort() })).rejects.toBeInstanceOf(TurnoLasciato)
    await expect(turni.unione('/a', fai, { segnale: AbortSignal.abort() })).rejects.toBeInstanceOf(TurnoScaduto)
    expect(partiti).toBe(0)
    expect(turni.stato().unioni).toBe(0)
  })

  it('senza `vaVia` resta come prima: il passo aspetta il suo turno e parte', async () => {
    const turni = creaTurni()
    let liberaPrimo = (): void => {}
    const primo = turni.unione('/a', () => new Promise<void>((ris) => { liberaPrimo = ris }))
    const passo = turni.unione('/a', () => 'dopo')
    await pausa(20)
    liberaPrimo()
    await primo
    expect(await passo).toBe('dopo')
  })
})

const k = (id: string, o: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: 'c', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-25T08:00:00.000Z', ...o })
const piano = (...compiti: CompitoPiano[]): Piano => ({ versione: 1, compiti })

describe('il riposo dopo troppe scadenze, detto con l’ora e il motivo', () => {
  const fino = new Date(2026, 10, 25, 14, 7).getTime()

  it('la frase dice fino a che ora e perché', () => {
    expect(oraBreve(fino)).toBe('14:07')
    expect(fraseRiposo({ finoMs: fino, motivo: 'prova scaduta\n mentre stava per  misurare i criteri' }))
      .toBe('in riposo fino alle 14:07, motivo: prova scaduta mentre stava per misurare i criteri')
  })

  it('l’evento di uscita dalla fila dice l’ora, e che unisci non la rimette in fila prima', () => {
    const t = fraseUscitaDopoScadenze({ chi: 'k-1', tentativi: 3, motivo: 'scaduta', fase: 'prova', riposoMin: 60, finoMs: fino })
    expect(t).toContain('riprovo da sola fra 60 minuti (alle 14:07)')
    expect(t).toContain('unisci non la rimette in fila')
    expect(t).not.toContain('subito se chiami unisci')
  })

  it('il lavoro fermo vede l’unione a riposo: «non rilanciarlo», e la firma è da unione ferma (niente risvegli a vuoto)', () => {
    const coda: Coda = { ...codaVuota('Lavoro'), richieste: [{ id: 'r-1', stato: 'pianificata', titolo: 'la barra', compiti: ['k-1'] }] as unknown as Coda['richieste'] }
    const f = lavoroFermo({ coda, piano: piano(k('k-1', { stato: 'in-revisione', esito: 'unione ferma' })), alLavoro: new Set(), unioniFerme: new Map([['k-1', fraseRiposo({ finoMs: fino, motivo: 'scaduta' })]]) })
    expect(f?.righe.join('\n')).toContain('k-1 finito, unione in riposo fino alle 14:07, motivo: scaduta: non rilanciarlo')
    expect(f?.firma.split('|').every((t) => t.endsWith(':unione-ferma'))).toBe(true)
  })
})
