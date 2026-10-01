import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { CARTELLA_CONSEGNE } from '@shared/consegna-breve'

/** Dopo quanto i file delle consegne si tolgono: sono istruzioni gia' date. */
const VECCHI_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Scrive il file di una consegna lunga dentro la cartella in cui lavora la
 * chat (0.38.1). La cartella `.sierradeck/consegne/` ha un `.gitignore` suo con
 * `*`: non finisce mai in un commit. I file piu' vecchi di una settimana si
 * tolgono a ogni scrittura. Mai fuori da `cwd`.
 */
export function scriviFileConsegna(cwd: string, relativo: string, contenuto: string): boolean {
  try {
    if (cwd === '' || !existsSync(cwd)) return false
    const radice = resolve(cwd)
    const consegne = resolve(radice, CARTELLA_CONSEGNE)
    const file = resolve(radice, relativo)
    // Solo dentro `.sierradeck/consegne` di quella cartella, mai altrove.
    if (!file.startsWith(consegne + sep) || dirname(file) !== consegne) return false
    const cartella = dirname(file)
    mkdirSync(cartella, { recursive: true })
    const ignora = join(cartella, '.gitignore')
    if (!existsSync(ignora)) writeFileSync(ignora, '# Le consegne del supervisore di SierraDeck: non vanno in git.\n*\n', 'utf8')
    writeFileSync(file, contenuto, 'utf8')
    const ora = Date.now()
    for (const n of readdirSync(cartella)) {
      if (!n.endsWith('.md')) continue
      const p = join(cartella, n)
      try { if (ora - statSync(p).mtimeMs > VECCHI_MS) rmSync(p, { force: true }) } catch { /* resta */ }
    }
    return true
  } catch (err) {
    console.warn('[autopilota] file della consegna non scritto, la consegno intera:', err)
    return false
  }
}
