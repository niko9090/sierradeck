import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * Scrive un file per intero o non lo scrive affatto.
 *
 * Su file temporaneo e poi rinomina: una scrittura interrotta a metà — chiusura
 * brutale, disco pieno, corrente che va via — non deve distruggere quello che
 * c'era prima. La rinomina sullo stesso volume è atomica, quindi il file
 * definitivo è sempre uno dei due contenuti interi, mai un troncone e mai il
 * vuoto.
 *
 * Il nome del temporaneo **non è fisso** apposta: due scrittori sovrapposti —
 * due finestre, o il servizio autopilota accanto al programma — si
 * contenderebbero lo stesso file, e uno dei due salvataggi sparirebbe con un
 * solo `console.error` a testimoniarlo. La regola era già scritta per
 * `workspaces.json`; questo modulo è dove smette di essere la regola di un file
 * solo, ora che ogni modifica si salva all'istante invece che 600 ms dopo.
 *
 * Non solleva mai: chi salva è dentro un canale a senso unico o dentro la
 * chiusura di una finestra, e non ha nessun posto dove far risalire
 * un'eccezione. Restituisce se ha scritto, e registra il perché quando no.
 *
 * `etichetta` è il nome che compare nel log — `workspace`, `etichette`,
 * `autopilota` — perché il messaggio dica *cosa* non è stato salvato a chi
 * legge una console con dentro tre processi.
 */
export function scriviAtomico(
  percorso: string,
  contenuto: string,
  etichetta: string,
  opzioni: { mode?: number } = {}
): boolean {
  const temporaneo = `${percorso}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporaneo, contenuto, {
      encoding: 'utf8',
      // I permessi si danno alla nascita del file, non dopo: fra la creazione e
      // una `chmod` successiva ci sarebbe una finestra in cui il token
      // dell'API è leggibile da chiunque.
      ...(opzioni.mode !== undefined ? { mode: opzioni.mode } : {})
    })
    renameSync(temporaneo, percorso)
    return true
  } catch (err) {
    console.error(`[${etichetta}] salvataggio in ${percorso} fallito:`, err)
    try {
      // Il residuo va tolto comunque: nessuno tornerà a raccoglierlo, e con un
      // salvataggio a ogni modifica se ne accumulerebbe uno per fallimento.
      if (existsSync(temporaneo)) unlinkSync(temporaneo)
    } catch {
      console.error(`[${etichetta}] residuo non rimosso: ${temporaneo}`)
    }
    return false
  }
}

/**
 * Come `scriviAtomico`, ma è lei a produrre il JSON.
 *
 * La conversione sta **dentro** la protezione e non fuori, per una ragione
 * concreta: un valore che `JSON.stringify` non sa serializzare — un BigInt
 * arrivato da un ingresso non fidato, un ciclo — solleverebbe nel bel mezzo di
 * un salvataggio, e l'eccezione risalirebbe dentro un canale IPC a senso unico
 * o dentro la chiusura di una finestra, dove nessuno la raccoglie. Registrata e
 * basta, invece, costa il salvataggio di quel giro e nient'altro.
 */
export function scriviJsonAtomico(
  percorso: string,
  valore: unknown,
  etichetta: string,
  opzioni: { mode?: number } = {}
): boolean {
  let testo: string
  try {
    testo = JSON.stringify(valore, null, 2)
  } catch (err) {
    console.error(`[${etichetta}] salvataggio in ${percorso} fallito:`, err)
    return false
  }
  return scriviAtomico(percorso, testo, etichetta, opzioni)
}
