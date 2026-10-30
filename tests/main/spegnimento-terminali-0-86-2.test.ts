import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { argomentiTaskkill, uccidiAlberi } from '../../src/shared/uccidi-alberi'
import { attesaSpegnimentoMs, ATTESA_SPEGNIMENTO_MAX_MS, PER_TERMINALE_MS, PtyHostClient } from '../../src/main/pty-host-client'
import { startHost, ATTESA_KILLALL_MS, type ManagerLike } from '../../src/pty-host/host'
import { encodeMessage } from '@shared/protocol'

/**
 * 0.86.2: «[pty-host] non uscito entro 800 ms» a 7 chiusure su 7, e i
 * claude.exe ancora accesi dopo l'uscita dall'app.
 */

describe('gli alberi dei processi si chiudono tutti insieme', () => {
  it('su Windows un taskkill /T /F per pid, lanciati in parallelo', async () => {
    const lanciati: string[][] = []
    const finiti: number[] = []
    let inVolo = 0
    let massimoInVolo = 0
    await uccidiAlberi([101, 102, 101, 103], {
      piattaforma: 'win32',
      esegui: async (comando, argomenti) => {
        lanciati.push([comando, ...argomenti])
        inVolo += 1
        massimoInVolo = Math.max(massimoInVolo, inVolo)
        await new Promise((r) => setTimeout(r, 5))
        inVolo -= 1
        finiti.push(Number(argomenti[3]))
      }
    })
    expect(lanciati).toEqual([
      ['taskkill', '/T', '/F', '/PID', '101'],
      ['taskkill', '/T', '/F', '/PID', '102'],
      ['taskkill', '/T', '/F', '/PID', '103']
    ])
    expect(massimoInVolo).toBe(3)
    expect(finiti.sort()).toEqual([101, 102, 103])
    expect(argomentiTaskkill(7)).toEqual(['/T', '/F', '/PID', '7'])
  })

  it('un taskkill che fallisce non ferma gli altri; pid assurdi e il proprio si saltano', async () => {
    const visti: number[] = []
    await uccidiAlberi([0, -1, 1.5, process.pid, 201, 202], {
      piattaforma: 'win32',
      esegui: async (_c, a) => {
        visti.push(Number(a[3]))
        if (a[3] === '201') throw new Error('accesso negato')
      }
    })
    expect(visti).toEqual([201, 202])
  })

  it('altrove, SIGKILL a ogni pid', async () => {
    const segnati: number[] = []
    await uccidiAlberi([5, 6], { piattaforma: 'linux', segnale: (p) => { segnati.push(p) } })
    expect(segnati).toEqual([5, 6])
  })
})

describe('l attesa dello spegnimento cresce con i terminali, con un tetto', () => {
  it('base senza terminali, più 250 ms a terminale, mai oltre il massimo', () => {
    expect(attesaSpegnimentoMs(1000, 0)).toBe(1000)
    expect(attesaSpegnimentoMs(1000, 7)).toBe(1000 + 7 * PER_TERMINALE_MS)
    expect(attesaSpegnimentoMs(1000, 100)).toBe(ATTESA_SPEGNIMENTO_MAX_MS)
    // Una base gia' piu' larga del massimo (i test) resta la sua.
    expect(attesaSpegnimentoMs(10_000, 3)).toBe(10_000)
  })
})

describe('l host aspetta che i terminali siano chiusi prima di uscire', () => {
  function host(killAll: () => unknown): { uscite: number[]; stdin: PassThrough } {
    const uscite: number[] = []
    const stdin = new PassThrough()
    const manager: ManagerLike = {
      onData: () => undefined, onExit: () => undefined, spawn: () => 1, write: () => undefined,
      resize: () => undefined, kill: () => undefined, killAll, scrollbackDi: () => undefined
    }
    startHost({ manager, stdin, write: () => undefined, exit: (c) => { uscite.push(c) }, log: () => undefined })
    return { uscite, stdin }
  }

  it('esce solo quando la chiusura degli alberi ha finito', async () => {
    let finisci: (() => void) | undefined
    const h = host(() => new Promise<void>((r) => { finisci = r }))
    h.stdin.write(encodeMessage({ kind: 'shutdown' }))
    await vi.waitFor(() => expect(finisci).toBeDefined())
    await new Promise((r) => setTimeout(r, 20))
    expect(h.uscite).toEqual([])
    finisci?.()
    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
  })

  it('ma non aspetta per sempre: oltre il tetto esce comunque', async () => {
    vi.useFakeTimers()
    try {
      const h = host(() => new Promise<void>(() => undefined))
      h.stdin.write(encodeMessage({ kind: 'shutdown' }))
      await vi.advanceTimersByTimeAsync(ATTESA_KILLALL_MS - 1)
      expect(h.uscite).toEqual([])
      await vi.advanceTimersByTimeAsync(2)
      expect(h.uscite).toEqual([0])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('il Core chiude a forza i terminali sopravvissuti, per pid', () => {
  it('dopo lo spegnimento, solo i pid ancora vivi, e lo scrive una volta nel registro', async () => {
    const uccisi: number[][] = []
    const righe: string[] = []
    const client = new PtyHostClient({
      nodePath: process.execPath,
      hostScript: 'nessuno.js',
      log: (m) => righe.push(m),
      processoVivo: (pid) => pid !== 302,
      uccidiAlberi: async (p) => { uccisi.push(p) }
    })
    // I pid arrivano dai `spawned` dell'host: qui si mettono a mano.
    const interno = client as unknown as { pids: Map<string, number> }
    interno.pids.set('a', 301)
    interno.pids.set('b', 302)
    interno.pids.set('c', 303)
    const errori = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await client.stop()
      expect(uccisi).toEqual([[301, 303]])
      expect(righe).toHaveLength(1)
      expect(righe[0]).toContain('chiusi a forza (pid 301, 303)')
      // Con il registro, niente doppione in console (0.86.2: righe triplicate).
      expect(errori).not.toHaveBeenCalled()
    } finally {
      errori.mockRestore()
    }
  })

  it('senza terminali vivi non chiude niente', async () => {
    const uccidi = vi.fn(async () => undefined)
    const client = new PtyHostClient({ nodePath: process.execPath, hostScript: 'nessuno.js', processoVivo: () => false, uccidiAlberi: uccidi })
    ;(client as unknown as { pids: Map<string, number> }).pids.set('a', 401)
    await client.stop()
    expect(uccidi).not.toHaveBeenCalled()
  })
})
