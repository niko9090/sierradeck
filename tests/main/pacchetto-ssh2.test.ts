import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le dipendenze di `ssh2` devono uscire dall'asar insieme a lui.
 *
 * ## Il guasto che questo test impedisce
 *
 * `electron-builder` tira fuori dall'asar `ssh2` da solo, perché si porta
 * dietro `cpu-features`, che è nativo (e opzionale). Ma tira fuori **solo lui**:
 * `asn1` e `bcrypt-pbkdf` restavano dentro l'asar, e da
 * `app.asar.unpacked/node_modules/ssh2` la risoluzione dei moduli **non ci
 * rientra** — sale nelle cartelle vere del disco e non trova niente.
 *
 * In sviluppo tutto funziona: i moduli stanno in `node_modules` e si risolvono.
 * Nel programma installato, `require('ssh2')` falliva al primo collegamento —
 * cioè il guasto si vedeva solo addosso a chi usa il programma.
 *
 * ## Perché un test e non un commento
 *
 * Il giorno in cui `ssh2` aggiunge una dipendenza, o ne cambia una, il pacchetto
 * torna rotto **senza che niente lo dica**: il codice compila, i test passano,
 * l'app in sviluppo va. Questo test cammina l'albero vero delle dipendenze e
 * chiede che ognuna sia nominata in `asarUnpack`. È l'unico posto in cui quella
 * verità può essere controllata prima di pubblicare.
 */

const RADICE = join(__dirname, '..', '..')

/** Tutte le dipendenze di un pacchetto, comprese quelle delle sue dipendenze. */
function alberoDi(nome: string, viste = new Set<string>()): Set<string> {
  if (viste.has(nome)) return viste
  const manifesto = join(RADICE, 'node_modules', nome, 'package.json')
  if (!existsSync(manifesto)) return viste
  viste.add(nome)
  try {
    const pkg = JSON.parse(readFileSync(manifesto, 'utf8')) as { dependencies?: Record<string, string> }
    for (const figlia of Object.keys(pkg.dependencies ?? {})) alberoDi(figlia, viste)
  } catch {
    // Un manifesto illeggibile e' un problema di npm, non di questo test.
  }
  return viste
}

describe('il pacchetto porta ssh2 per intero', () => {
  it('ogni dipendenza di ssh2 e nominata in asarUnpack', () => {
    const config = readFileSync(join(RADICE, 'electron-builder.yml'), 'utf8')
    const mancanti = [...alberoDi('ssh2')].filter(
      (m) => !config.includes(`node_modules/${m}/`)
    )
    expect(mancanti, `da tirare fuori dall'asar: ${mancanti.join(', ')}`).toEqual([])
  })

  it('ssh2 sta fra le dipendenze vere, non fra quelle di sviluppo', () => {
    // Una dipendenza di sviluppo non entra nel pacchetto affatto: il pannello
    // funzionerebbe solo sulla macchina di chi lo ha scritto.
    const pkg = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {})).toContain('ssh2')
  })
})
