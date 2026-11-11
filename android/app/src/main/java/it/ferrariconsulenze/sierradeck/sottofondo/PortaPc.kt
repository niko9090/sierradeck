package it.ferrariconsulenze.sierradeck.sottofondo

import android.content.Context
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.dati.Telefono
import it.ferrariconsulenze.sierradeck.rete.Centralino
import it.ferrariconsulenze.sierradeck.rete.Esito
import it.ferrariconsulenze.sierradeck.rete.Indirizzi
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.rete.Rete
import it.ferrariconsulenze.sierradeck.rete.Strade
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * La porta verso il PC accoppiato, per il sottofondo: leggere e mandare, con
 * l'esito in parole (`Esito`) invece delle eccezioni. Due strade dietro la
 * stessa porta: il Centralino quando conosce il PC (gara fra casa e Tailscale,
 * prova d'identità), altrimenti una richiesta diretta sulla strada di oggi.
 */
interface PortaPc {
    suspend fun leggi(rotta: String): Esito<String>
    /** Una POST con l'id della richiesta: lo stesso id ripetuto non fa doppioni sul PC. */
    suspend fun manda(rotta: String, corpo: String, idRichiesta: String): Esito<String>
}

/** Una risposta a una domanda, anche su un altro PC (attraverso il ponte di quello accoppiato). */
suspend fun PortaPc.rispondi(domanda: String, risposta: String, pc: String?, idRichiesta: String): Esito<String> {
    val corpo = """{"domanda":${json(domanda)},"risposta":${json(risposta)}}"""
    return if (pc.isNullOrBlank()) manda("/api/rispondi", corpo, idRichiesta)
    else manda("/api/ponte", Ponte.corpo(pc, "/api/rispondi", corpo), idRichiesta)
}

/** Un messaggio a una chat che aspetta. */
suspend fun PortaPc.scrivi(chat: String, testo: String, pc: String?, idRichiesta: String): Esito<String> {
    val corpo = """{"chat":${json(chat)},"testo":${json(testo)}}"""
    return if (pc.isNullOrBlank()) manda("/api/scrivi", corpo, idRichiesta)
    else manda("/api/ponte", Ponte.corpo(pc, "/api/scrivi", corpo), idRichiesta)
}

internal fun json(testo: String): String = kotlinx.serialization.json.JsonPrimitive(testo).toString()

/** Una richiesta diretta (OkHttp). `cliente(ms)` dà il client con quell'attesa di lettura. */
class PortaHttp(
    private val base: () -> String,
    private val chiave: String,
    private val cliente: (Long) -> OkHttpClient
) : PortaPc {

    override suspend fun leggi(rotta: String): Esito<String> = esegui(rotta, null, null)

    override suspend fun manda(rotta: String, corpo: String, idRichiesta: String): Esito<String> = esegui(rotta, corpo, idRichiesta)

    private suspend fun esegui(rotta: String, corpo: String?, id: String?): Esito<String> = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base().trimEnd('/') + rotta)
        if (corpo != null) b.post(corpo.toRequestBody(JSON)) else b.get()
        if (id != null) b.header("x-sierradeck-richiesta", id)
        if (chiave.isNotBlank()) b.header("x-sierradeck-chiave", chiave)
        val ms = Strade.attesaDi(rotta) ?: Strade.NORMALE_MS
        try {
            cliente(ms).newCall(b.build()).execute().use { r ->
                val testo = r.body?.string() ?: ""
                when {
                    r.isSuccessful -> Esito.Riuscito(testo)
                    Strade.eMancaSulPc(r.code, testo) -> Esito.MancaSulPc(Strade.via(rotta))
                    else -> Esito.Rifiuto(r.code, Strade.motivoDa(r.code, testo), testo)
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            Esito.Rete(e.message ?: "il computer non risponde")
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        /** Un client semplice (per i test e per chi non ha una rete da scegliere). */
        fun clienteSemplice(): (Long) -> OkHttpClient {
            val base = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).build()
            return { ms -> base.newBuilder().readTimeout(ms, TimeUnit.MILLISECONDS).build() }
        }
    }
}

/** Il Centralino, quando conosce il PC. */
class PortaCentralino(private val centralino: Centralino, private val pc: String) : PortaPc {
    override suspend fun leggi(rotta: String): Esito<String> = centralino.chiama(pc, rotta)
    override suspend fun manda(rotta: String, corpo: String, idRichiesta: String): Esito<String> =
        centralino.chiama(pc, rotta, corpo, idRichiesta)
}

object Porte {
    /**
     * La porta del PC accoppiato, o null se il telefono non è accoppiato.
     * La rubrica si legge dal disco in sottofondo: la si aspetta al più 3 s.
     */
    suspend fun delPc(contesto: Context): PortaPc? {
        val col = Collegamento(contesto)
        if (!col.pronto) return null
        val id = Collegamento.pulisci(col.indirizzo)
        val chiave = col.chiave
        val t = Telefono.pronto ?: Telefono.avvia(contesto)
        withTimeoutOrNull(3_000) { t.rubrica.pronta.first { it } }
        val noto = t.rubrica.pc(id)
        if (noto != null && chiave.isNotBlank() && noto.chiave == chiave) return PortaCentralino(t.centralino, id)
        Rete.ricorda(contesto)
        Percorsi.osserva(contesto)
        val indirizzo = col.indirizzo
        return PortaHttp({ Percorsi.effettivo(indirizzo) }, chiave) { ms ->
            Rete.clientePer(Indirizzi.hostDi(Percorsi.effettivo(indirizzo))).newBuilder().readTimeout(ms, TimeUnit.MILLISECONDS).build()
        }
    }
}
