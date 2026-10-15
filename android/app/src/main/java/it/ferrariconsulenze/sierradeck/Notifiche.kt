package it.ferrariconsulenze.sierradeck

import android.content.Context

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
 * - **versione**: una versione pronta da installare (dell'app o del computer);
 * - **collegamento**: il computer perso o ripreso, ma solo dopo [PERSO_DOPO_MS].
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
    VERSIONE("versione", "Versione pronta", "Una versione nuova dell'app o del computer, pronta da installare."),
    COLLEGAMENTO("collegamento", "Computer scollegato", "Il computer non si raggiunge da più di 5 minuti, e quando torna."),
    FILE("file", "File ricevuti", "Un file mandato dal computer al telefono. Spento di partenza: il file lo trovi comunque in File.", acceso = false)
}

object Notifiche {
    /** Una chat che ha finito il turno diventa una notizia solo dopo tre minuti di attesa. */
    const val ATTESA_CHAT_MS = 3 * 60_000L
    /** Il computer perso si dice solo dopo cinque minuti: i ricollegamenti brevi tacciono. */
    const val PERSO_DOPO_MS = 5 * 60_000L

    /** Il tipo di un avviso, dalla sua chiave. */
    fun tipoDi(chiave: String): TipoNotifica = when {
        chiave.startsWith("f:") -> TipoNotifica.FINITO
        chiave.startsWith("s:") -> TipoNotifica.FERMO
        chiave.startsWith("v:") -> TipoNotifica.VERSIONE
        chiave.startsWith("l:") -> TipoNotifica.COLLEGAMENTO
        else -> TipoNotifica.DOMANDA
    }

    /** Se quel tipo suona, con le scelte fatte (chi non ha scelto ha il valore di partenza). */
    fun suona(tipo: TipoNotifica, scelte: Map<String, Boolean>): Boolean = scelte[tipo.chiave] ?: tipo.acceso

    /** Gli avvisi che passano gli interruttori. */
    fun filtra(avvisi: List<Avvisi.Avviso>, scelte: Map<String, Boolean>): List<Avvisi.Avviso> =
        avvisi.filter { suona(tipoDi(it.chiave), scelte) }

    /**
     * Il computer raggiungibile o no, con la memoria di quando si è perso.
     * `persoDal` è il primo giro andato a vuoto; `detto` se il «perso» è già
     * stato annunciato (allora il ritorno si annuncia, altrimenti no: un
     * ricollegamento di pochi secondi non è una notizia).
     */
    data class Linea(val persoDal: Long? = null, val detto: Boolean = false)

    /** Il passo della linea a un giro: lo stato nuovo e, se serve, l'avviso. */
    fun linea(prima: Linea, raggiunto: Boolean, adesso: Long, nomePc: String): Pair<Linea, Avvisi.Avviso?> {
        val chiave = "l:computer"
        val id = Avvisi.idAvviso(Avvisi.ID_COLLEGAMENTO, chiave)
        if (raggiunto) {
            if (!prima.detto) return Linea() to null
            val minuti = prima.persoDal?.let { ((adesso - it) / 60_000L).coerceAtLeast(1) }
            return Linea() to Avvisi.Avviso(
                chiave = "$chiave:tornato", titolo = "$nomePc è di nuovo raggiungibile",
                testo = if (minuti != null) "Era irraggiungibile da $minuti min." else "Il collegamento è tornato.", id = id
            )
        }
        val dal = prima.persoDal ?: adesso
        if (prima.detto || adesso - dal < PERSO_DOPO_MS) return Linea(dal, prima.detto) to null
        return Linea(dal, true) to Avvisi.Avviso(
            chiave = "$chiave:perso", titolo = "$nomePc non si raggiunge",
            testo = "Da ${(adesso - dal) / 60_000L} min nessuna risposta: è spento, oppure il telefono è fuori dalla rete di casa e senza Tailscale.", id = id
        )
    }

    // ── Le scelte, in SharedPreferences ──
    private const val PREFERENZE = "notifiche"
    private const val PERSO_DAL = "linea.persoDal"
    private const val DETTO = "linea.detto"

    fun scelte(c: Context): Map<String, Boolean> {
        val p = c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE)
        return TipoNotifica.values().filter { p.contains(it.chiave) }.associate { it.chiave to p.getBoolean(it.chiave, it.acceso) }
    }

    fun scegli(c: Context, tipo: TipoNotifica, acceso: Boolean) {
        c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().putBoolean(tipo.chiave, acceso).apply()
    }

    fun leggiLinea(c: Context): Linea {
        val p = c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE)
        return Linea(if (p.contains(PERSO_DAL)) p.getLong(PERSO_DAL, 0L) else null, p.getBoolean(DETTO, false))
    }

    fun salvaLinea(c: Context, l: Linea) {
        val e = c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit()
        if (l.persoDal != null) e.putLong(PERSO_DAL, l.persoDal) else e.remove(PERSO_DAL)
        e.putBoolean(DETTO, l.detto).apply()
    }
}
