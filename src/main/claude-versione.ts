import { execFileSync } from 'node:child_process'

/**
 * Se Claude Code è indietro, e con quale comando aggiornarlo.
 *
 * Il controllo non si fa mentre il programma lavora: le chat tengono aperto
 * `claude.exe`, e un eseguibile in uso non si lascia sostituire. Qui si
 * risponde soltanto alla domanda «c'è qualcosa da fare?» — a farlo sarà
 * l'updater, quando il programma è chiuso e nessuno lo tiene per mano.
 */

/** Quanto si aspetta una risposta prima di lasciar perdere: è solo una domanda. */
const TIMEOUT_MS = 15_000

export function versioneInstallata(
  comando: string,
  esegui: (c: string, args: string[]) => string = (c, args) =>
    execFileSync(c, args, { encoding: 'utf8', windowsHide: true, timeout: TIMEOUT_MS })
): string | undefined {
  try {
    // `claude --version` stampa qualcosa come «2.1.228 (Claude Code)»: si
    // prende il primo numero e si lascia stare il resto, che cambia forma nel
    // tempo e non serve a niente.
    const trovato = /(\d+\.\d+\.\d+)/.exec(esegui(comando, ['--version']))
    return trovato?.[1]
  } catch {
    return undefined
  }
}

export function versioneUltima(
  esegui: (c: string, args: string[]) => string = (c, args) =>
    execFileSync(c, args, { encoding: 'utf8', windowsHide: true, timeout: TIMEOUT_MS })
): string | undefined {
  try {
    // Il registro di npm è la fonte: è da lì che Claude Code si installa e si
    // aggiorna, quindi è lì che sta la verità su quale sia l'ultima.
    const testo = esegui('npm.cmd', ['view', '@anthropic-ai/claude-code', 'version'])
    const trovato = /(\d+\.\d+\.\d+)/.exec(testo)
    return trovato?.[1]
  } catch {
    return undefined
  }
}

/**
 * `true` se la prima è più vecchia della seconda.
 *
 * Confronto numero per numero, non alfabetico: `2.9.0` viene dopo `2.10.0` in
 * ordine alfabetico, ed è la classica trappola che fa proporre aggiornamenti
 * all'indietro.
 */
export function piuVecchia(installata: string, ultima: string): boolean {
  const a = installata.split('.').map((n) => Number(n))
  const b = ultima.split('.').map((n) => Number(n))
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * Il comando da passare all'updater, o `undefined` se non c'è niente da fare.
 *
 * Nel dubbio non si tocca niente: se una delle due versioni non si è potuta
 * stabilire, proporre un aggiornamento sarebbe proporre di sostituire qualcosa
 * senza sapere se serve.
 */
export function claudeDaAggiornare(
  comando: string,
  // Le versioni si passano dentro un oggetto e non come parametri con un
  // valore predefinito: in JavaScript un `undefined` esplicito fa scattare il
  // predefinito, e chi voleva dire «non lo so» finiva per eseguire davvero i
  // comandi che stava cercando di evitare.
  viste?: { installata?: string; ultima?: string }
): string | undefined {
  const installata = viste === undefined ? versioneInstallata(comando) : viste.installata
  const ultima = viste === undefined ? versioneUltima() : viste.ultima
  if (installata === undefined || ultima === undefined) return undefined
  return piuVecchia(installata, ultima) ? comando : undefined
}
