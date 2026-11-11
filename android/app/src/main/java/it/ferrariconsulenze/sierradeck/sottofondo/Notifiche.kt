package it.ferrariconsulenze.sierradeck.sottofondo

import android.content.Context
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave

/**
 * Quali notifiche arrivano (app 2.74.0). Nicholas, 15/10: «ne arrivano troppe
 * e senza alcuna rilevanza, devi ricevere solo notifiche utili».
 *
 * Restano cinque tipi, ognuno con il suo interruttore nelle impostazioni:
 * - **domande**: una domanda, una scelta, un autopilota che aspetta il via, una
 *   chat che aspetta te da almeno [ATTESA_CHAT_MS] (le pause brevi fra un turno
 *   e l'altro non sono una notizia);
 * - **finito**: un lavoro finito;
 * - **fermo**: un lavoro fermo per un errore;
 * - **versione**: una versione pronta da installare (dell'app o del computer).
 *   Spenta di partenza dalla 2.81.0: le notifiche sono solo per una domanda
 *   che aspetta te, un lavoro finito, un errore che blocca. La banda nell'app resta;
 * - (il computer perso o ripreso non si annuncia più dalla 2.100.0: lo dice la
 *   riga dell'ascolto, e la schermata «Notifiche».)
 *
 * Il resto non suona più: i file consegnati al telefono hanno il loro
 * interruttore, spento di partenza; i cambi di stato brevi, i battiti e i
 * ricollegamenti di pochi secondi non diventano mai notifiche.
 *
 * Le notifiche uguali sono una sola per chat (o per autopilota): un evento
 * nuovo **aggiorna** quella che c'è, non ne aggiunge un'altra.
 */
enum class TipoNotifica(val chiave: String, val nome: String, val spiega: String, val acceso: Boolean = true) {
    DOMANDA("domanda", "Domande e attese", "Una domanda o una scelta che aspetta te, un autopilota che aspetta il via, una chat che aspetta te da almeno 3 minuti."),
    FINITO("finito", "Lavoro finito", "Un autopilota che ha finito il suo lavoro."),
    FERMO("fermo", "Lavoro fermo", "Un autopilota che si è fermato per un errore e ha bisogno di te."),
    VERSIONE("versione", "Versione pronta", "Una versione nuova dell'app o del computer, pronta da installare. Spenta di partenza: la vedi comunque nella banda in alto.", acceso = false),
    FILE("file", "File ricevuti", "Un file mandato dal computer al telefono. Spento di partenza: il file lo trovi comunque in File.", acceso = false)
}

object Notifiche {
    /** Una chat che ha finito il turno diventa una notizia solo dopo tre minuti di attesa. */
    const val ATTESA_CHAT_MS = 3 * 60_000L

    /** Il tipo di un avviso, dalla sua chiave. */
    fun tipoDi(chiave: String): TipoNotifica = when {
        chiave.startsWith("f:") -> TipoNotifica.FINITO
        chiave.startsWith("s:") -> TipoNotifica.FERMO
        chiave.startsWith("v:") -> TipoNotifica.VERSIONE
        else -> TipoNotifica.DOMANDA
    }

    /** Se quel tipo suona, con le scelte fatte (chi non ha scelto ha il valore di partenza). */
    fun suona(tipo: TipoNotifica, scelte: Map<String, Boolean>): Boolean = scelte[tipo.chiave] ?: tipo.acceso

    /** Gli avvisi che passano gli interruttori. */
    fun filtra(avvisi: List<Avvisi.Avviso>, scelte: Map<String, Boolean>): List<Avvisi.Avviso> =
        avvisi.filter { suona(tipoDi(it.chiave), scelte) }

    // ── Le scelte, in SharedPreferences ──
    private const val PREFERENZE = "notifiche"

    fun scelte(c: Context): Map<String, Boolean> {
        val p = c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE)
        return TipoNotifica.values().filter { p.contains(it.chiave) }.associate { it.chiave to p.getBoolean(it.chiave, it.acceso) }
    }

    fun scegli(c: Context, tipo: TipoNotifica, acceso: Boolean) {
        c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().putBoolean(tipo.chiave, acceso).apply()
    }
}
