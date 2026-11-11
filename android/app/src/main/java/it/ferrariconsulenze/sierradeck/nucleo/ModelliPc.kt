package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.Serializable

/**
 * Modelli di risposte del PC che l'app legge ancora (app 11/11): stavano nelle
 * schermate di prima (`schermate/vecchie`, tolte), qui restano solo i dati.
 */

// ─── /api/chat/spazio e azioni sulle chat (PC 0.79) ───
@Serializable data class VoceSpazioChat(
    val sessione: String = "",
    val titolo: String = "",
    val cwd: String? = null,
    val byte: Double = 0.0,
    val ultimaAttivita: String? = null,
    val archiviata: Boolean = false,
    val aperta: Boolean = false,
    /** Il perché non si elimina (lo dice il PC); assente = si può. */
    val nonEliminabile: String? = null
)
@Serializable data class EsclusaChat(val sessione: String = "", val motivo: String = "")
@Serializable data class SelezioneChat(
    val chat: Int = 0, val byte: Double = 0.0, val eliminabili: Int = 0, val byteEliminabili: Double = 0.0, val escluse: List<EsclusaChat> = emptyList(),
    /** PC 0.79.0: le scelte che lì non sono aperte («Chiudi» spento); assente da un PC più vecchio. */
    val chiuse: List<String>? = null
)
@Serializable data class ContoRecupero(val chat: Int = 0, val byte: Double = 0.0)
@Serializable data class VistaSpazioChat(
    val chat: List<VoceSpazioChat> = emptyList(),
    val totale: Double = 0.0,
    val eliminabili: Double = 0.0,
    val recupero: ContoRecupero = ContoRecupero(),
    val selezione: SelezioneChat? = null
)
@Serializable data class EsitoChatApp(val sessione: String = "", val ok: Boolean = false, val motivo: String? = null, val byte: Double? = null)
@Serializable data class EsitoAzioniChat(
    val azione: String = "", val esiti: List<EsitoChatApp> = emptyList(), val fatte: Int = 0, val rifiutate: Int = 0, val byte: Double? = null, val messaggio: String = ""
)
@Serializable data class ChatArchiviataApp(val sessione: String = "", val il: String = "", val titolo: String? = null)
@Serializable data class DriveDelRecupero(val pulizia: String = "", val file: Int = 0, val byte: Double = 0.0)
@Serializable data class ChatInRecuperoApp(
    val id: String = "", val sessione: String = "", val titolo: String = "", val quando: String = "", val scadeIl: String = "",
    val byte: Double = 0.0, val drive: DriveDelRecupero? = null
)
@Serializable data class TestoAzioneChat(val etichetta: String = "", val breve: String = "", val spiega: String = "")

// ─── /api/panoramica (PC 0.77) ───
@Serializable
data class SchedaPanoramica(
    val id: String = "",
    val titolo: String = "",
    /** «sviluppo», «interfaccia», «collaudo», «revisione», «rilascio»; assente per una chat normale. */
    val ruolo: String? = null,
    /** «chiede», «lavora», «ferma», «finita». */
    val stato: String = "ferma",
    val nataIl: Long = 0,
    val ultimaAzione: String = "",
    val righe: List<String> = emptyList(),
    /** Da quando è in quello stato (ms), per «da 3 min». */
    val dal: Long? = null,
    /** La sessione, per aprire la chat a tutto schermo. */
    val sessione: String? = null,
    /** La domanda breve di questa chat, se c'è (regola H). */
    val domanda: Conversazione? = null,
    /** PC 0.78.0: è dell'autopilota (specialista o la sua chat): ferma va fra le finite. */
    val specialista: Boolean = false,
    /** PC 0.78.0: Nicholas l'ha segnata «solo mia». */
    val soloMia: Boolean = false
)

@Serializable
data class RiassuntoPanoramica(
    val obiettivo: String = "",
    val stato: StatoParola = StatoParola(),
    val criteri: CriteriPanoramica = CriteriPanoramica()
)

@Serializable
data class StatoParola(val parola: String = "", val colore: String = "quieto")

@Serializable
data class CriteriPanoramica(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—")

/** PC 0.78.0: lo stato coerente con i criteri («finito» solo se lo sono tutti). */
@Serializable
data class StatoSituazione(val id: String = "", val parola: String = "", val colore: String = "quieto", val simbolo: String = "", val ragione: String? = null)

/** Un criterio: `esito` è «si», «no» o «mai» (mai controllato). */
@Serializable
data class CriterioVista(val descrizione: String = "", val esito: String = "mai", val quando: String? = null, val prova: String? = null)

@Serializable
data class CriteriSituazione(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—", val elenco: List<CriterioVista> = emptyList())

@Serializable
data class Situazione(val obiettivo: String = "", val stato: StatoSituazione = StatoSituazione(), val criteri: CriteriSituazione = CriteriSituazione())

/** Un compito del Piano; `chat` è la chat aperta da toccare, se c'è. */
@Serializable
data class CompitoPiano(
    val id: String = "",
    val testo: String = "",
    val fase: String = "da-fare",
    val ruolo: String? = null,
    val autore: String? = null,
    val nota: String? = null,
    val giri: Int? = null,
    val chat: String? = null
)

@Serializable
data class ColonnaPiano(val fase: String = "", val nome: String = "", val compiti: List<CompitoPiano> = emptyList())

/** PC 0.79.0: una riga del riassunto accanto alla conversazione, già composta dal PC. */
@Serializable
data class RigaAlLavoro(
    val id: String = "",
    /** «Sviluppo», «Revisione»… o «Chat». */
    val chi: String = "",
    val ruolo: String? = null,
    /** Cosa fa adesso, in parole semplici (dal registro dell'autopilota). */
    val cosa: String = "",
    /** «da 3 min», «su PORTATILE». */
    val quanto: String = "",
    /** PC 0.79.0: cosa fa in questo momento, dai segnali: «fa girare i test». Assente da un PC che non lo manda. */
    val adesso: String? = null,
    val aspettaTe: Boolean = false,
    /** PC 0.82.0: cosa fa, per il colore fisso e il simbolo (`TabellaAttivita`). */
    val attivita: String? = null
)

@Serializable
data class Panoramica(
    val workspace: String = "",
    /** PC 0.79.0: chi lavora adesso, una riga per chat; assente da un PC più vecchio. */
    val alLavoro: List<RigaAlLavoro>? = null,
    val autopilota: String? = null,
    val riassunto: RiassuntoPanoramica? = null,
    val schede: List<SchedaPanoramica> = emptyList(),
    /** PC 0.78.0; assenti da un PC della 0.77.0. */
    val situazione: Situazione? = null,
    val piano: List<ColonnaPiano> = emptyList()
)


// ─── /api/sottofondo ───
@Serializable
data class ChiUsa(val id: String = "", val nome: String = "")

/** La risposta di `/api/sottofondo/avvia` e `/api/sottofondo/stato` (src/shared/sottofondo.ts). */
@Serializable
data class StatoSottofondo(
    val sessione: String = "",
    val chat: String = "",
    val fase: String = "",
    val messaggio: String = "",
    val inCoda: Int = 0,
    val consegnati: List<String> = emptyList(),
    val perChi: ChiUsa = ChiUsa(),
    val titolo: String = "",
    val cwd: String = "",
    val dal: String = ""
)


// ─── /api/autopilota/specialista (PC 0.90) ───
@Serializable
data class RigaSpecialista(val tipo: String = "testo", val testo: String = "", val quando: String? = null, val errore: Boolean = false)

/** La conversazione di uno specialista (le ultime righe); `trovata = false` finché la CLI non l'ha scritta. */
@Serializable
data class TrascrizioneSpecialista(val id: String = "", val trovata: Boolean = false, val righe: List<RigaSpecialista> = emptyList())

