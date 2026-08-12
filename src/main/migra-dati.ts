import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La cartella dove il programma tiene le sue cose, portandosi dietro quelle di
 * prima se ha cambiato nome.
 *
 * Il nome della cartella dati segue il nome del programma, e cambiarlo senza
 * spostare ciò che c'era dentro significherebbe — per chi lo usa — aver perso
 * da un avvio all'altro gli autopiloti, i salvataggi delle sessioni, i nomi
 * dati alle chat e l'indice. Roba di settimane, sparita senza un messaggio.
 *
 * Tre regole, tutte prudenti:
 *
 * 1. Se la cartella nuova **c'è già**, è quella buona: la migrazione è già
 *    avvenuta, e rifarla sovrascriverebbe il lavoro di oggi con quello di ieri.
 * 2. Se la vecchia non c'è, non c'è niente da portare: si parte puliti.
 * 3. Se lo spostamento **fallisce** — cartella occupata da un altro processo,
 *    un antivirus di mezzo — si continua a usare la vecchia. Ripartire da una
 *    cartella vuota sarebbe il danno che questa funzione esiste per evitare.
 */
export function cartellaDati(
  appData: string,
  nomeVecchio: string,
  nomeNuovo: string,
  /** Iniettato per poter provare cosa succede quando il rinomino non riesce. */
  rinomina: (da: string, a: string) => void = (da, a) => renameSync(da, a)
): string {
  const nuova = join(appData, nomeNuovo)
  const vecchia = join(appData, nomeVecchio)

  if (existsSync(nuova)) return nuova

  if (existsSync(vecchia)) {
    try {
      rinomina(vecchia, nuova)
      console.info(`[dati] cartella spostata da ${nomeVecchio} a ${nomeNuovo}`)
      return nuova
    } catch (err) {
      console.error(
        `[dati] ${vecchia} non si e' potuta spostare in ${nuova}: continuo a usare la vecchia`,
        err
      )
      return vecchia
    }
  }

  mkdirSync(nuova, { recursive: true })
  return nuova
}
