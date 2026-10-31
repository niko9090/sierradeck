import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { PtyManager, TEMPO_TASKKILL_MS } from '../../src/pty-host/pty-manager'
import { startHost, ATTESA_KILLALL_MS, type ManagerLike } from '../../src/pty-host/host'
import { attesaSpegnimentoMs, ATTESA_SPEGNIMENTO_MS, PtyHostClient } from '../../src/main/pty-host-client'
import { encodeMessage } from '@shared/protocol'
import type { HostToCore } from '@shared/protocol'

/**
 * 0.89.1, dal registro di un portatile a una chiusura per aggiornamento:
 * «[pty-host] non uscito entro 2000 ms dallo spegnimento ordinato (4
 * terminali)», poi «[pty] evento error per … senza finestra proprietaria».
 * Su un altro PC: «console già chiusa (node-pty)».
 */

type ProcFinto = { pid: number; kill: () => void }

function managerConFinti(pids: number[]): { m: PtyManager; uccisi: number[] } {
  const m = new PtyManager()
  const uccisi: number[] = []
  const interno = m as unknown as { processes: Map<string, ProcFinto>; scrollback: Map<string, unknown> }
  for (const [i, pid] of pids.entries()) {
    interno.processes.set(`p${i}`, { pid, kill: () => { uccisi.push(pid) } })
    interno.scrollback.set(`p${i}`, {})
  }
  return { m, uccisi }
}

describe('killAll chiude gli alberi in un colpo e non blocca sulle console', () => {
  it('su Windows: un taskkill per tutti, e il kill di node-pty solo per chi sopravvive', async () => {
    const { m, uccisi } = managerConFinti([11, 12, 13, 14])
    const chieste: number[][] = []
    let finisci: (() => void) | undefined
    const fatto = m.killAll({
      piattaforma: 'win32',
      uccidi: (p) => { chieste.push(p); return new Promise<void>((r) => { finisci = r }) },
      // 13 resiste al taskkill (accesso negato, tempo scaduto).
      vivo: (pid) => pid === 13
    })
    // Tutti insieme, una sola chiamata, e nessun kill() mentre i claude.exe
    // sono ancora vivi: era quello che bloccava l'event loop dell'host.
    expect(chieste).toEqual([[11, 12, 13, 14]])
    expect(uccisi).toEqual([])
    // Le mappe sono gia' vuote: il gestore `exit` non rifa' il lavoro.
    expect(m.pids().size).toBe(0)
    expect(m.scrollbackDi('p0')).toBeUndefined()
    finisci?.()
    await fatto
    expect(uccisi).toEqual([13])
  })

  it('un secondo killAll non chiama niente', async () => {
    const { m } = managerConFinti([21])
    await m.killAll({ piattaforma: 'win32', uccidi: async () => undefined, vivo: () => false })
    const uccidi = vi.fn(async () => undefined)
    await m.killAll({ piattaforma: 'win32', uccidi })
    expect(uccidi).not.toHaveBeenCalled()
  })

  it('un taskkill che fallisce non lascia la promessa rifiutata', async () => {
    const { m, uccisi } = managerConFinti([31])
    await expect(m.killAll({
      piattaforma: 'win32',
      uccidi: async () => { throw new Error('taskkill assente') },
      vivo: () => true
    })).resolves.toBeUndefined()
    // La rete di sicurezza: il kill() di node-pty per chi e' ancora vivo.
    expect(uccisi).toEqual([31])
  })

  it('fuori da Windows il kill() resta per tutti, subito', async () => {
    const { m, uccisi } = managerConFinti([41, 42])
    const fatto = m.killAll({ piattaforma: 'linux', uccidi: async () => undefined })
    expect(uccisi).toEqual([41, 42])
    await fatto
  })
})

describe('i tempi dello spegnimento stanno uno dentro l altro', () => {
  it('taskkill < tetto dell host < attesa del Core, anche con un solo terminale', () => {
    expect(TEMPO_TASKKILL_MS).toBeLessThan(ATTESA_KILLALL_MS)
    // Margine per l'uscita del processo host dopo il tetto.
    for (const n of [1, 4, 15]) {
      expect(ATTESA_KILLALL_MS + 400).toBeLessThanOrEqual(attesaSpegnimentoMs(ATTESA_SPEGNIMENTO_MS, n))
    }
  })
})

describe('l host spento non risponde piu', () => {
  it('un write arrivato dopo lo spegnimento non diventa un error verso il Core', async () => {
    const chiamate: string[] = []
    const risposte: string[] = []
    const stdin = new PassThrough()
    const manager: ManagerLike = {
      onData: () => undefined, onExit: () => undefined, spawn: () => 1,
      write: (id) => { chiamate.push(`write:${id}`); throw new Error('inesistente') },
      resize: () => undefined, kill: () => undefined,
      killAll: () => new Promise<void>(() => undefined), scrollbackDi: () => undefined
    }
    startHost({ manager, stdin, write: (c) => risposte.push(c), exit: () => undefined, log: () => undefined })
    stdin.write(encodeMessage({ kind: 'shutdown' }))
    await new Promise((r) => setTimeout(r, 10))
    stdin.write(encodeMessage({ id: 'p1', kind: 'write', data: 'x' }))
    await new Promise((r) => setTimeout(r, 10))
    expect(chiamate).toEqual([])
    expect(risposte).toEqual([])
  })
})

describe('il Core in spegnimento non riempie il registro di errori attesi', () => {
  it('i messaggi delle finestre che si chiudono non tornano come error', async () => {
    const client = new PtyHostClient({ nodePath: process.execPath, hostScript: 'nessuno.js', processoVivo: () => false })
    const ricevuti: HostToCore[] = []
    client.on((m) => ricevuti.push(m))
    expect(client.inSpegnimento()).toBe(false)
    await client.stop()
    expect(client.inSpegnimento()).toBe(true)
    client.send({ id: 'p1', kind: 'write', data: 'x' })
    client.send({ id: 'p1', kind: 'kill' })
    expect(ricevuti).toEqual([])
  })

  it('un error dell host durante lo spegnimento non arriva al Core, un exit si', async () => {
    const client = new PtyHostClient({ nodePath: process.execPath, hostScript: 'nessuno.js', shutdownTimeoutMs: 50, processoVivo: () => false })
    const ricevuti: HostToCore[] = []
    client.on((m) => ricevuti.push(m))
    const errori = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      client.start()
      const figlio = (client as unknown as { child: { stdout: NodeJS.EventEmitter } }).child
      const fermo = client.stop()
      figlio.stdout.emit('data', JSON.stringify({ id: 'p1', kind: 'error', message: 'terminale p1 inesistente' }) + '\n')
      figlio.stdout.emit('data', JSON.stringify({ id: 'p1', kind: 'exit', code: 0 }) + '\n')
      await fermo
      expect(ricevuti).toEqual([{ id: 'p1', kind: 'exit', code: 0 }])
    } finally {
      errori.mockRestore()
    }
  })
})
