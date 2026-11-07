package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/** La lista d'attesa degli specialisti, come la dà il PC (/api/specialisti/attesa): stessa forma di `VistaAttesa`. */
@Serializable
data class VistaAttesaApp(
    val posti: PostiAttesa = PostiAttesa(),
    val alLavoro: List<LavoroAttesa> = emptyList(),
    val inFila: List<FilaAttesa> = emptyList(),
    /** Il lavoro che resta per svuotare la lista (k-53); assente su un PC più vecchio. */
    val totale: TotaleAttesa? = null
)

@Serializable
data class TotaleAttesa(val minuti: Double = 0.0, val compiti: Int = 0)

@Serializable
data class PostiAttesa(val usati: Int = 0, val tetto: Int = 0)

@Serializable
data class LavoroAttesa(
    val posto: Int = 0,
    val id: String = "",
    val workspace: String = "",
    val compito: String? = null,
    val descrizione: String = "",
    val tipo: String = "",
    val dal: String = "",
    // La stima (k-53): tutti facoltativi, un PC vecchio non li manda.
    val workspaceNome: String? = null,
    val titolo: String? = null,
    val cosaFa: String? = null,
    val percentuale: Double? = null,
    val minutiStimati: Double? = null,
    val inRitardo: Boolean = false,
    val precedenza: Int? = null,
    val fermaRichiesta: Boolean = false
)

@Serializable
data class FilaAttesa(
    val id: String = "",
    val posizione: Int = 0,
    val workspace: String = "",
    val compito: String? = null,
    val descrizione: String = "",
    val tipo: String = "",
    val dal: String = "",
    val priorita: Int = 0,
    val prenotata: Boolean = false,
    val prenotataFino: String? = null,
    val workspaceNome: String? = null,
    val titolo: String? = null,
    val cosaFa: String? = null,
    val minutiStimati: Double? = null,
    val inRitardo: Boolean = false,
    val parcheggiata: Boolean = false,
    val ramo: String? = null
)

/** Una riga da mostrare, già in parole. */
data class RigaAttesa(
    val id: String,
    /** «Posto 2» o «3°». */
    val etichetta: String,
    val compito: String?,
    val descrizione: String,
    /** La seconda riga: workspace, tipo, tempi, priorità, «tocca a lui». */
    val dettaglio: String,
    val toccaALui: Boolean,
    val puoSalire: Boolean,
    val puoScendere: Boolean,
    /** Solo chi lavora: da 0 a 95. */
    val percentuale: Int? = null,
    /** «cosa fa» in pochissime parole, o vuoto. */
    val cosaFa: String = "",
    /** «mancano circa 12 min · in ritardo», o vuoto. */
    val stima: String = "",
    /** Chi lavora e non ha già la fermata chiesta: si può fermare. */
    val puoFermare: Boolean = false,
    val fermaRichiesta: Boolean = false
)

data class SchermataSpecialisti(
    val posti: String,
    val alLavoro: List<RigaAttesa>,
    val inFila: List<RigaAttesa>,
    /** Il servizio del PC è vecchio e non sa la lista (posti 0). */
    val vecchio: Boolean,
    /** «Circa 40 min per finire tutto · 3 compiti», o vuoto. */
    val totale: String = ""
)

/** Le parole della schermata «Specialisti»: funzioni pure, stesse frasi del PC e della pagina del telefono. */
object SpecialistiAttesa {
    const val SPIEGAZIONE =
        "Ogni specialista che lavora occupa un posto, e i posti di questo computer sono pochi. " +
            "Quando sono tutti pieni, chi ne chiede uno resta in fila. Appena un posto si libera, il primo della fila " +
            "lo ha prenotato per qualche minuto e il suo autopilota viene svegliato; se non lo usa passa al successivo. " +
            "Con ↑, ↓ e «In cima» cambi l’ordine; «Togli» fa uscire la richiesta dalla fila."

    /** Il nome del workspace, anche se arriva un percorso: l'ultimo pezzo. */
    fun nomeWorkspace(ws: String): String {
        val t = ws.trimEnd('/', '\\')
        val ultimo = t.split('/', '\\').lastOrNull().orEmpty()
        return if (ultimo.isNotEmpty()) ultimo else if (t.isEmpty()) "senza nome" else t
    }

    /** Da quanto: «meno di 1 min», «5 min», «2 h 10 min», «3 giorni». Vuoto se l'ora non si legge. */
    fun daQuanto(dal: String, adesso: Long): String {
        val t = oraIso(dal) ?: return ""
        val min = (maxOf(0L, adesso - t) / 60_000).toInt()
        if (min < 1) return "meno di 1 min"
        if (min < 60) return "$min min"
        val ore = min / 60
        val resto = min % 60
        if (ore < 48) return "$ore h" + if (resto > 0) " $resto min" else ""
        return "${ore / 24} giorni"
    }

    /** Quanto manca alla fine della prenotazione: «4 min», «30 s», «scaduta». Vuoto se non c'è. */
    fun quantoManca(fino: String?, adesso: Long): String {
        if (fino == null) return ""
        val t = oraIso(fino) ?: return ""
        val s = Math.ceil((t - adesso) / 1000.0).toLong()
        if (s <= 0) return "scaduta"
        if (s < 60) return "$s s"
        return "${Math.ceil(s / 60.0).toLong()} min"
    }

    /** Minuti a parole: «meno di 1 min», «12 min», «1 h 20 min». */
    fun minutiTesto(min: Double): String {
        val m = Math.round(maxOf(0.0, min)).toInt()
        if (m < 1) return "meno di 1 min"
        if (m < 60) return "$m min"
        return "${m / 60} h" + if (m % 60 > 0) " ${m % 60} min" else ""
    }

    /** Il lavoro che resta per tutta la lista: «Circa 40 min per finire tutto · 3 compiti». */
    fun totaleTesto(minuti: Double, compiti: Int): String {
        val m = Math.round(maxOf(0.0, minuti)).toInt()
        val quanto = if (m < 1) "Meno di 1 min" else "Circa " + minutiTesto(m.toDouble())
        return "$quanto per finire tutto · $compiti " + if (compiti == 1) "compito" else "compiti"
    }

    /** Il «?» delle stime e della precedenza, stesse parole del PC. */
    const val SPIEGA_STIME =
        "I minuti si stimano dalla durata vera dei compiti simili già finiti. La percentuale non arriva a 100 finché il lavoro non è finito; " +
            "«in ritardo» vuol dire che ha superato il tempo atteso. Il totale conta il lavoro di tutti, con i posti che lavorano in parallelo. " +
            "«Precedenza» fa passare il workspace davanti agli altri al prossimo posto libero e non ferma mai chi lavora. " +
            "«Ferma» invece lo ferma, con il lavoro salvato, e lo mette in cima alla fila: lo decidi solo tu."

    fun postiTesto(usati: Int, tetto: Int): String {
        val u = maxOf(0, usati)
        return if (tetto == 1) "$u di 1 posto occupato" else "$u di $tetto posti occupati"
    }

    fun prioritaTesto(n: Int): String = if (n == 0) "normale" else if (n > 0) "alta $n" else "bassa ${-n}"

    /** Dalla risposta del PC alle righe da mostrare. */
    fun schermata(v: VistaAttesaApp, adesso: Long): SchermataSpecialisti {
        if (v.posti.tetto <= 0) return SchermataSpecialisti("", emptyList(), emptyList(), vecchio = true)
        val lavoro = v.alLavoro.map { x ->
            RigaAttesa(
                id = x.id, etichetta = "Posto ${x.posto}", compito = x.compito?.ifBlank { null }, descrizione = x.titolo?.ifBlank { null } ?: x.descrizione,
                dettaglio = listOf(x.workspaceNome?.ifBlank { null } ?: nomeWorkspace(x.workspace), x.tipo, "lavora da " + daQuanto(x.dal, adesso).ifEmpty { "?" },
                    if ((x.precedenza ?: 0) > 0) "precedenza ${x.precedenza}" else "")
                    .filter { it.isNotEmpty() }.joinToString(" · "),
                toccaALui = false, puoSalire = false, puoScendere = false,
                percentuale = x.percentuale?.let { Math.round(it).toInt().coerceIn(0, 95) },
                cosaFa = x.cosaFa.orEmpty().trim(),
                stima = listOf(x.minutiStimati?.let { "mancano circa " + minutiTesto(it) } ?: "", if (x.inRitardo) "in ritardo" else "")
                    .filter { it.isNotEmpty() }.joinToString(" · "),
                puoFermare = !x.fermaRichiesta, fermaRichiesta = x.fermaRichiesta
            )
        }
        val fila = v.inFila.mapIndexed { i, x ->
            val manca = if (x.prenotata) quantoManca(x.prenotataFino, adesso) else ""
            val tocca = if (!x.prenotata) "" else " · tocca a lui" + when (manca) { "" -> ""; "scaduta" -> " (scaduta)"; else -> " (ancora $manca)" }
            RigaAttesa(
                id = x.id, etichetta = "${x.posizione}°", compito = x.compito?.ifBlank { null }, descrizione = x.titolo?.ifBlank { null } ?: x.descrizione,
                dettaglio = listOf((x.workspaceNome?.ifBlank { null } ?: nomeWorkspace(x.workspace)) + if (x.parcheggiata) " · fermato, riparte per primo" else "",
                    x.tipo, "aspetta da " + daQuanto(x.dal, adesso).ifEmpty { "?" },
                    x.minutiStimati?.let { "circa " + minutiTesto(it) + " per finire" } ?: "", "priorità " + prioritaTesto(x.priorita))
                    .filter { it.isNotEmpty() }.joinToString(" · ") + tocca,
                toccaALui = x.prenotata, puoSalire = (i > 0), puoScendere = (i < v.inFila.size - 1)
            )
        }
        return SchermataSpecialisti(postiTesto(v.posti.usati, v.posti.tetto), lavoro, fila, vecchio = false,
            totale = v.totale?.let { totaleTesto(it.minuti, it.compiti) } ?: "")
    }

    /** Il titolo di una riga: «k-48 descrizione» o solo la descrizione. */
    fun titolo(r: RigaAttesa): String = if (r.compito != null) "${r.compito} ${r.descrizione}" else r.descrizione

    /** L'avviso quando la rete non va. */
    fun avvisoRete(mossa: Boolean): String =
        if (mossa) "Non è andata: il computer non ha risposto. Riprova tra poco."
        else "Non riesco a leggere la lista: il computer non risponde."

    private fun oraIso(s: String): Long? = try { java.time.Instant.parse(s).toEpochMilli() } catch (_: Exception) { null }
}
