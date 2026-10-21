package it.ferrariconsulenze.sierradeck

import java.io.File
import java.security.MessageDigest

/**
 * La copia dell'ultimo stato del computer, salvata sul telefono (0.83.0).
 *
 * All'apertura l'app aspettava la rete per mostrare qualunque cosa: sulla
 * 2.82.0 la prima chat arrivava dopo 4-8 secondi. Con la copia le chat, gli
 * autopiloti e le domande di prima si vedono subito, e il primo stato che
 * arriva dal computer le sostituisce. Una copia per computer (il nome del file
 * è l'impronta dell'indirizzo, non l'indirizzo), nella cartella privata
 * dell'app: nessun'altra app la legge.
 */
internal object CopiaStato {
    /** Si riscrive al massimo ogni tanto: lo stato cambia spesso, il disco non serve a ogni giro. */
    const val OGNI_MS = 30_000L

    fun file(cartella: File, indirizzo: String): File {
        val impronta = MessageDigest.getInstance("SHA-256").digest(indirizzo.toByteArray())
            .take(8).joinToString("") { "%02x".format(it) }
        return File(cartella, "stato-$impronta.json")
    }

    /** Scrive prima un file a parte e poi lo rinomina: una copia a metà non si legge mai. */
    fun salva(cartella: File, indirizzo: String, grezzo: String): Boolean = try {
        cartella.mkdirs()
        val f = file(cartella, indirizzo)
        val tmp = File(cartella, f.name + ".tmp")
        tmp.writeText(grezzo)
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) } else true
    } catch (_: Exception) { false }

    /** Lo stato salvato, o `null` se non c'è o non si legge (una versione vecchia, un file rovinato). */
    fun leggi(cartella: File, indirizzo: String): Stato? = try {
        val f = file(cartella, indirizzo)
        if (f.isFile) Api.json.decodeFromString<Stato>(f.readText()) else null
    } catch (_: Exception) { null }

    /** Si dimentica il computer: via anche la sua copia. */
    fun dimentica(cartella: File, indirizzo: String) { file(cartella, indirizzo).delete() }
}

/**
 * Lo stato ogni 2 secondi, decodificato solo se è cambiato (0.83.0).
 *
 * Il computer manda 14 KB a ogni giro, quasi sempre uguali ai precedenti.
 * Prima ogni giro li decodificava e sostituiva lo stato, e ogni schermata che
 * lo legge si ridisegnava. Adesso, se il testo è identico all'ultimo, torna
 * **lo stesso oggetto**: niente lavoro, niente ridisegno. Se è cambiato, le
 * parti uguali (chat, autopiloti, domande) restano gli oggetti di prima,
 * così le schermate che leggono solo quelle non si ridisegnano.
 */
internal class StatoSoloSeCambia(private val decodifica: (String) -> Stato) {
    private var testo: String? = null
    private var ultimo: Stato? = null

    /** Quante volte ha decodificato davvero: per i test e le misure. */
    var decodifiche = 0
        private set

    /** Riparte da uno stato già noto (la copia salvata). */
    fun parteDa(stato: Stato?) { ultimo = stato; testo = null }

    /** Lo stato per questo testo, e se è cambiato rispetto all'ultimo. */
    fun leggi(grezzo: String): Pair<Stato, Boolean> {
        val prima = ultimo
        if (grezzo == testo && prima != null) return prima to false
        val nuovo = decodifica(grezzo).also { decodifiche += 1 }
        val tenuto = if (prima == null) nuovo else tieniUguali(prima, nuovo)
        testo = grezzo
        ultimo = tenuto
        return tenuto to (tenuto !== prima)
    }

    companion object {
        /**
         * Il nuovo stato con dentro, dove sono uguali, gli oggetti di prima: Compose
         * confronta con `equals`, e la stessa lista si riconosce subito, una lista
         * nuova uguale solo dopo averla percorsa tutta.
         */
        fun tieniUguali(prima: Stato, nuovo: Stato): Stato {
            if (prima == nuovo) return prima
            return nuovo.copy(
                chat = if (prima.chat == nuovo.chat) prima.chat else nuovo.chat,
                autopiloti = if (prima.autopiloti == nuovo.autopiloti) prima.autopiloti else nuovo.autopiloti,
                domande = if (prima.domande == nuovo.domande) prima.domande else nuovo.domande
            )
        }
    }
}

/**
 * Chiavi stabili per le righe di una lista pigra (0.83.0), quando gli elementi
 * non hanno un id: si costruiscono dal contenuto. Due righe identiche (lo
 * stesso «ok» mandato due volte) avrebbero la stessa chiave, e una LazyColumn
 * con due chiavi uguali si chiude con un errore: la seconda diventa «firma#2».
 */
internal object ChiaviElenco {
    fun <T> di(elementi: List<T>, firma: (T) -> String): List<String> {
        val viste = HashMap<String, Int>()
        return elementi.map { e ->
            val f = firma(e)
            val n = (viste[f] ?: 0) + 1
            viste[f] = n
            if (n == 1) f else "$f#$n"
        }
    }

    fun messaggio(m: MessaggioConversazione) = "m|${m.quando}|${m.da}|${m.testo.hashCode()}"

    /** Senza `volte`: una battuta ripetuta cambia il contatore, non la riga. */
    fun battuta(b: Battuta) = "b|${b.quando}|${b.da}|${b.testo.hashCode()}"
}
