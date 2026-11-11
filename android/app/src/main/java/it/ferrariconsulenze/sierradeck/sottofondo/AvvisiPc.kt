package it.ferrariconsulenze.sierradeck.sottofondo

import kotlinx.serialization.Serializable

/**
 * Gli avvisi come li scrive il PC (PC 0.101.0, `src/shared/avvisi-telefono.ts`):
 * un solo registro numerato, letto con `GET /api/eventi?avvisi=<ultimo>&attesa=50`.
 *
 * Il PC decide già tutto quello che si può decidere alla fonte: quali tipi
 * nascono, se suona (impostazioni, ore di silenzio, suoni vicini), le parole.
 * Qui resta solo come mostrarlo su Android: un canale per tipo, una notifica
 * per avviso, i tasti, e niente di niente quando l'app è davanti.
 */
@Serializable
data class AvvisoPc(
    val n: Long,
    val id: String,
    val tipo: String,
    val titolo: String,
    val testo: String = "",
    val sotto: String? = null,
    val quando: String = "",
    val scadeIl: String? = null,
    val bersaglio: BersaglioAvviso = BersaglioAvviso(),
    val azioni: List<AzioneAvviso> = emptyList(),
    val suona: Boolean = false,
    val chiuso: ChiusuraAvviso? = null
)

@Serializable
data class BersaglioAvviso(
    val cosa: String = "",
    val id: String = "",
    val pc: String? = null,
    val autopilota: String? = null
)

@Serializable
data class AzioneAvviso(val etichetta: String, val risposta: String)

@Serializable
data class ChiusuraAvviso(val quando: String = "", val come: String = "", val testo: String? = null)

/** La risposta di `/api/eventi`. */
@Serializable
data class RispostaEventi(val ultimo: Long = 0, val stato: Long = 0, val avvisi: List<AvvisoPc> = emptyList())

/** Cosa fare di un avviso sul telefono. */
sealed interface Gesto {
    /** Mostrarlo (o aggiornarlo); `suona` false = arriva in silenzio. */
    data class Mostra(val suona: Boolean) : Gesto
    /** Togliere la notifica, se c'è. */
    data object Togli : Gesto
    /** Sostituirla con una riga silenziosa («Ho scelto io: …»). */
    data class Sostituisci(val titolo: String, val testo: String) : Gesto
    /** Niente: l'app è davanti, la cosa si vede già dentro. */
    data object Niente : Gesto
}

/** Un tasto della notifica: una risposta pronta o «Scrivi…» (campo libero). */
data class Tasto(val etichetta: String, val risposta: String?, val scrivi: Boolean = false)

/**
 * Le regole, pure: si provano nei test senza Android.
 */
object RegoleAvvisi {
    const val CANALE_DOMANDE = "domande-2"
    const val CANALE_FERMO = "fermo"
    const val CANALE_FATTO = "fatto"
    const val CANALE_SAPERE = "sapere"
    const val CANALE_ASCOLTO = "ascolto"
    /** I canali di prima, da cancellare: `domande` (tutto insieme) e `presenza` (la riga del controllo continuo). */
    val CANALI_VECCHI = listOf("domande", "presenza")

    /** Due avvisi a meno di 20 s: suona solo il primo (lo fa anche il PC; qui per un pacco arrivato insieme). */
    const val SUONI_VICINI_MS = 20_000L

    /** Quanto il PC tiene la richiesta (secondi, il suo massimo). */
    const val ATTESA_S = 50

    fun percorsoEventi(ultimo: Long, attesaS: Int = ATTESA_S): String = "/api/eventi?avvisi=${ultimo.coerceAtLeast(0)}&attesa=$attesaS"

    fun canale(tipo: String): String = when (tipo) {
        "domanda" -> CANALE_DOMANDE
        "fermo" -> CANALE_FERMO
        "fatto" -> CANALE_FATTO
        else -> CANALE_SAPERE
    }

    /**
     * Cosa fare di un avviso. `davanti` = l'app è aperta e si vede: allora
     * nessuna notifica di sistema (le chiusure tolgono comunque quelle vecchie).
     * `ultimoSuono` = quando ha suonato l'ultima, sul telefono.
     */
    fun gesto(a: AvvisoPc, davanti: Boolean, ultimoSuono: Long?, adesso: Long): Gesto {
        val c = a.chiuso
        if (c != null) {
            if (c.come == "programma" && !davanti) {
                val scelta = c.testo?.takeIf { it.isNotBlank() } ?: a.azioni.firstOrNull()?.etichetta
                return Gesto.Sostituisci(a.titolo, if (scelta != null) "Ho scelto io: $scelta" else "Ho scelto io")
            }
            return Gesto.Togli
        }
        // La prova si chiede dall'app aperta: deve arrivare lo stesso, o non prova niente.
        if (davanti && !eProva(a)) return Gesto.Niente
        return Gesto.Mostra(a.suona && (ultimoSuono == null || adesso - ultimoSuono >= SUONI_VICINI_MS))
    }

    fun eProva(a: AvvisoPc): Boolean = a.id.startsWith("prova:")

    /**
     * I tasti: al più tre (Android non ne mostra di più). Le risposte pronte
     * del PC, la consigliata per prima; «Scrivi…» quando resta posto e
     * l'avviso si può rispondere a parole (una domanda o una chat).
     */
    fun tasti(a: AvvisoPc): List<Tasto> {
        if (a.chiuso != null) return emptyList()
        val siScrive = a.bersaglio.cosa == "domanda" || a.bersaglio.cosa == "chat"
        val pronte = a.azioni.filter { it.etichetta.isNotBlank() }.take(3).map { Tasto(it.etichetta.take(30), it.risposta) }
        // Tre scelte (il consenso ai limiti) valgono più del campo libero.
        return if (siScrive && pronte.size < 3) pronte + Tasto("Scrivi…", null, scrivi = true) else pronte
    }

    /** Il testo da leggere a notifica chiusa: la cosa, poi «sotto» nella vista aperta. */
    fun testoCorto(a: AvvisoPc): String = a.testo.ifBlank { a.sotto ?: "" }

    fun testoLungo(a: AvvisoPc): String = listOfNotNull(a.testo.takeIf { it.isNotBlank() }, a.sotto?.takeIf { it.isNotBlank() }).joinToString("\n\n")

    /** L'attesa prima di riprovare dopo `fallimenti` giri andati a vuoto di fila. */
    fun attesaDopo(fallimenti: Int): Long = when {
        fallimenti <= 0 -> 0L
        fallimenti == 1 -> 1_000L
        fallimenti == 2 -> 2_000L
        fallimenti == 3 -> 5_000L
        fallimenti == 4 -> 10_000L
        fallimenti == 5 -> 30_000L
        else -> 60_000L
    }

    /** Un computer di prima (404 su `/api/eventi`): il giro di sempre, ogni 2 minuti. */
    const val VECCHIO_PC_OGNI_MS = 2 * 60_000L

    /** La riga fissa del servizio: dice da quanto il PC ha risposto l'ultima volta. */
    fun rigaAscolto(ultimoContatto: Long?, adesso: Long, vecchioPc: Boolean = false): String {
        if (ultimoContatto == null) return "In ascolto · il computer non ha ancora risposto"
        val min = ((adesso - ultimoContatto).coerceAtLeast(0) / 60_000L)
        val quando = when {
            min < 1 -> "adesso"
            min < 60 -> "$min min fa"
            else -> "${min / 60} h fa"
        }
        return if (vecchioPc) "In ascolto (computer da aggiornare) · ultimo contatto $quando" else "In ascolto · ultimo contatto $quando"
    }

    /** Il tocco su una notifica: dove portare (lo traduce in `Richiesta` chi apre l'app). */
    fun destinazione(cosa: String?, id: String?, autopilota: String?): Destinazione = when (cosa) {
        "domanda" -> Destinazione.Domanda(id?.takeIf { it.isNotBlank() })
        "chat" -> if (!id.isNullOrBlank()) Destinazione.Chat(id) else Destinazione.Lavori
        "workspace" -> if (!autopilota.isNullOrBlank()) Destinazione.Autopilota(autopilota) else Destinazione.Lavori
        "aggiornamenti" -> Destinazione.Aggiornamenti
        "file" -> Destinazione.File
        else -> Destinazione.Lavori
    }
}

/** Dove porta il tocco su un avviso (pura; `ToccoAvviso` la passa alle schermate). */
sealed interface Destinazione {
    data class Domanda(val id: String?) : Destinazione
    data class Chat(val id: String) : Destinazione
    data class Autopilota(val id: String) : Destinazione
    data object Lavori : Destinazione
    data object Aggiornamenti : Destinazione
    data object File : Destinazione
}
