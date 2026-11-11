package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * **Cosa mostra «Lavoro»** (app 11/11), senza Compose: le domande per te in
 * cima, poi i workspace in ordine. Si prova su JVM (`VistaLavoroTest`).
 */
enum class Linea { COLLEGO, VECCHI, OK }

enum class TipoDomanda { NORMALE, CONSENSO, UNISCI }

data class SceltaLavoro(
    /** Quello che si manda al PC. */
    val testo: String,
    /** Quello che si legge sul tasto. */
    val etichetta: String,
    val consigliata: Boolean = false,
    /** Il consenso: cosa succede con questo tasto, in una riga. */
    val conseguenza: String? = null,
    /** «Sì, sempre»: chiede conferma prima di partire. */
    val conConferma: Boolean = false
)

data class DomandaLavoro(
    val chiave: String,
    val chi: String,
    val testo: String,
    val tipo: TipoDomanda,
    val scelte: List<SceltaLavoro>,
    val rigaSotto: String?,
    val rischiosa: Boolean,
    val via: ViaRisposta,
    val autopilota: String?,
    /** Si può scrivere una risposta tua («Scrivi tu»). */
    val libera: Boolean,
    val segnaposto: String,
    /** Già risposta da qui: «Hai risposto: …», senza tasti. */
    val risposta: String? = null
)

data class VistaLavoro(
    val linea: Linea,
    /** L'ora dei dati quando sono vecchi (per «Vedo i dati delle HH:MM»). */
    val quando: Long,
    val domande: List<DomandaLavoro>,
    val schede: List<SchedaWorkspace>,
    /** «Versione X pronta»: il PC ha un aggiornamento da installare. */
    val versionePronta: String?
) {
    val nessunWorkspace: Boolean get() = linea != Linea.COLLEGO && schede.isEmpty()
}

object ComponiLavoro {
    private val CONSEGUENZE = mapOf(
        "no" to "Non lo fa: resta fermo su questo.",
        "sì, questa volta" to "Lo fa solo adesso; la prossima volta ti richiede.",
        "sì, sempre" to "Lo fa ora e non te lo chiede più per questo."
    )

    fun componi(
        stato: Stato?, quando: Long, vecchia: Boolean,
        conversazioni: List<Conversazione>,
        risposte: Map<String, String>,
        ora: Long
    ): VistaLavoro {
        val linea = when {
            stato == null -> Linea.COLLEGO
            vecchia -> Linea.VECCHI
            else -> Linea.OK
        }
        val aperte = conversazioni.filter { c ->
            c.scheda != null && (risposte.containsKey(c.chiave) ||
                (c.chiede && c.scheda.decisa == null && c.scheda.risposta == null && c.scheda.superata == null))
        }
        val agg = stato?.aggiornamento
        return VistaLavoro(
            linea = linea,
            quando = quando,
            domande = aperte.map { domanda(it, risposte[it.chiave], ora) },
            schede = RegoleSchermate.schedeWorkspace(stato?.autopiloti.orEmpty()),
            versionePronta = agg?.versione?.takeIf { agg.fase == "pronto" || agg.fase == "disponibile" }
        )
    }

    fun domanda(c: Conversazione, risposta: String?, ora: Long): DomandaLavoro {
        val s = c.scheda!!
        val fisse = s.scelte.filter { !it.libera && !it.invio }
        val testi = fisse.map { it.testo }
        val consigliata = fisse.firstOrNull { it.consigliata }?.testo
        val tipo = when {
            RegoleSchermate.eConsenso(testi) -> TipoDomanda.CONSENSO
            RegoleSchermate.eSalvaEUnisci(testi) -> TipoDomanda.UNISCI
            else -> TipoDomanda.NORMALE
        }
        val scelte = if (tipo == TipoDomanda.CONSENSO) RegoleSchermate.ordineConsenso(testi).map { t ->
            val k = t.trim().lowercase()
            // Nessuna spinta verso il sì: i tre tasti uguali, anche se il PC ne segnasse una.
            SceltaLavoro(t, t, consigliata = false, conseguenza = CONSEGUENZE[k], conConferma = k == "sì, sempre")
        } else fisse.map { SceltaLavoro(it.testo, it.etichetta?.takeIf { e -> e.isNotBlank() } ?: it.testo, it.consigliata) }
        return DomandaLavoro(
            chiave = c.chiave,
            chi = s.chi.ifBlank { c.titolo },
            testo = s.domanda.ifBlank { c.titolo },
            tipo = tipo,
            scelte = scelte,
            rigaSotto = RegoleSchermate.rigaSeNonRispondi(s.scadeIl, s.rischiosa, consigliata, ora),
            rischiosa = s.rischiosa == true,
            via = c.risposta,
            autopilota = c.autopilota,
            libera = s.scelte.any { it.libera } || fisse.isEmpty(),
            segnaposto = s.segnaposto.ifBlank { "Scrivi tu" },
            risposta = risposta
        )
    }

    /** Dove va una risposta e con che corpo: la stessa regola del PC (`richiestaRisposta` in `shared/domande-conversazioni.ts`). */
    fun strada(via: ViaRisposta, testo: String): Pair<String, String> {
        val (rotta, campi) = when (via.via) {
            "rispondi" -> "/api/rispondi" to mapOf("domanda" to (via.domanda ?: ""), "risposta" to testo)
            "dialogo" -> "/api/autopilota/dialogo" to mapOf("autopilota" to (via.autopilota ?: ""), "testo" to testo)
            else -> "/api/scrivi" to mapOf("chat" to (via.chat ?: ""), "testo" to testo)
        }
        return rotta to buildJsonObject { for ((k, v) in campi) put(k, v) }.toString()
    }
}
