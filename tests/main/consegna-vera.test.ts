import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { eseguiConsegna, type Ponte } from '../../src/renderer/consegne-autopilota'
import { chatAspetta, consegnaPartita, creaUltimeRighe, prontoPerInvio, sceltaSulloSchermo, testoPerso } from '../../src/renderer/ultime-righe'
import { preparaConsegna } from '@shared/consegna-breve'
import { scriviFileConsegna } from '../../src/main/consegne-file'

/**
 * La prova vera della 0.38.2, nella condizione di NexoraOS: dopo un
 * aggiornamento la chat rinasce con `--resume` su una conversazione lunga, e la
 * consegna dell'autopilota arriva nello stesso istante. Il ponte e' quello del
 * programma (la stessa prontezza, la stessa lettura dello schermo); lo schermo
 * e' un xterm senza interfaccia.
 *
 * Parte solo con SIERRADECK_PROVA_CLAUDE=1 (consuma il piano) e con
 * SIERRADECK_XTERM_HEADLESS = la cartella di `@xterm/headless`; saltata se
 * Claude Code non c'e'. La copia della conversazione la crea e la toglie lei.
 */
const conClaude = spawnSync('claude.exe', ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0
const headless = process.env.SIERRADECK_XTERM_HEADLESS
const voluta = process.env.SIERRADECK_PROVA_CLAUDE === '1' && headless !== undefined && existsSync(headless)

describe.skipIf(!conClaude || !voluta)('una consegna vera, appena la chat rinasce', () => {
  it('scrive la riga, la chat parte e esegue le istruzioni del file', async () => {
    const pty = await import('node-pty')
    const { Terminal } = (await import(join(headless!, 'lib-headless', 'xterm-headless.js'))) as { Terminal: new (o: object) => { write: (d: string) => void; buffer: { active: { viewportY: number; getLine: (y: number) => { translateToString: (t: boolean) => string } | undefined } }; rows: number } }
    const cartella = process.cwd()
    const progetti = join(homedir(), '.claude', 'projects', 'E--Users-nikof-Documents-SierraDeck')
    const origine = process.env.SIERRADECK_SESSIONE_LUNGA ?? '80c8b89a-7275-4fbc-8e1c-839921bfc883'
    const nuova = randomUUID()
    const copia = join(progetti, `${nuova}.jsonl`)
    writeFileSync(copia, readFileSync(join(progetti, `${origine}.jsonl`), 'utf8').split(origine).join(nuova))
    const segno = `SEGNO${Math.floor(Math.random() * 1e6)}`
    const id = `prova-${segno}`
    // Il main: la consegna lunga diventa file piu' riga corta.
    const c = preparaConsegna(
      { id, autopilotaId: 'ap-prova', chatId: 'ch', cwd: cartella, sessionId: nuova, titolo: 'prova', cosa: 'scrivi' as const, testo: `Prova del programma SierraDeck.\nRispondi soltanto con la parola ${segno} e nient'altro.\n` },
      (rel, t) => scriviFileConsegna(cartella, rel, t)
    )
    const term = new Terminal({ cols: 140, rows: 45, allowProposedApi: true })
    const righe = creaUltimeRighe()
    const p = pty.spawn('claude.exe', ['--resume', nuova, '--dangerously-skip-permissions'], { name: 'xterm-256color', cols: 140, rows: 45, cwd: cartella, env: process.env as Record<string, string>, useConpty: true })
    p.onData((d) => { term.write(d); righe.aggiorna('pty-1', d) })
    const schermo = (): string[] => {
      const b = term.buffer.active
      const out: string[] = []
      for (let y = 0; y < term.rows; y++) out.push((b.getLine(b.viewportY + y)?.translateToString(true) ?? '').trimEnd())
      return out
    }
    const passi: string[] = []
    const segnali: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p', ptyId: 'pty-1' }),
      apri: () => 'p',
      scrivi: (_id, t) => p.write(t),
      prontoARicevere: () => prontoPerInvio(righe.attivitaDi('pty-1'), schermo(), Date.now()) && chatAspetta(righe.attivitaDi('pty-1'), schermo(), Date.now()),
      partita: (_id, scritto) => consegnaPartita(schermo(), scritto),
      perso: (_id, scritto) => testoPerso(schermo(), scritto ?? ''),
      sceltaAperta: () => sceltaSulloSchermo(schermo()),
      segnala: (s) => { segnali.push(s.motivo) },
      registra: (x) => { passi.push(x) }
    }
    try {
      // La consegna arriva nello stesso istante in cui il riquadro rinasce.
      eseguiConsegna(c, ponte)
      const fine = Date.now() + 150_000
      while (Date.now() < fine && !schermo().some((r) => r.includes(`● ${segno}`))) await new Promise((r) => setTimeout(r, 300))
      console.log(passi.join('\n'))
      expect(schermo().some((r) => r.includes(`● ${segno}`))).toBe(true)
      expect(segnali).toEqual([])
      expect(passi.join('\n')).toContain('partita')
    } finally {
      p.kill()
      await new Promise((r) => setTimeout(r, 500))
      try { unlinkSync(copia) } catch { /* resta */ }
      try { unlinkSync(join(cartella, '.sierradeck', 'consegne', `${id}.md`)) } catch { /* resta */ }
    }
  }, 240_000)
})
