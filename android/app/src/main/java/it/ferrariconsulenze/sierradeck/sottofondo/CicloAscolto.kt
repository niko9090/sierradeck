package it.ferrariconsulenze.sierradeck.sottofondo

import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Esito
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.util.UUID

/** Come va l'ascolto, per la riga fissa e per la schermata «Notifiche». */
data class StatoAscolto(
    /** Quando il PC ha risposto l'ultima volta (ms), null se mai da quando il servizio è partito. */
    val ultimoContatto: Long? = null,
    /** Il PC non ha `/api/eventi`: si usa il giro di prima. */
    val vecchioPc: Boolean = false,
    /** Il motivo dell'ultimo giro andato a vuoto, in parole; null se l'ultimo è andato bene. */
    val motivo: String? = null,
    /** Il servizio gira adesso. */
    val attivo: Boolean = false
)

/** Il punto del registro a cui si è arrivati: sopravvive ai riavvii. */
interface MemoriaAscolto {
    var ultimo: Long
}

class MemoriaInRam(override var ultimo: Long = 0) : MemoriaAscolto

/**
 * Il cuore dell'ascolto, senza Android: una richiesta lunga per giro, e la
 * regola di quanto aspettare dopo. Il servizio lo fa girare in un ciclo; i
 * test lo fanno girare contro un PC finto vero.
 */
class CicloAscolto(
    private val porta: suspend () -> PortaPc?,
    private val memoria: MemoriaAscolto,
    private val alPacco: suspend (RispostaEventi) -> Unit,
    private val alVecchioPc: suspend () -> Unit,
    private val orologio: () -> Long = System::currentTimeMillis
) {
    private val _stato = MutableStateFlow(StatoAscolto())
    val stato: StateFlow<StatoAscolto> = _stato.asStateFlow()

    var fallimenti = 0
        private set

    /** Dopo un cambio di rete: si riprova subito, senza le attese dei fallimenti. */
    fun azzeraAttese() { fallimenti = 0 }

    /**
     * Un giro. `attesaS` = quanto il PC può tenere la richiesta (50 nel
     * servizio, 0 nel giro di ripiego). Torna i millisecondi da aspettare
     * prima del prossimo; [NON_ACCOPPIATO] se il telefono non ha un PC.
     */
    suspend fun giro(attesaS: Int = RegoleAvvisi.ATTESA_S): Long {
        val p = porta() ?: return NON_ACCOPPIATO
        val partito = orologio()
        val rotta = RegoleAvvisi.percorsoEventi(memoria.ultimo, attesaS)
        return when (val e = p.leggi(rotta)) {
            is Esito.Riuscito -> {
                val r = try { Api.json.decodeFromString(RispostaEventi.serializer(), e.valore) } catch (_: Exception) { null }
                if (r == null) return fallito("il computer ha risposto in un modo che non capisco")
                fallimenti = 0
                _stato.value = _stato.value.copy(ultimoContatto = orologio(), vecchioPc = false, motivo = null)
                if (r.avvisi.isNotEmpty()) {
                    alPacco(r)
                    // Per il ritardo nel registro del PC; se non arriva, pazienza.
                    try { p.manda("/api/avvisi/visto", """{"fino":${r.ultimo}}""", UUID.randomUUID().toString()) } catch (_: Exception) { }
                }
                memoria.ultimo = r.ultimo
                // Un PC che risponde subito e a vuoto (non tiene la richiesta) non deve far girare a vuoto.
                if (r.avvisi.isEmpty() && attesaS > 0 && orologio() - partito < 1_000) 1_000L else 0L
            }
            is Esito.MancaSulPc -> {
                fallimenti = 0
                _stato.value = _stato.value.copy(ultimoContatto = orologio(), vecchioPc = true, motivo = null)
                alVecchioPc()
                RegoleAvvisi.VECCHIO_PC_OGNI_MS
            }
            is Esito.Rifiuto -> if (e.codice == 401) {
                fallimenti++
                _stato.value = _stato.value.copy(motivo = "Il computer non riconosce più questo telefono: va accoppiato di nuovo.")
                maxOf(60_000L, RegoleAvvisi.attesaDopo(fallimenti))
            } else fallito(e.motivo)
            is Esito.Rete -> fallito(e.motivo)
        }
    }

    private fun fallito(motivo: String): Long {
        fallimenti++
        _stato.value = _stato.value.copy(motivo = motivo)
        return RegoleAvvisi.attesaDopo(fallimenti)
    }

    companion object {
        const val NON_ACCOPPIATO = -1L
    }
}

/**
 * Una risposta data dalla notifica, con il suo id: lo stesso id a ogni
 * tentativo, così il PC non la conta due volte se la prima era arrivata.
 */
@Serializable
data class InvioRisposta(
    val idRichiesta: String,
    /** L'id dell'avviso (il tag della notifica). */
    val avviso: String,
    val titolo: String,
    /** `domanda` o `chat`. */
    val cosa: String,
    val bersaglio: String,
    val pc: String? = null,
    val testo: String,
    /** Il testo della domanda, per mostrarla con la risposta sotto. */
    val domanda: String = "",
    val creata: Long = 0
)

enum class EsitoInvio { PRESA, RIFIUTATA, RIPROVA }

object CodaRisposte {
    /** Dopo un giorno una risposta non mandata non serve più a nessuno. */
    const val SCADE_MS = 24 * 60 * 60_000L

    private val serializzatore = ListSerializer(InvioRisposta.serializer())

    fun codifica(coda: List<InvioRisposta>): String = Api.json.encodeToString(serializzatore, coda)

    fun decodifica(testo: String?): List<InvioRisposta> =
        if (testo.isNullOrBlank()) emptyList() else try { Api.json.decodeFromString(serializzatore, testo) } catch (_: Exception) { emptyList() }

    /**
     * Un no del PC che non cambia riprovando (la domanda non c'è più, è già
     * chiusa, la richiesta è sbagliata) chiude l'invio; la rete, un PC che si
     * sta aggiornando o troppo occupato si riprovano.
     */
    fun esito(e: Esito<String>): EsitoInvio = when (e) {
        is Esito.Riuscito -> EsitoInvio.PRESA
        is Esito.Rete -> EsitoInvio.RIPROVA
        is Esito.MancaSulPc -> EsitoInvio.RIFIUTATA
        is Esito.Rifiuto -> when (e.codice) {
            408, 425, 429 -> EsitoInvio.RIPROVA
            in 500..599 -> EsitoInvio.RIPROVA
            else -> EsitoInvio.RIFIUTATA
        }
    }

    suspend fun manda(porta: PortaPc, r: InvioRisposta): Esito<String> =
        if (r.cosa == "chat") porta.scrivi(r.bersaglio, r.testo, r.pc, r.idRichiesta)
        else porta.rispondi(r.bersaglio, r.testo, r.pc, r.idRichiesta)

    /**
     * Prova a mandare tutta la coda. Torna quelle da tenere per il giro dopo
     * e, per ognuna delle altre, com'è finita (con il motivo del PC se no).
     */
    suspend fun mandaTutte(porta: PortaPc, coda: List<InvioRisposta>, adesso: Long): Pair<List<InvioRisposta>, List<Triple<InvioRisposta, EsitoInvio, String?>>> {
        val restano = mutableListOf<InvioRisposta>()
        val finite = mutableListOf<Triple<InvioRisposta, EsitoInvio, String?>>()
        for (r in coda) {
            if (r.creata > 0 && adesso - r.creata > SCADE_MS) { finite += Triple(r, EsitoInvio.RIFIUTATA, "Non inviata per un giorno intero: non serve più."); continue }
            val e = manda(porta, r)
            when (val x = esito(e)) {
                EsitoInvio.RIPROVA -> restano += r
                else -> finite += Triple(r, x, (e as? Esito.Rifiuto)?.motivo ?: (e as? Esito.MancaSulPc)?.motivo)
            }
        }
        return restano to finite
    }
}
