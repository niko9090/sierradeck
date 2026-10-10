package it.ferrariconsulenze.sierradeck

import java.util.concurrent.TimeUnit
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
class Api(private val indirizzo: String, private val chiave: String?, val ponte: String? = null) {

    /** Lo stesso PC accoppiato, ma ogni chiamata va a `pcId` attraverso il ponte (PC 0.48.0). */
    fun suPc(pcId: String): Api = Api(indirizzo, chiave, pcId)

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

    private suspend fun corpoTesto(percorso: String, corpo: RequestBody?): String {
        val pc = ponte ?: return conSegno(Collegamenti.ACCOPPIATO, null) { corpoTestoDiretto(percorso, corpo) }
        // Attraverso il ponte: solo le rotte del riquadro remoto, impacchettate
        // per il PC accoppiato, che le gira all'altro.
        if (percorso !in Ponte.ROTTE) throw Errore(403, Ponte.nonSiPuo(percorso))
        val interno = corpo?.let { val b = okio.Buffer(); it.writeTo(b); b.readUtf8() }
        return conSegno(pc, Collegamenti.ACCOPPIATO) { corpoTestoDiretto("/api/ponte", Ponte.corpo(pc, percorso, interno).toRequestBody(JSON_MEDIA)) }
    }

    /**
     * Ogni risposta è un segno di vita del PC (app 2.56.0): la storia della
     * chat, lo scrivere, i file, non solo il controllo dello stato. Prima
     * l'indicatore contava solo quello, e un controllo scaduto diceva «giù»
     * mentre lo schermo della chat continuava ad arrivare.
     *
     * Per il PC accoppiato qualunque risposta HTTP vuol dire che c'è; per un
     * PC del ponte un 502/504 vuol dire che il PC accoppiato c'è ma quello no.
     */
    private suspend fun conSegno(chiave: String, tramite: String?, chiamata: suspend () -> String): String {
        val t0 = System.currentTimeMillis()
        try {
            val r = chiamata()
            val ora = System.currentTimeMillis()
            Collegamenti.passo(chiave, EventoLinea.Ok(ora, ora - t0, if (tramite == null) Linea.stradaDiIndirizzo(indirizzo) else null))
            if (tramite != null) Collegamenti.passo(tramite, EventoLinea.Ok(ora, ora - t0))
            return r
        } catch (e: Errore) {
            val ora = System.currentTimeMillis()
            val quelloNo = tramite != null && (e.codice == 502 || e.codice == 504)
            if (quelloNo) Collegamenti.passo(chiave, EventoLinea.Errore(ora, "irraggiungibile", Nota.spiega(e, "raggiungerlo").removePrefix("Non sono riuscito a raggiungerlo: ")))
            else Collegamenti.passo(chiave, EventoLinea.Ok(ora, ora - t0))
            if (tramite != null) Collegamenti.passo(tramite, EventoLinea.Ok(ora, ora - t0))
            throw e
        } catch (e: java.io.IOException) {
            Collegamenti.passo(chiave, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il computer non risponde"))
            if (tramite != null) Collegamenti.passo(tramite, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il computer non risponde"))
            throw e
        }
    }

    private suspend fun corpoTestoDiretto(percorso: String, corpo: RequestBody?): String =
        withContext(Dispatchers.IO) {
            // Non un client solo: **quello legato alla rete giusta**. Un
            // indirizzo di casa deve uscire dal wifi, e Android da solo sceglie
            // la rete che porta a Internet — che con una VPN accesa, o con un
            // wifi che giudica scadente, non e' la stessa cosa. Il perche' sta
            // per intero in `Rete`.
            val cliente = Rete.clientePer(Indirizzi.hostDi(indirizzo)).let { c ->
                // Le rotte del negozio aspettano Claude Code: un'installazione
                // da GitHub ci mette fino a un paio di minuti. Con i 15 secondi
                // di sempre l'app diceva «non riuscito» mentre il computer
                // stava ancora installando (prova dell'08/10).
                if (percorso in ROTTE_LENTE) c.newBuilder().readTimeout(LENTE_SECONDI, TimeUnit.SECONDS).build() else c
            }
            cliente.newCall(richiesta(percorso, corpo)).execute().use { r ->
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
    /** Tutto quello che aspetta una risposta da te (dalla 0.30 del computer: prima 404). */
    suspend fun domande(): Domande = json.decodeFromString(corpoTesto("/api/domande", null))
    /** Lo stato letto, insieme al testo grezzo: la guardia degli avvisi lo legge come JSON generico. */
    suspend fun statoConTesto(): Pair<Stato, String> {
        val testo = corpoTesto("/api/stato", null)
        return json.decodeFromString<Stato>(testo) to testo
    }
    /** Qual e' l'ultima app pubblicata, per quanto ne sa il computer. Senza chiave. */
    suspend fun app(): AppScaricabile = json.decodeFromString(corpoTesto("/api/app", null))

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

    /**
     * Rispondere a un elenco di scelte del terminale.
     *
     * Si manda **il testo** dell'opzione toccata, non la sua posizione: la
     * posizione la ricalcola il computer sullo schermo di adesso. Fra la lettura
     * e l'arrivo del pollice passano secondi, e in quei secondi la domanda puo'
     * essere cambiata — contare le frecce sulla vecchia vorrebbe dire concedere
     * un permesso che nessuno ha concesso. Se non torna, il computer risponde
     * 409 e qui arriva un `Errore`: non si preme niente.
     */
    suspend fun scegli(chat: String, opzione: String): Fatto =
        json.decodeFromString(corpoTesto("/api/scegli", oggetto {
            put("chat", chat); put("opzione", opzione)
        }))

    /** Il PIN di una chat protetta (PC 0.49.0): lo controlla il computer di casa della chat. */
    suspend fun sbloccaPin(chat: String, pin: String): Fatto =
        json.decodeFromString(corpoTesto("/api/pin/sblocca", oggetto {
            put("chat", chat); put("pin", pin)
        }))

    /**
     * Le chiamate dell'invio di un file (PC 0.50.0): le stesse strade delle
     * altre, ponte compreso. Un `IOException` vuol dire rete caduta: l'invio
     * chiede al PC dove era arrivato e riparte.
     */
    fun trasporto(): Trasporto = object : Trasporto {
        override suspend fun chiama(percorso: String, corpo: JsonObject): String =
            corpoTesto(percorso, json.encodeToString(JsonObject.serializer(), corpo).toRequestBody(JSON_MEDIA))
    }

    /** `idMessaggio` (PC 0.51.0): rimandato dopo una caduta, il PC lo riconosce e non lo scrive due volte. */
    suspend fun scrivi(chat: String, testo: String, idMessaggio: String? = null): Fatto =
        json.decodeFromString(corpoTesto("/api/scrivi", oggetto {
            put("chat", chat); put("testo", testo)
            if (idMessaggio != null) put("idMessaggio", idMessaggio)
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

    // ─── il nome scelto di questo computer (PC 0.52.4) ───
    suspend fun nomePc(nome: String): NomeComputer =
        json.decodeFromString(corpoTesto("/api/nome-pc", oggetto { put("nome", nome) }))

    // ─── workspace ───
    suspend fun cambiaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace", oggetto { put("nome", nome) }))

    // ─── aprire / riprendere chat ───
    suspend fun cartelle(): Cartelle = json.decodeFromString(corpoTesto("/api/cartelle", null))

    /** `workspace` (PC 0.55.0): dove metterla; senza, quello che il PC ha davanti. */
    suspend fun apri(cartella: String, modello: String? = null, workspace: String? = null): Fatto =
        json.decodeFromString(corpoTesto("/api/apri", oggetto {
            put("cartella", cartella); if (modello != null) put("modello", modello)
            if (!workspace.isNullOrBlank()) put("workspace", workspace)
        }))

    // ─── le azioni del riquadro, come i tasti del PC (PC 0.55.0) ───
    /** ⏸: si chiude il claude.exe, la chat resta al suo posto. */
    suspend fun dormiChat(chat: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/dormi", oggetto { put("chat", chat) }))

    suspend fun svegliaChat(chat: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/sveglia", oggetto { put("chat", chat) }))

    /** ⇄ verso un altro workspace. */
    suspend fun spostaChat(chat: String, workspace: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/sposta", oggetto { put("chat", chat); put("workspace", workspace) }))

    // ─── «Installa là» dal telefono (PC 0.56.2): sempre al PC accoppiato ───
    suspend fun installaLa(pc: String): Fatto =
        json.decodeFromString(corpoTesto("/api/installa-la", oggetto { put("pc", pc) }))

    suspend fun installaLaStato(): StatoInstallaLa = json.decodeFromString(corpoTesto("/api/installa-la/stato", null))

    // ─── le mancanze della parità (PC 0.56.0) ───
    suspend fun archiviaAutopilota(id: String, archivia: Boolean = true): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/archivia", oggetto { put("autopilota", id); put("archivia", archivia) }))

    /** Il Quaderno personale (PC 0.57.0): solo il PC accoppiato, mai attraverso il ponte. */
    suspend fun quadernoPersonale(): StatoQuadernoPersonale =
        json.decodeFromString(corpoTesto("/api/quaderno-personale", oggetto { }))

    suspend fun salvaVocePersonale(id: String?, nome: String, valore: String, nota: String): EsitoQuadernoPersonale =
        json.decodeFromString(corpoTesto("/api/quaderno-personale/salva", oggetto {
            if (id != null) put("id", id); put("nome", nome); put("valore", valore); put("nota", nota)
        }))

    suspend fun togliVocePersonale(id: String): EsitoQuadernoPersonale =
        json.decodeFromString(corpoTesto("/api/quaderno-personale/togli", oggetto { put("id", id) }))

    suspend fun revocaConsensoPersonale(sessione: String, voce: String): EsitoQuadernoPersonale =
        json.decodeFromString(corpoTesto("/api/quaderno-personale/revoca", oggetto { put("sessione", sessione); put("voce", voce) }))

    suspend fun proteggiChat(chat: String, si: Boolean): Fatto =
        json.decodeFromString(corpoTesto("/api/pin/proteggi", oggetto { put("chat", chat); put("si", si) }))

    /** `pc = "qui"` = il PC che risponde. */
    suspend fun ospiteChat(chat: String, pc: String, pcNome: String): EsitoOspite =
        json.decodeFromString(corpoTesto("/api/chat/ospite", oggetto { put("chat", chat); put("pc", pc); put("pcNome", pcNome) }))

    suspend fun modelli(): ElencoModelli = json.decodeFromString(corpoTesto("/api/modelli", null))

    /** Una chat nuova con nome e modello (PC 0.56.0). */
    suspend fun apriNuova(cartella: String, workspace: String?, nome: String?, modello: String?): Fatto =
        json.decodeFromString(corpoTesto("/api/apri", oggetto {
            put("cartella", cartella)
            if (!workspace.isNullOrBlank()) put("workspace", workspace)
            if (!nome.isNullOrBlank()) put("nome", nome.trim())
            if (!modello.isNullOrBlank() && modello != "default") put("modello", modello)
        }))

    suspend fun rinominaWorkspace(nome: String, nuovo: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace/rinomina", oggetto { put("nome", nome); put("nuovo", nuovo) }))

    suspend fun sessioni(): Sessioni = json.decodeFromString(corpoTesto("/api/sessioni", null))

    suspend fun riprendiSessione(cartella: String, sessione: String): Fatto =
        json.decodeFromString(corpoTesto("/api/sessioni/riprendi", oggetto {
            put("cartella", cartella); put("sessione", sessione)
        }))

    // ─── autopiloti: dettaglio, crea, elimina, riavvio ───
    suspend fun autopilota(id: String): AutopilotaDettaglio =
        json.decodeFromString(corpoTesto("/api/autopilota", oggetto { put("autopilota", id) }))

    /**
     * Affida un lavoro. `pubblicazione` e' la regola del progetto (beta,
     * stabile, unica) e `cloud` dice se va sul cloud (0.36.0): un computer piu'
     * vecchio le ignora.
     */
    suspend fun creaAutopilota(obiettivo: String, cartella: String, pubblicazione: String = "stabile", cloud: Boolean = false): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/crea", oggetto {
            put("obiettivo", obiettivo); put("cartella", cartella)
            put("pubblicazione", pubblicazione); put("vaSulCloud", cloud)
        }))

    /**
     * Con tutti i campi della finestra del PC (PC 0.55.0), già controllati da
     * `AzioniTelefono.controlla`. Un PC di prima legge obiettivo, cartella,
     * regola e cloud, e ignora il resto.
     */
    suspend fun creaAutopilota(r: RichiestaAutopilota): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/crea", oggetto {
            put("obiettivo", r.obiettivo); put("cartella", r.cwd); put("nome", r.nome)
            put("criteri", r.criteri.joinToString("\n") { it.descrizione })
            put("pubblicazione", r.pubblicazione); put("vaSulCloud", r.vaSulCloud == true)
            put("partenza", r.partenza)
            r.workspace?.let { put("workspace", it) }
        }))

    /**
     * Risponde in una conversazione della scheda Domande, dalla rotta giusta:
     * la stessa regola del PC e della pagina (`richiestaRisposta`).
     */
    suspend fun rispondiConversazione(via: ViaRisposta, testo: String): Fatto {
        val (percorso, corpo) = richiestaRisposta(via, testo)
        return json.decodeFromString(corpoTesto(percorso, oggetto { for ((k, v) in corpo) put(k, v) }))
    }

    /** Risponde a una domanda della linguetta «Domande» (0.38.0): la regola di `richiestaScheda`. */
    suspend fun rispondiScheda(d: DomandaScheda, autopilota: String, testo: String): Fatto {
        val (percorso, corpo) = richiestaScheda(d, autopilota, testo)
        return json.decodeFromString(corpoTesto(percorso, oggetto { for ((k, v) in corpo) put(k, v) }))
    }

    /** La linguetta «File» (0.38.0): solo lettura. */
    suspend fun fileAutopilota(id: String): FileAutopilota =
        json.decodeFromString(corpoTesto("/api/autopilota/file", oggetto { put("autopilota", id) }))

    suspend fun diffAutopilota(id: String, chat: String, percorso: String): DiffFile =
        json.decodeFromString(corpoTesto("/api/autopilota/diff", oggetto { put("autopilota", id); put("chat", chat); put("percorso", percorso) }))

    suspend fun eliminaAutopilota(id: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/elimina", oggetto { put("autopilota", id) }))

    /**
     * Gli scrivi. Il computer risponde subito «ricevuto»: la sua risposta
     * compare in `AutopilotaDettaglio.dialogo` al giro dopo. Un computer con
     * una versione precedente risponde 409.
     */
    /** «Salute del sistema» (0.44.0). */
    suspend fun salute(): Salute = json.decodeFromString(corpoTesto("/api/salute", null))

    /** La linguetta «Istruzioni» (0.41.0): le consegne alle sue chat, intere. */
    suspend fun istruzioniAutopilota(id: String): IstruzioniAutopilota =
        json.decodeFromString(corpoTesto("/api/autopilota/istruzioni", oggetto { put("autopilota", id) }))

    /** «Correggi» su un'istruzione (0.41.0): la nota va nel dialogo, legata a quell'istruzione. */
    suspend fun correggiIstruzione(id: String, istruzione: String, nota: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/correggi", oggetto {
            put("autopilota", id); put("istruzione", istruzione); put("nota", nota)
        }))

    suspend fun dialogaAutopilota(id: String, testo: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/dialogo", oggetto {
            put("autopilota", id); put("testo", testo)
        }))

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

    /**
     * Chiede al computer di cercare **adesso** un suo aggiornamento.
     *
     * Un computer piu' vecchio non conosce questa strada e risponde «non
     * trovato»: non e' un guasto, e chi chiama lo distingue per dirlo com'e'.
     */
    suspend fun cercaAggiornamentoPc(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/cerca", oggetto { }))

    // ─── workspace: crea / elimina ───
    suspend fun creaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace/crea", oggetto { put("nome", nome) }))

    suspend fun eliminaWorkspace(nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/workspace/elimina", oggetto { put("nome", nome) }))

    // ─── la coda condivisa dei comandi di un progetto ───
    suspend fun coda(progetto: String): Coda =
        json.decodeFromString(corpoTesto("/api/coda", oggetto { put("progetto", progetto) }))

    suspend fun codaAggiungi(progetto: String, testo: String): Coda =
        json.decodeFromString(corpoTesto("/api/coda/aggiungi", oggetto { put("progetto", progetto); put("testo", testo) }))

    suspend fun codaTogli(progetto: String, voce: String): Coda =
        json.decodeFromString(corpoTesto("/api/coda/togli", oggetto { put("progetto", progetto); put("voce", voce) }))

    suspend fun codaPulisci(progetto: String): Coda =
        json.decodeFromString(corpoTesto("/api/coda/pulisci", oggetto { put("progetto", progetto) }))

    // ─── la posta per un PC: azioni che si eseguono solo la', quando e' acceso ───
    suspend fun pc(): ElencoPc = json.decodeFromString(corpoTesto("/api/pc", null))

    suspend fun posta(pc: String): Posta =
        json.decodeFromString(corpoTesto("/api/posta", oggetto { put("pc", pc) }))

    suspend fun postaAggiungi(pc: String, cwd: String, testo: String): Posta =
        json.decodeFromString(corpoTesto("/api/posta/aggiungi", oggetto { put("pc", pc); put("cwd", cwd); put("testo", testo) }))

    suspend fun postaTogli(pc: String, voce: String): Posta =
        json.decodeFromString(corpoTesto("/api/posta/togli", oggetto { put("pc", pc); put("voce", voce) }))

    suspend fun postaPulisci(pc: String): Posta =
        json.decodeFromString(corpoTesto("/api/posta/pulisci", oggetto { put("pc", pc) }))

    // ─── il Drive ───
    suspend fun driveCatalogo(): RispostaCatalogo = json.decodeFromString(corpoTesto("/api/drive/catalogo", null))
    suspend fun drivePorta(chiave: String): EsitoPorta =
        json.decodeFromString(corpoTesto("/api/drive/porta", oggetto { put("progetto", chiave) }))
    suspend fun drivePortaWorkspace(nome: String): EsitoPorta =
        json.decodeFromString(corpoTesto("/api/drive/portaWorkspace", oggetto { put("workspace", nome) }))
    suspend fun driveLavoro(): StatoLavoro = json.decodeFromString(corpoTesto("/api/drive/lavoro", null))
    suspend fun driveCatalogoStato(): StatoCatalogo = json.decodeFromString(corpoTesto("/api/drive/catalogoStato", null))
    suspend fun driveAnnulla(): Fatto = json.decodeFromString(corpoTesto("/api/drive/annulla", oggetto { }))
    suspend fun driveRiavvia(): EsitoPorta = json.decodeFromString(corpoTesto("/api/drive/riavvia", oggetto { }))

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

    /** Cosa cambia con l'aggiornamento pronto: si mostra prima di «Installa» (0.39.0). */
    suspend fun noteAggiornamento(): NoteAggiornamento =
        json.decodeFromString(corpoTesto("/api/aggiornamento/note", null))

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

    /**
     * Installa un plugin. Passa dal CLI di Claude Code: da qualche secondo a un
     * paio di minuti. `accetta` è l'impronta del comando del marketplace che
     * la persona ha letto e confermato.
     */
    suspend fun installaPlugin(id: String, accetta: String? = null): EsitoNegozio =
        json.decodeFromString(corpoTesto("/api/negozio/installa", oggetto { put("id", id); accetta?.let { put("accetta", it) } }))

    /** Aggiorna un plugin installato all'ultima versione del suo marketplace (0.53.0). */
    suspend fun aggiornaPlugin(id: String, accetta: String? = null): EsitoNegozio =
        json.decodeFromString(corpoTesto("/api/negozio/aggiorna", oggetto { put("id", id); accetta?.let { put("accetta", it) } }))

    /** Cerca nel catalogo intero (0.53.0; un computer di prima risponde 404). */
    suspend fun cercaPlugin(q: String): RicercaNegozio =
        json.decodeFromString(corpoTesto("/api/negozio/cerca", oggetto { put("q", q) }))

    /** Gli MCP con lo stato del collegamento: il computer li prova uno per uno (0.53.0). */
    suspend fun saluteMcp(): SaluteMcp =
        json.decodeFromString(corpoTesto("/api/negozio/salute-mcp", null))

    /**
     * Le cartelle dentro una cartella del computer.
     *
     * Senza percorso torna i punti di partenza. Serve ad aprire una chat in un
     * progetto **nuovo**: prima si potevano scegliere solo le cartelle gia'
     * conosciute, e un progetto mai aperto da qui non c'era modo di sceglierlo.
     */
    suspend fun sfoglia(percorso: String = ""): Sfoglia =
        json.decodeFromString(corpoTesto("/api/sfoglia", oggetto { put("percorso", percorso) }))

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

    // ─── consumi ───
    suspend fun consumi(): Consumi = json.decodeFromString(corpoTesto("/api/consumi", null))

    // ─── la sezione File (PC 0.54.0): i progetti del PC, in sola lettura ───
    suspend fun fileProgetti(): ProgettiFile = json.decodeFromString(corpoTesto("/api/file/progetti", oggetto { }))

    suspend fun fileElenco(progetto: String, percorso: String): ElencoFile =
        json.decodeFromString(corpoTesto("/api/file/elenco", oggetto { put("progetto", progetto); put("percorso", percorso) }))

    /** Un pezzo di un file del progetto, da `da` in poi (al più 96 KB). */
    suspend fun fileLeggi(progetto: String, percorso: String, da: Long): PezzoFile =
        json.decodeFromString(corpoTesto("/api/file/leggi", oggetto { put("progetto", progetto); put("percorso", percorso); put("da", da) }))

    // ─── i file dal PC al telefono (PC 0.54.0) ───
    /** Quelli che questo PC tiene per questo telefono. `nome`: come ci chiamiamo, per il PC che ci vede dal ponte. */
    suspend fun consegne(nome: String): Consegne =
        json.decodeFromString(corpoTesto("/api/consegne", oggetto { put("nome", nome) }))

    suspend fun consegnaPezzo(id: String, da: Long): PezzoConsegna =
        json.decodeFromString(corpoTesto("/api/consegne/pezzo", oggetto { put("id", id); put("da", da) }))

    /** Tutto arrivato e l'impronta torna: il PC chiude la consegna e toglie la sua copia. */
    suspend fun consegnaRicevuta(id: String, sha256: String): Fatto =
        json.decodeFromString(corpoTesto("/api/consegne/ricevuta", oggetto { put("id", id); put("sha256", sha256) }))

    companion object {
        /** Le rotte che passano dal CLI di Claude Code e possono metterci minuti. */
        val ROTTE_LENTE = setOf(
            "/api/negozio", "/api/negozio/installa", "/api/negozio/aggiorna",
            "/api/negozio/commuta", "/api/negozio/cerca", "/api/negozio/salute-mcp"
        )
        /** Il CLI ne concede 180 a un'installazione: qualcosa in più, per la rete. */
        const val LENTE_SECONDI = 200L

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
