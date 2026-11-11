package it.ferrariconsulenze.sierradeck.dati

import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.rete.Api
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Lo stato di un PC, tenuto in un posto solo (11/11): tutte le schermate lo
 * leggono da qui, nessuna lo chiede per conto suo.
 *
 * - Si parte dalla copia salvata (segnata «vecchia», con l'ora): lo schermo non
 *   è mai vuoto all'apertura.
 * - Gira solo mentre qualcuno guarda (`WhileSubscribed`) e l'app è davanti.
 * - Con un PC che ha `/api/eventi` si aspetta lì che lo stato cambi (una
 *   richiesta tenuta aperta, niente giri a vuoto); un PC di prima risponde 404 e
 *   si torna ai giri di `PolsoApp` (2 s, 5 s quando non cambia).
 */
class Deposito internal constructor(
    private val api: Api,
    private val cartella: File?,
    private val idPc: String,
    ambito: CoroutineScope,
    private val sveglia: kotlinx.coroutines.flow.SharedFlow<String?>?,
    private val orologio: () -> Long = System::currentTimeMillis
) {
    /** Lo stato con quando è arrivato; `vecchia` = copia salvata o PC che non risponde più. */
    data class Copia(val stato: Stato?, val quando: Long, val vecchia: Boolean, val motivo: String? = null)

    private val decodifica = StatoSoloSeCambia { Api.json.decodeFromString(Stato.serializer(), it) }
    @Volatile private var conEventi = true
    @Volatile private var versione: Long? = null
    /** L'ultimo avviso visto da `/api/eventi`: si chiede solo quello che viene dopo. */
    @Volatile private var ultimoAvviso = 0L

    val stato: StateFlow<Copia> = channelFlow {
        var ultima = iniziale()
        send(ultima)
        var uguali = 0
        while (true) {
            Davanti.flusso.filter { it }.first()
            try {
                val testo = api.statoGrezzo()
                val (s, cambiato) = synchronized(decodifica) { decodifica.leggi(testo) }
                versione = Polso.versioneDa(testo)
                if (cambiato || ultima.vecchia) {
                    ultima = Copia(s, orologio(), vecchia = false)
                    send(ultima)
                    cartella?.let { CopiaStato.salva(it, idPc, testo) }
                    uguali = 0
                } else uguali += 1
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!ultima.vecchia || ultima.motivo == null) { ultima = ultima.copy(vecchia = true, motivo = e.message ?: "il computer non risponde"); send(ultima) }
            }
            aspetta(uguali, ultima.vecchia)
        }
    }.stateIn(ambito, SharingStarted.WhileSubscribed(5_000), Copia(null, 0, vecchia = true))

    private fun iniziale(): Copia {
        val salvato = cartella?.let { CopiaStato.leggi(it, idPc) }
        if (salvato != null) synchronized(decodifica) { decodifica.parteDa(salvato) }
        val quando = cartella?.let { CopiaStato.file(it, idPc).takeIf { f -> f.exists() }?.lastModified() } ?: 0L
        return Copia(salvato, quando, vecchia = true)
    }

    /** Fino al prossimo giro: sull'evento del PC se c'è, altrimenti col passo di sempre; una sveglia lo accorcia. */
    private suspend fun aspetta(uguali: Int, giu: Boolean) {
        val v = versione
        if (!giu && conEventi && v != null) {
            try {
                val r = api.grezzo("/api/eventi?avvisi=$ultimoAvviso&stato=$v&attesa=${Polso.ATTESA_EVENTI_S}", null)
                val prima = ultimoAvviso
                ultimoAvviso = Polso.numeroDa(r, "ultimo") ?: ultimoAvviso
                // Solo gli avvisi nuovi (non lo stato): lo stato non è cambiato, si torna ad aspettare.
                if (Polso.numeroDa(r, "stato") == v && ultimoAvviso != prima) return aspetta(uguali, giu)
                return
            } catch (e: Api.Errore) {
                if (e.codice == 404) conEventi = false
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // La rete: si ricade sul passo di sempre.
            }
        }
        val ms = Polso.passo(uguali, giu)
        val s = sveglia
        if (s == null) delay(ms) else withTimeoutOrNull(ms) { s.filter { it == null || it == idPc }.first() }
    }

    /** Da chiamare dopo un'azione (risposta, invio): il giro dopo parte subito. */
    fun rileggi() { Telefono.centralino?.riprova(idPc) }

    companion object {
        private val tenuti = ConcurrentHashMap<String, Deposito>()

        /** Il deposito di quel PC (uno solo per processo). */
        fun di(idPc: String, chiave: String, cartella: File?): Deposito {
            val t = Telefono.pronto ?: error("Telefono non avviato")
            return tenuti.getOrPut(idPc) { Deposito(Api(idPc, chiave), cartella, idPc, t.ambito, t.centralino.sveglia) }
        }

        fun dimentica(idPc: String) { tenuti.remove(idPc) }
    }
}

/** I tempi del deposito, puri (provati in `DepositoTest`). */
object Polso {
    /** Quanto tiene aperta una richiesta a `/api/eventi`: sotto i 15 s di lettura del Centralino. */
    const val ATTESA_EVENTI_S = 10
    /** Con il PC giù si riprova più piano: le attese vere le tiene il Centralino. */
    const val GIU_MS = 5_000L

    fun passo(uguali: Int, giu: Boolean): Long = if (giu) GIU_MS else PolsoApp.davantiOgni(uguali)

    fun numeroDa(testo: String, campo: String): Long? =
        Regex("\"$campo\"\\s*:\\s*(\\d+)").find(testo)?.groupValues?.get(1)?.toLongOrNull()

    /** `versione` in cima a `/api/stato` (PC con m-avvisi); null da un PC di prima. */
    fun versioneDa(testo: String): Long? =
        Regex("^\\s*\\{\\s*\"versione\"\\s*:\\s*(\\d+)").find(testo)?.groupValues?.get(1)?.toLongOrNull()
            ?: Regex("\"versione\"\\s*:\\s*(\\d+)\\s*[,}]").find(testo.take(200))?.groupValues?.get(1)?.toLongOrNull()
}
