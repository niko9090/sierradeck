import { spawn } from 'node:child_process'

/**
 * **Un programma vivo dentro una cartella** (11/11), per provare «file in uso».
 *
 * Su Windows una cartella che è la cartella di lavoro di un programma non si
 * può togliere finché quello vive: è il blocco vero che l'autopulizia trova
 * (un `node` rimasto acceso in una copia). Si torna solo quando il programma
 * gira davvero (ha scritto «pronto»): subito dopo l'avvio la cartella non è
 * ancora tenuta, e sotto carico la cancellazione faceva in tempo a riuscire.
 */
export async function programmaVivoIn(cartella: string): Promise<{ ferma: () => Promise<void> }> {
  const p = spawn(process.execPath, ['-e', 'process.stdout.write("pronto"); setTimeout(() => {}, 60000)'], { cwd: cartella, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
  await new Promise<void>((ok, no) => {
    p.stdout.once('data', () => { ok() })
    p.once('error', no)
    p.once('exit', () => { no(new Error('il programma di prova è uscito subito')) })
  })
  return {
    ferma: () => new Promise<void>((ok) => {
      if (p.exitCode !== null || p.signalCode !== null) { ok(); return }
      p.once('exit', () => { ok() })
      p.kill()
    })
  }
}

/** Riprova finché `f` non riesce (Windows lascia la cartella un attimo dopo la fine del programma). */
export async function finche<T>(f: () => Promise<T>, vale: (r: T) => boolean, tentativi = 40, pausaMs = 50): Promise<T> {
  let ultimo = await f()
  for (let i = 1; i < tentativi && !vale(ultimo); i += 1) {
    await new Promise((r) => setTimeout(r, pausaMs))
    ultimo = await f()
  }
  return ultimo
}
