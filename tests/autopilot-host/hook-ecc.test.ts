import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allineaHookEcc, allineaHookEccDiTutte, unisciSpegnimentoHook } from '../../src/autopilot-host/hook-ecc'

const SPENTI = { env: { ECC_HOOKS_ENABLED: 'false', ECC_GATEGUARD: 'off' } }
const SI = (): boolean => true

describe('unisciSpegnimentoHook', () => {
  it('porta nella copia senza file solo lo spegnimento', () => {
    expect(unisciSpegnimentoHook(SPENTI, undefined)).toEqual(SPENTI)
  })

  it('non tocca gli altri permessi e le altre variabili della copia', () => {
    const copia = { permissions: { allow: ['Bash(npm test)'] }, enabledMcpjsonServers: ['x'], env: { ALTRO: '1' } }
    expect(unisciSpegnimentoHook(SPENTI, copia)).toEqual({
      permissions: { allow: ['Bash(npm test)'] },
      enabledMcpjsonServers: ['x'],
      env: { ALTRO: '1', ECC_HOOKS_ENABLED: 'false', ECC_GATEGUARD: 'off' }
    })
  })

  it('non porta le altre chiavi della principale', () => {
    const principale = { permissions: { allow: ['Bash(rm *)'] }, env: { ECC_HOOKS_ENABLED: 'false', SEGRETO: 'x' } }
    expect(unisciSpegnimentoHook(principale, {})).toEqual({ env: { ECC_HOOKS_ENABLED: 'false' } })
  })

  it('niente da fare se la principale non spegne niente o la copia è già a posto', () => {
    expect(unisciSpegnimentoHook({ permissions: {} }, undefined)).toBeUndefined()
    expect(unisciSpegnimentoHook(undefined, undefined)).toBeUndefined()
    expect(unisciSpegnimentoHook(SPENTI, { env: { ECC_HOOKS_ENABLED: 'false', ECC_GATEGUARD: 'off', ALTRO: '1' } })).toBeUndefined()
  })

  it('segue il valore della principale anche quando la copia ne ha un altro', () => {
    expect(unisciSpegnimentoHook(SPENTI, { env: { ECC_HOOKS_ENABLED: 'true' } })).toEqual(SPENTI)
  })
})

describe('allineaHookEcc su disco', () => {
  let radice = ''
  let copie = ''
  const scrivi = (dove: string, j: unknown): void => {
    mkdirSync(join(dove, '.claude'), { recursive: true })
    writeFileSync(join(dove, '.claude', 'settings.local.json'), JSON.stringify(j))
  }
  const leggi = (dove: string): unknown => JSON.parse(readFileSync(join(dove, '.claude', 'settings.local.json'), 'utf8'))
  const copia = (nome: string): string => {
    const d = join(copie, nome)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, '.git'), 'gitdir: altrove\n')
    return d
  }

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), 'sd-hook-'))
    radice = join(base, 'progetto')
    copie = join(base, 'progetto.sierradeck-wt')
    mkdirSync(radice)
  })

  it('crea il file nella copia che non lo ha', () => {
    scrivi(radice, SPENTI)
    const c = copia('ap-1-c-1')
    expect(allineaHookEcc(radice, c, SI)).toBe(true)
    expect(leggi(c)).toEqual(SPENTI)
    expect(allineaHookEcc(radice, c, SI)).toBe(false)
  })

  it('unisce nella copia che ha già i suoi permessi', () => {
    scrivi(radice, SPENTI)
    const c = copia('ap-1-c-2')
    scrivi(c, { permissions: { allow: ['Read'] } })
    expect(allineaHookEcc(radice, c, SI)).toBe(true)
    expect(leggi(c)).toEqual({ permissions: { allow: ['Read'] }, ...SPENTI })
  })

  it('non riscrive un file della copia illeggibile e non fa niente senza la principale', () => {
    const c = copia('ap-1-c-3')
    expect(allineaHookEcc(radice, c, SI)).toBe(false)
    expect(existsSync(join(c, '.claude'))).toBe(false)
    scrivi(radice, SPENTI)
    mkdirSync(join(c, '.claude'))
    writeFileSync(join(c, '.claude', 'settings.local.json'), '{ rotto')
    expect(allineaHookEcc(radice, c, SI)).toBe(false)
    expect(readFileSync(join(c, '.claude', 'settings.local.json'), 'utf8')).toBe('{ rotto')
  })

  it('non scrive se git non ignora il file nella copia: finirebbe nel commit della chat', () => {
    scrivi(radice, SPENTI)
    const c = copia('ap-1-c-6')
    expect(allineaHookEcc(radice, c, () => false)).toBe(false)
    expect(existsSync(join(c, '.claude'))).toBe(false)
  })

  it('sistema tutte le copie già aperte, non le cartelle vuote', () => {
    scrivi(radice, SPENTI)
    copia('ap-1-c-4')
    const giusta = copia('ap-1-c-5')
    scrivi(giusta, SPENTI)
    mkdirSync(join(copie, 'vuota'))
    expect(allineaHookEccDiTutte(radice, copie, SI)).toEqual(['ap-1-c-4'])
    expect(existsSync(join(copie, 'vuota', '.claude'))).toBe(false)
    expect(allineaHookEccDiTutte(radice, join(radice, 'non-c-e'), SI)).toEqual([])
  })
})
