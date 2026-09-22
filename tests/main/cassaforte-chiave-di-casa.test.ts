import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * La chiave di casa: due PC che aprono la stessa cassaforte si riconoscono
 * senza accoppiarsi. E' un HMAC della maestra per uno scopo: uguale da
 * tutte e due le parti, diverso per ogni scopo, niente da spedire.
 */

function driveCondiviso(): { magazzino: (nome?: string) => Magazzino; archivio: () => Archivio } {
  const mags = new Map<string, Magazzino>()
  const arch = archivioInMemoria()
  return {
    magazzino: (nome = 'sierradeck.cassaforte') => {
      let m = mags.get(nome)
      if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) }
      return m
    },
    archivio: () => arch
  }
}

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function pc(nome: string, drive: ReturnType<typeof driveCondiviso>, pcId: string): ReturnType<typeof apriSincronia> {
  const radice = mkdtempSync(join(tmpdir(), `sd-casa-${nome}-`))
  temp.push(radice)
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects'), { recursive: true })
  const registro = apriRegistroProgetti(dati)
  return apriSincronia({
    dati, radiceClaude: claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
    lavoro: creaLavoro(), pcId: () => pcId, cartellaProgetti: () => join(radice, 'Progetti'),
    registroProgetti: { leggi: () => registro.leggi(), scrivi: (r) => registro.scrivi(r) }
  })
}

describe('la chiave di casa', () => {
  it('a cassaforte chiusa non c’e’; aperta con la stessa passphrase e’ uguale sui due PC e diversa per scopo', async () => {
    const drive = driveCondiviso()
    const torre = pc('torre', drive, 'A')
    const portatile = pc('portatile', drive, 'B')
    expect(torre.chiaveDiCasa('client-pc:A')).toBeUndefined()
    expect((await torre.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    const perA = torre.chiaveDiCasa('client-pc:A')
    expect(perA).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(torre.chiaveDiCasa('client-pc:B')).not.toBe(perA)
    expect(torre.chiaveDiCasa('')).toBeUndefined()
    // Il portatile, con la stessa passphrase, ricava la stessa chiave per A.
    expect((await portatile.sblocca('passphrase-robusta-1')).ok).toBe(true)
    expect(portatile.chiaveDiCasa('client-pc:A')).toBe(perA)
    // Bloccata, sparisce.
    portatile.blocca()
    expect(portatile.chiaveDiCasa('client-pc:A')).toBeUndefined()
  })
})
