import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota } from '@shared/autopilota'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { autopulizia, cartelleProgettiDelServizio, decidiCartellaAp, rigaRiepilogo } from '../../src/autopilot-host/autopulizia'
import type { GitAsincrono } from '../../src/autopilot-host/worktree'

/**
 * 31/10, «solo cose sicure»: le vecchie copie `ap-<8hex>-c-N` del primo
 * autopilota nella cartella dei progetti. Via solo quelle vuote (sottocartelle
 * vuote ammesse), vecchie e che nessuna chat aperta usa; con un file restano e
 * si contano fra «da guardare»; un collegamento non si segue mai.
 */

/** Sette ore dopo adesso: le cartelle create dalla prova non sono più «appena nate». */
const DOPO = (): number => Date.now() + 7 * 60 * 60_000
const gitMuto: GitAsincrono = () => Promise.resolve({ codice: 1, uscita: '' })

function scena(): { progetti: string; archivio: ReturnType<typeof apriArchivio> } {
  const radice = mkdtempSync(join(tmpdir(), 'sd-copie-vuote-'))
  const progetti = join(radice, 'Progetti SierraDeck')
  mkdirSync(progetti, { recursive: true })
  return { progetti, archivio: apriArchivio(join(radice, 'autopiloti')) }
}

describe('le vecchie copie vuote ap-…-c-N', () => {
  it('la decisione, pura: collegamento e file restano «da guardare», chat aperta e giovane restano e basta', () => {
    const base = { collegamento: false, file: 0, giovane: false, chatAperta: false }
    expect(decidiCartellaAp(base)).toEqual({ togli: true, perche: 'vuota' })
    expect(decidiCartellaAp({ ...base, file: 1 })).toMatchObject({ togli: false, daGuardare: true, perche: 'con dei file' })
    expect(decidiCartellaAp({ ...base, collegamento: true })).toMatchObject({ togli: false, daGuardare: true, perche: 'collegamento' })
    expect(decidiCartellaAp({ ...base, giovane: true })).toEqual({ togli: false, perche: 'appena nata' })
    expect(decidiCartellaAp({ ...base, chatAperta: true })).toEqual({ togli: false, perche: 'chat aperta' })
  })

  it('vuota (anche con sottocartelle vuote): via; con un file: resta e si conta; un’altra cartella vuota non si tocca', async () => {
    const { progetti, archivio } = scena()
    mkdirSync(join(progetti, 'ap-f1e631f5-c-101', '.claude', 'vuota'), { recursive: true })
    mkdirSync(join(progetti, 'ap-fe95062e-c-53'), { recursive: true })
    mkdirSync(join(progetti, 'ap-0a0b0c0d-c-7', '.claude'), { recursive: true })
    writeFileSync(join(progetti, 'ap-0a0b0c0d-c-7', '.claude', 'settings.local.json'), '{}')
    mkdirSync(join(progetti, 'GLOS'))
    const e = await autopulizia({ archivio, git: gitMuto, cartelleProgetti: () => [progetti], ora: DOPO })
    expect(e.errori).toEqual([])
    expect(e.cartelleVuoteTolte).toBe(2)
    expect(readdirSync(progetti).sort()).toEqual(['GLOS', 'ap-0a0b0c0d-c-7'])
    expect(existsSync(join(progetti, 'ap-0a0b0c0d-c-7', '.claude', 'settings.local.json'))).toBe(true)
    expect(e.daGuardare).toEqual([{ cosa: join(progetti, 'ap-0a0b0c0d-c-7'), perche: 'con dei file' }])
    const riga = rigaRiepilogo(e)
    expect(riga).toContain('2 cartelle vuote «ap-…» del vecchio autopilota tolte')
    expect(riga).toContain('da guardare 1 cartelle «ap-…» (con dei file: 1)')
  })

  it('appena nata, o usata da una chat aperta: resta, e non è «da guardare»', async () => {
    const { progetti, archivio } = scena()
    mkdirSync(join(progetti, 'ap-11111111-c-1'))
    let e = await autopulizia({ archivio, git: gitMuto, cartelleProgetti: () => [progetti] })
    expect(existsSync(join(progetti, 'ap-11111111-c-1'))).toBe(true)
    expect(e.cartelleVuoteTolte ?? 0).toBe(0)
    expect(e.daGuardare ?? []).toEqual([])

    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-11111111', nome: 'x', obiettivo: 'o', cwd: join(progetti, 'GLOS'), iniziatoIl: '2026-10-01T00:00:00.000Z' }),
      stato: 'lavoro',
      chats: [{ id: 'c-1', compito: 'c', stato: 'lavoro', cicli: 1, cartella: join(progetti, 'ap-11111111-c-1') }]
    })
    e = await autopulizia({ archivio, git: gitMuto, cartelleProgetti: () => [progetti], ora: DOPO })
    expect(existsSync(join(progetti, 'ap-11111111-c-1'))).toBe(true)
    expect(e.cartelleVuoteTolte ?? 0).toBe(0)
  })

  it('una giunzione (la cartella stessa, o una dentro) non si segue: resta, e quello a cui punta è intatto', async () => {
    const { progetti, archivio } = scena()
    const fuori = mkdtempSync(join(tmpdir(), 'sd-copie-vuote-fuori-'))
    writeFileSync(join(fuori, 'prezioso.txt'), 'non toccare')
    const vuotaFuori = mkdtempSync(join(tmpdir(), 'sd-copie-vuote-vuota-'))
    symlinkSync(fuori, join(progetti, 'ap-22222222-c-1'), 'junction')
    mkdirSync(join(progetti, 'ap-22222222-c-2'))
    symlinkSync(vuotaFuori, join(progetti, 'ap-22222222-c-2', 'node_modules'), 'junction')
    const e = await autopulizia({ archivio, git: gitMuto, cartelleProgetti: () => [progetti], ora: DOPO })
    expect(e.cartelleVuoteTolte ?? 0).toBe(0)
    expect(readdirSync(progetti).sort()).toEqual(['ap-22222222-c-1', 'ap-22222222-c-2'])
    expect(existsSync(join(fuori, 'prezioso.txt'))).toBe(true)
    expect(existsSync(vuotaFuori)).toBe(true)
    expect((e.daGuardare ?? []).map((x) => x.perche)).toEqual(['collegamento', 'collegamento'])
  })

  it('senza cartelle dei progetti non si cerca niente; le cartelle del servizio: ambiente, pc.json e quelle di serie, solo se ci sono', async () => {
    const { progetti, archivio } = scena()
    mkdirSync(join(progetti, 'ap-33333333-c-1'))
    const e = await autopulizia({ archivio, git: gitMuto, ora: DOPO })
    expect(e.cartelleVuoteTolte ?? 0).toBe(0)
    expect(existsSync(join(progetti, 'ap-33333333-c-1'))).toBe(true)

    const casa = mkdtempSync(join(tmpdir(), 'sd-casa-'))
    const dati = mkdtempSync(join(tmpdir(), 'sd-dati-'))
    mkdirSync(join(casa, 'Documents', 'Progetti SierraDeck'), { recursive: true })
    const scelta = mkdtempSync(join(tmpdir(), 'sd-scelta-'))
    writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'x', cartellaProgetti: scelta }))
    expect(cartelleProgettiDelServizio({ ambiente: progetti, dati, casa })).toEqual([progetti, scelta, join(casa, 'Documents', 'Progetti SierraDeck')])
    expect(cartelleProgettiDelServizio({ ambiente: scelta, dati, casa })).toEqual([scelta, join(casa, 'Documents', 'Progetti SierraDeck')])
  })
})
