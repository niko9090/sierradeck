package it.glos.sierradeck

import android.content.Context

/**
 * Dove sta il computer e con quale chiave ci si parla.
 *
 * Due dati soli, e non c'è ragione di averne di più: l'indirizzo lo digiti una
 * volta, la chiave arriva dall'accoppiamento a sei cifre e non scade. Tutto il
 * resto — quali chat, quali autopiloti — lo racconta il computer ogni volta,
 * perché è l'unico che lo sa davvero.
 *
 * La chiave sta nelle preferenze private dell'app: su Android nessun'altra app
 * può leggerle, ed è la stessa protezione che il sistema dà alle password
 * salvate dai browser.
 */
class Collegamento(contesto: Context) {

    private val preferenze = contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    var indirizzo: String
        get() = preferenze.getString(CHIAVE_INDIRIZZO, "") ?: ""
        set(valore) = preferenze.edit().putString(CHIAVE_INDIRIZZO, pulisci(valore)).apply()

    var chiave: String
        get() = preferenze.getString(CHIAVE_SEGRETO, "") ?: ""
        set(valore) = preferenze.edit().putString(CHIAVE_SEGRETO, valore.trim()).apply()

    /** C'è tutto quello che serve per parlare con il computer? */
    val pronto: Boolean
        get() = indirizzo.isNotEmpty()

    fun dimentica() {
        preferenze.edit().clear().apply()
    }

    /**
     * Rimette in forma quello che l'utente digita.
     *
     * Chi scrive un indirizzo su un telefono scrive `192.168.1.7`, non
     * `http://192.168.1.7:47640`. Chiedergli la forma esatta sarebbe chiedergli
     * di conoscere una cosa che il programma sa già.
     */
    private fun pulisci(grezzo: String): String {
        val testo = grezzo.trim().removeSuffix("/")
        if (testo.isEmpty()) return ""
        val conSchema = if (testo.startsWith("http://") || testo.startsWith("https://")) {
            testo
        } else {
            "http://$testo"
        }
        // Senza porta si assume la nostra: è quella che il programma usa se
        // nessuno gliene ha chiesta un'altra.
        val senzaSchema = conSchema.substringAfter("://")
        return if (senzaSchema.contains(':')) conSchema else "$conSchema:$PORTA_PREDEFINITA"
    }

    companion object {
        const val PORTA_PREDEFINITA = 47640
        private const val CHIAVE_INDIRIZZO = "indirizzo"
        private const val CHIAVE_SEGRETO = "chiave"
    }
}
