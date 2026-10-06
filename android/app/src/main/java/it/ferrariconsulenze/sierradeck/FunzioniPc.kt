package it.ferrariconsulenze.sierradeck

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/*
 * L'app con un computer più vecchio (0.43.0, app 2.46.0).
 *
 * Nicholas (02/10): l'app «sia sempre compatibile con le versioni
 * precedenti». Tre cose:
 * - si legge il JSON con tolleranza (`Api.json`: campi sconosciuti ignorati,
 *   campi nuovi facoltativi con un predefinito);
 * - il computer dice la sua versione (`/api/ciao` da sempre, `/api/stato`
 *   dalla 0.43.0): una funzione che lui non ha ancora si mostra spenta, con
 *   «arriva aggiornando il PC alla X», invece di provarci e fallire;
 * - se la versione non si sa e la rotta risponde 404 (o 409: la conosce ma
 *   non sa farla), si dice lo stesso, mai un «HTTP 404» secco.
 *
 * Le versioni minime vengono dalla cronologia di git (il primo commit che ha
 * la rotta, `git describe --contains`), non dalla memoria.
 */
enum class FunzionePc(val minima: String, val nome: String) {
    DIALOGO_AUTOPILOTA("0.27.0", "Il dialogo con gli autopiloti"),
    DOMANDE("0.30.0", "La sezione Domande"),
    FILE_AUTOPILOTA("0.38.0", "La linguetta File"),
    STRADA_PC("0.40.0", "La strada verso gli altri PC"),
    ISTRUZIONI("0.41.0", "La linguetta Istruzioni"),
    CORREGGI("0.41.0", "«Correggi» sulle istruzioni"),
    SALUTE("0.44.0", "La salute del sistema"),
    PONTE("0.48.0", "Le chat degli altri PC dal vivo"),
    ALLEGATI("0.50.0", "Mandare file dal telefono")
}

/** La versione del computer a cui si è collegati, quando la si sa. */
object PcCorrente {
    var versione by mutableStateOf<String?>(null)
}

object FunzioniPc {
    /**
     * C'è sul computer? `true` o `false` quando la versione si sa, `null`
     * quando no (allora si prova, e un 404 dice di no).
     */
    fun disponibile(f: FunzionePc, versionePc: String?): Boolean? {
        if (versionePc.isNullOrBlank() || !Regex("""^\d+\.\d+\.\d+""").containsMatchIn(versionePc)) return null
        return !Aggiornamenti.piuNuova(versionePc, f.minima)
    }

    /** Il testo della funzione spenta. */
    fun testoMancante(f: FunzionePc): String = "${f.nome} arriva aggiornando il PC alla ${f.minima}."

    /**
     * L'errore vuol dire «il computer non ha ancora questa funzione»? Un 409
     * (la conosce ma non sa farla) o il 404 generico di una rotta sconosciuta
     * (`{"errore":"non trovato"}`, uguale dalla 0.5 in poi). Un 404 con un altro
     * motivo («autopilota inesistente») e' un'altra cosa, e si dice com'e'.
     */
    fun mancaSulPc(e: Throwable): Boolean =
        e is Api.Errore && (e.codice == 409 || (e.codice == 404 && e.corpo.contains("\"non trovato\"")))

    /** Cosa dire per un errore di una funzione: spenta se manca sul computer, altrimenti il motivo. */
    fun spiega(e: Throwable, f: FunzionePc): String =
        if (mancaSulPc(e)) testoMancante(f) else e.message ?: "il computer non risponde"
}
