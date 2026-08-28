package it.ferrariconsulenze.sierradeck

import android.content.Context

/**
 * Che il computer si stia aggiornando, ricordato **sul telefono**.
 *
 * Deve stare qui e non sul computer per una ragione ovvia appena la si dice: il
 * computer, mentre si aggiorna, **è spento**. Non c'è nessuno a cui chiedere a
 * che punto è. L'unico che può raccontare quei trenta secondi è chi guarda, e
 * l'unica cosa che può fare è ricordarsi che sono cominciati.
 *
 * Prima non se ne ricordava nessuno: si premeva «Installa» e da lì in poi lo
 * schermo del telefono diceva le stesse cose di un computer scollegato — cioè
 * niente, o peggio, un errore. Un aggiornamento che va bene e un cavo staccato
 * si vedevano identici.
 *
 * Sopravvive alla chiusura dell'app di proposito: si preme «Installa», si mette
 * via il telefono, e riaprendolo si vuole ancora sapere com'è finita.
 */
object Installazione {

    private const val CHIAVE_DA = "installazione-da"
    private const val CHIAVE_VERSIONE = "installazione-versione-prima"

    /**
     * Oltre questo non è più un'installazione, è una cosa andata storta.
     *
     * Dieci minuti sono larghi apposta: l'installer copia file, aspetta che il
     * programma vecchio muoia, a volte aggiorna anche Claude Code nello stesso
     * viaggio. Ma non sono infiniti — una schermata che dice «sto installando»
     * per sempre è peggio di una che ammette di non sapere.
     */
    const val TROPPO_MS = 10 * 60 * 1000L

    private fun prefs(contesto: Context) =
        contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    /** Segna che è cominciata adesso, ricordando che versione c'era prima. */
    fun iniziata(contesto: Context, versionePrima: String?) {
        prefs(contesto).edit()
            .putLong(CHIAVE_DA, System.currentTimeMillis())
            .putString(CHIAVE_VERSIONE, versionePrima ?: "")
            .apply()
    }

    fun finita(contesto: Context) {
        prefs(contesto).edit().remove(CHIAVE_DA).remove(CHIAVE_VERSIONE).apply()
    }

    /** Da quando, o `null` se non ce n'è una in corso. */
    fun da(contesto: Context): Long? {
        val quando = prefs(contesto).getLong(CHIAVE_DA, 0L)
        if (quando <= 0L) return null
        // Un'installazione cominciata ieri non è in corso: è una nota che
        // qualcuno ha dimenticato di cancellare, e va tolta di mezzo da sola.
        if (System.currentTimeMillis() - quando > TROPPO_MS) {
            finita(contesto)
            return null
        }
        return quando
    }

    /** Che versione aveva il computer prima: serve a riconoscere che è cambiata. */
    fun versionePrima(contesto: Context): String =
        prefs(contesto).getString(CHIAVE_VERSIONE, "") ?: ""
}
