import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { uccidiAlberi } from '@shared/uccidi-alberi'

/**
 * Il processo `claude -p` (righe JSON in entrata e in uscita).
 *
 * 12/11: staccato da `orchestratore.ts` senza cambiare niente, perché lo usa
 * anche SierraDeck Aiutante: lì serve solo questo, non l'orchestratore intero
 * (che si porta dietro il PTY host e node-pty).
 */

/** Un processo `claude` vivo: sostituibile, i test non avviano mai la CLI vera. */
export type ProcessoClaude = {
  scrivi: (riga: string) => void
  uccidi: () => void
  suRiga: (f: (riga: string) => void) => void
  suUscita: (f: (codice: number | null, stderr: string) => void) => void
}
export type AvviaProcesso = (p: { args: string[]; cwd: string; env: Record<string, string> }) => ProcessoClaude

/**
 * Il percorso di claude.exe, con la stessa regola del resto del gestore.
 *
 * L'estensione `.exe` è obbligatoria: su Windows né node-pty né `child_process`
 * consultano PATHEXT, e «claude» senza estensione dà «File not found».
 */
export function claudeCmd(env: NodeJS.ProcessEnv = process.env, esiste: (p: string) => boolean = existsSync): string {
  const dallAmbiente = env.GESTORE_CLAUDE_PATH
  if (dallAmbiente !== undefined && dallAmbiente.trim() !== '') return dallAmbiente
  const nativo = join(homedir(), '.local', 'bin', 'claude.exe')
  return esiste(nativo) ? nativo : 'claude.exe'
}


/**
 * `claude` davvero, lungo: righe JSON in entrata e in uscita. Non solleva:
 * una cartella che non c'è o un avvio fallito tornano come uscita.
 */
export function avviaProcessoReale(claudeCmd: string, uccidi: (pids: number[]) => Promise<void> = (p) => uccidiAlberi(p)): AvviaProcesso {
  return ({ args, cwd, env }) => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    let stderr = ''
    let uscito: { codice: number | null; e: string } | undefined
    const esci = (codice: number | null, e: string): void => {
      if (uscito !== undefined) return
      uscito = { codice, e }
      for (const f of uscite) f(codice, e)
    }
    if (!existsSync(cwd)) {
      setImmediate(() => esci(1, `la cartella «${cwd}» non esiste`))
      return { scrivi: () => {}, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: (f) => { uscite.push(f) } }
    }
    const figlio = spawn(claudeCmd, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    createInterface({ input: figlio.stdout }).on('line', (r) => { for (const f of righe) f(r) })
    figlio.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-4000) })
    figlio.on('error', (err) => esci(1, `${stderr}\n${err.message}`))
    figlio.on('close', (codice) => esci(codice, stderr))
    figlio.stdin.on('error', () => { /* lo dice l'uscita */ })
    return {
      scrivi: (r) => { figlio.stdin.write(r, 'utf8') },
      // Tutto l'albero: su Windows `kill()` lascia vivi i figli (npm, i test, i subagenti).
      uccidi: () => {
        try { figlio.stdin.end() } catch { /* già chiuso */ }
        if (figlio.pid !== undefined && uscito === undefined) void uccidi([figlio.pid])
        else figlio.kill()
      },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { if (uscito !== undefined) f(uscito.codice, uscito.e); else uscite.push(f) }
    }
  }
}
