package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

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
            // Non un client solo: **quello legato alla rete giusta**. Un
            // indirizzo di casa deve uscire dal wifi, e Android da solo sceglie
            // la rete che porta a Internet — che con una VPN accesa, o con un
            // wifi che giudica scadente, non e' la stessa cosa. Il perche' sta
            // per intero in `Rete`.
            Rete.clientePer(Indirizzi.hostDi(indirizzo))
                .newCall(richiesta(percorso, corpo)).execute().use { r ->
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

    /** La tavolozza scelta sul computer, per vestirsi con gli stessi colori. */
    suspend fun stile(): Stile = json.decodeFromString(corpoTesto("/api/stile", null))

    // ─── terminale di una chat ───
    suspend fun dentro(chat: String): Dentro =
        json.decodeFromString(corpoTesto("/api/dentro", oggetto { put("chat", chat) }))

    /**
     * Un pezzo di conversazione, non solo lo schermo di adesso.
     *
     * `da` negativo vuol dire «le ultime `quante`», che è come si entra in una
     * chat: si parte dal fondo e si risale.
     */
    suspend fun storia(chat: String, da: Int, quante: Int): Storia =
        json.decodeFromString(
            corpoTesto("/api/storia", oggetto {
                put("chat", chat)
                put("da", da)
                put("quante", quante)
            })
        )

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

    // ─── aprire / riprendere chat ───
    suspend fun cartelle(): Cartelle = json.decodeFromString(corpoTesto("/api/cartelle", null))

    suspend fun apri(cartella: String, modello: String? = null): Fatto =
        json.decodeFromString(corpoTesto("/api/apri", oggetto {
            put("cartella", cartella); if (modello != null) put("modello", modello)
        }))

    suspend fun sessioni(): Sessioni = json.decodeFromString(corpoTesto("/api/sessioni", null))

    suspend fun riprendiSessione(cartella: String, sessione: String): Fatto =
        json.decodeFromString(corpoTesto("/api/sessioni/riprendi", oggetto {
            put("cartella", cartella); put("sessione", sessione)
        }))

    // ─── autopiloti: dettaglio, crea, elimina, riavvio ───
    suspend fun autopilota(id: String): AutopilotaDettaglio =
        json.decodeFromString(corpoTesto("/api/autopilota", oggetto { put("autopilota", id) }))

    suspend fun creaAutopilota(obiettivo: String, cartella: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/crea", oggetto {
            put("obiettivo", obiettivo); put("cartella", cartella)
        }))

    suspend fun eliminaAutopilota(id: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/elimina", oggetto { put("autopilota", id) }))

    suspend fun riavvioAutopilota(id: String, riprendi: Boolean): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/riavvio", oggetto {
            put("autopilota", id); put("riprendi", riprendi)
        }))

    // ─── quaderno ───
    suspend fun quaderno(cartella: String): Schede =
        json.decodeFromString(corpoTesto("/api/quaderno", oggetto { put("cartella", cartella) }))

    suspend fun scheda(cartella: String, file: String): SchedaPiena =
        json.decodeFromString(corpoTesto("/api/quaderno/scheda", oggetto {
            put("cartella", cartella); put("file", file)
        }))

    // ─── workspace: crea / elimina ───
    /**
     * Chiede al computer di cercare **adesso** un suo aggiornamento.
     *
     * Un computer piu' vecchio non conosce questa strada e risponde «non
     * trovato»: non e' un guasto, e chi chiama lo distingue per dirlo com'e'.
     */
    suspend fun cercaAggiornamentoPc(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/cerca", oggetto { }))

    suspend fun creaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace/crea", oggetto { put("nome", nome) }))

    suspend fun eliminaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace/elimina", oggetto { put("nome", nome) }))

    // ─── salvataggi (istantanee) ───
    suspend fun salvataggi(): Salvataggi = json.decodeFromString(corpoTesto("/api/salvataggi", null))

    suspend fun caricaSalvataggio(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/salvataggi/carica", oggetto { put("nome", nome) }))

    // ─── preferenze (stile / chiarore) ───
    suspend fun preferenze(): PreferenzeInvolucro =
        json.decodeFromString(corpoTesto("/api/preferenze", null))

    suspend fun impostaStile(stile: String): Fatto =
        json.decodeFromString(corpoTesto("/api/preferenze", oggetto { put("stile", stile) }))

    suspend fun impostaChiarore(chiarore: Int): Fatto =
        json.decodeFromString(corpoTesto("/api/preferenze", oggetto { put("chiarore", chiarore) }))

    // ─── aggiornamento del COMPUTER ───
    suspend fun aggiornamento(): Aggiornamento =
        json.decodeFromString(corpoTesto("/api/aggiornamento", null))

    suspend fun scaricaAggiornamento(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/scarica", oggetto { }))

    suspend fun installaAggiornamento(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/installa", oggetto { }))

    // ─── consumi ───
    /** Cosa c’è in dotazione sul computer. */
    /** Che versione ha il computer. Serve a dire «sei alla X» invece di niente. */
    suspend fun ciao(): Ciao = json.decodeFromString(corpoTesto("/api/ciao", null))

    suspend fun negozio(): DatiNegozio =
        json.decodeFromString(corpoTesto("/api/negozio", null))

    /** Accende o spegne un plugin, una skill o un MCP. */
    suspend fun commutaNegozio(cosa: String, nome: String, attivo: Boolean): EsitoNegozio =
        json.decodeFromString(
            corpoTesto("/api/negozio/commuta", oggetto {
                put("cosa", cosa)
                put("nome", nome)
                put("attivo", attivo)
            })
        )

    /** Installa un plugin. Passa dal CLI di Claude Code: ci mette qualche secondo. */
    suspend fun installaPlugin(id: String): EsitoNegozio =
        json.decodeFromString(corpoTesto("/api/negozio/installa", oggetto { put("id", id) }))

    /** Con quale account sta lavorando il computer. */
    suspend fun account(): Account =
        json.decodeFromString(corpoTesto("/api/account", null))

    /**
     * Entra con un altro account.
     *
     * Cambiare account è questo preceduto da [esciAccount]: non c'è un comando
     * apposta, e uno in meno è uno in meno che può sbagliare.
     */
    suspend fun entraAccount(email: String, password: String): EsitoNegozio =
        json.decodeFromString(
            corpoTesto("/api/account/entra", oggetto {
                put("email", email)
                put("password", password)
            })
        )

    /** Esce. Vale per il computer, non solo per il telefono che l'ha chiesto. */
    suspend fun esciAccount(): Fatto =
        json.decodeFromString(corpoTesto("/api/account/esci", oggetto { }))

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

        // I client vivono in `Rete`, uno per rete: i timeout sono corti perche'
        // e' rete locale — se il computer non risponde in fretta, non risponde.
    }
}
