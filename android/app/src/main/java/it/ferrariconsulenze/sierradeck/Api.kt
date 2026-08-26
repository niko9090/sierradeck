package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Il computer, visto dal telefono: una chiamata per endpoint, tutte JSON.
 *
 * Parla con l'indirizzo accoppiato (porta 47640) e mette la chiave nell'header
 * `x-sierradeck-chiave` — mai nell'URL. Ogni funzione è `suspend` e gira sul
 * dispatcher di I/O: chi la chiama non si preoccupa dei thread, lo scheduler di
 * Compose fa il resto.
 *
 * L'errore non si ingoia: un **401** vuol dire «questa chiave non vale più» e va
 * distinto da «il computer non risponde», perché la cura è diversa — ri-accoppiare
 * contro ricontrollare l'indirizzo.
 */
class Api(private val indirizzo: String, private val chiave: String?) {

    class Errore(val codice: Int, val corpo: String) :
        Exception("HTTP $codice: ${corpo.take(200)}") {
        /** La chiave non è (più) riconosciuta: serve un nuovo accoppiamento. */
        val daRiaccoppiare: Boolean get() = codice == 401
    }

    private fun url(percorso: String) = indirizzo.trimEnd('/') + percorso

    private fun richiesta(percorso: String, corpo: RequestBody?): Request {
        val b = Request.Builder().url(url(percorso))
        if (corpo != null) b.post(corpo) else b.get()
        chiave?.takeIf { it.isNotBlank() }?.let { b.header("x-sierradeck-chiave", it) }
        return b.build()
    }

    private suspend fun corpoTesto(percorso: String, corpo: RequestBody?): String =
        withContext(Dispatchers.IO) {
            client.newCall(richiesta(percorso, corpo)).execute().use { r ->
                val testo = r.body?.string() ?: ""
                if (!r.isSuccessful) throw Errore(r.code, testo)
                testo
            }
        }

    private fun oggetto(build: JsonObjectBuilder.() -> Unit): RequestBody =
        json.encodeToString(JsonObject.serializer(), buildJsonObject(build))
            .toRequestBody(JSON_MEDIA)

    // ─── libere (pre-accoppiamento) ───
    suspend fun accoppia(codice: String, nome: String): Accoppiamento =
        json.decodeFromString(corpoTesto("/api/accoppia", oggetto {
            put("codice", codice); put("nome", nome)
        }))

    // ─── stato e stile ───
    suspend fun stato(): Stato = json.decodeFromString(corpoTesto("/api/stato", null))

    // ─── terminale di una chat ───
    suspend fun dentro(chat: String): Dentro =
        json.decodeFromString(corpoTesto("/api/dentro", oggetto { put("chat", chat) }))

    suspend fun scrivi(chat: String, testo: String): Fatto =
        json.decodeFromString(corpoTesto("/api/scrivi", oggetto {
            put("chat", chat); put("testo", testo)
        }))

    // ─── domande dell'autopilota ───
    suspend fun rispondi(domanda: String, risposta: String): Fatto =
        json.decodeFromString(corpoTesto("/api/rispondi", oggetto {
            put("domanda", domanda); put("risposta", risposta)
        }))

    // ─── autopiloti: azioni ───
    suspend fun fermaAutopilota(id: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/ferma", oggetto { put("autopilota", id) }))

    suspend fun riprendiAutopilota(id: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/riprendi", oggetto { put("autopilota", id) }))

    suspend fun vaiAutopilota(id: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/vai", oggetto { put("autopilota", id) }))

    // ─── chat: azioni ───
    suspend fun chiudiChat(chat: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/chiudi", oggetto { put("chat", chat) }))

    suspend fun rinominaChat(chat: String, nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/nome", oggetto {
            put("chat", chat); put("nome", nome)
        }))

    // ─── workspace ───
    suspend fun cambiaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace", oggetto { put("nome", nome) }))

    // ─── consumi ───
    suspend fun consumi(): Consumi = json.decodeFromString(corpoTesto("/api/consumi", null))

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        /** Tollerante in lettura, esplicito in scrittura: regge un desktop più
         *  vecchio o più nuovo senza rompersi. */
        val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            encodeDefaults = true
        }

        /** Un client solo, condiviso: apre poche connessioni e le riusa. I timeout
         *  sono corti perché è rete locale — se il computer non risponde in fretta,
         *  non risponde. */
        private val client = OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
