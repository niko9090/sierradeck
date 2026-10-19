import { readFileSync, statSync } from 'node:fs'

/**
 * Un file JSON letto di continuo ma cambiato di rado (0.80.0).
 *
 * `progetti-drive.json` e `pc.json` si rileggevano da capo per ogni chat a ogni
 * `/api/stato` (telefono, pagina, altri PC: ogni 2 s ciascuno) e in decine di
 * altri punti. Su questo PC, con l'antivirus, una lettura costa ~1,1 ms contro
 * ~0,04 ms di uno `stat`. Come `workspace-store`: si tiene il letto finché
 * `mtime`+dimensione non cambiano. Le scritture sono atomiche (temp + rename),
 * quindi la memoria si invalida da sola e regge anche una modifica a mano.
 *
 * `leggi` restituisce `undefined` se il file non c'è; un errore di
 * interpretazione passa a chi chiama, come prima.
 */
export function memoriaDiFile<T>(percorso: string, interpreta: (testo: string) => T): { leggi: () => T | undefined; dimentica: () => void } {
  let memoria: { mtimeMs: number; size: number; valore: T } | undefined
  return {
    leggi() {
      let st: { mtimeMs: number; size: number }
      try {
        st = statSync(percorso)
      } catch {
        memoria = undefined
        return undefined
      }
      if (memoria !== undefined && memoria.mtimeMs === st.mtimeMs && memoria.size === st.size) return memoria.valore
      const valore = interpreta(readFileSync(percorso, 'utf8'))
      memoria = { mtimeMs: st.mtimeMs, size: st.size, valore }
      return valore
    },
    dimentica() { memoria = undefined }
  }
}
