package it.ferrariconsulenze.sierradeck.rete

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
import it.ferrariconsulenze.sierradeck.nucleo.Accoppiamento
import it.ferrariconsulenze.sierradeck.nucleo.Account
import it.ferrariconsulenze.sierradeck.nucleo.Aggiornamento
import it.ferrariconsulenze.sierradeck.nucleo.AppScaricabile
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotaDettaglio
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotiDiPc
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoAutopilota
import it.ferrariconsulenze.sierradeck.nucleo.CartellaFile
import it.ferrariconsulenze.sierradeck.nucleo.Cartelle
import it.ferrariconsulenze.sierradeck.nucleo.Ciao
import it.ferrariconsulenze.sierradeck.nucleo.Consegne
import it.ferrariconsulenze.sierradeck.nucleo.Consumi
import it.ferrariconsulenze.sierradeck.nucleo.Dentro
import it.ferrariconsulenze.sierradeck.nucleo.DomandaScheda
import it.ferrariconsulenze.sierradeck.nucleo.Domande
import it.ferrariconsulenze.sierradeck.nucleo.ElencoFile
import it.ferrariconsulenze.sierradeck.nucleo.ElencoModelli
import it.ferrariconsulenze.sierradeck.nucleo.ElencoPc
import it.ferrariconsulenze.sierradeck.nucleo.Fatto
import it.ferrariconsulenze.sierradeck.nucleo.NomeComputer
import it.ferrariconsulenze.sierradeck.nucleo.PezzoConsegna
import it.ferrariconsulenze.sierradeck.nucleo.PezzoFile
import it.ferrariconsulenze.sierradeck.nucleo.Posta
import it.ferrariconsulenze.sierradeck.nucleo.ProgettiFile
import it.ferrariconsulenze.sierradeck.nucleo.RecuperoWs
import it.ferrariconsulenze.sierradeck.nucleo.RichiestaAutopilota
import it.ferrariconsulenze.sierradeck.nucleo.Ripristinato
import it.ferrariconsulenze.sierradeck.nucleo.RispostaAutopilotiAltri
import it.ferrariconsulenze.sierradeck.nucleo.SchedaPiena
import it.ferrariconsulenze.sierradeck.nucleo.Schede
import it.ferrariconsulenze.sierradeck.nucleo.Sessioni
import it.ferrariconsulenze.sierradeck.nucleo.Sfoglia
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.StatoInstallaLa
import it.ferrariconsulenze.sierradeck.nucleo.Stile
import it.ferrariconsulenze.sierradeck.nucleo.Storia
import it.ferrariconsulenze.sierradeck.nucleo.Trasporto
import it.ferrariconsulenze.sierradeck.nucleo.ViaRisposta
import it.ferrariconsulenze.sierradeck.nucleo.senzaMezziCaratteri
import it.ferrariconsulenze.sierradeck.schermate.vecchie.EsitoAzioniChat
import it.ferrariconsulenze.sierradeck.schermate.vecchie.EsitoQuadernoPersonale
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Nota
import it.ferrariconsulenze.sierradeck.schermate.vecchie.NoteAggiornamento
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Panoramica
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Salute
import it.ferrariconsulenze.sierradeck.schermate.vecchie.StatoQuadernoPersonale
import it.ferrariconsulenze.sierradeck.schermate.vecchie.StatoSottofondo
import it.ferrariconsulenze.sierradeck.schermate.vecchie.TrascrizioneSpecialista
import it.ferrariconsulenze.sierradeck.schermate.vecchie.VistaSpazioChat
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave
import it.ferrariconsulenze.sierradeck.schermate.vecchie.richiestaRisposta
import it.ferrariconsulenze.sierradeck.schermate.vecchie.richiestaScheda
import it.ferrariconsulenze.sierradeck.sottofondo.ErroreDaMandare
import it.ferrariconsulenze.sierradeck.sottofondo.EsitoInvioErrori
import it.ferrariconsulenze.sierradeck.sottofondo.StoricoErroriPc

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

    private fun url(percorso: String, base: String = indirizzo) = base.trimEnd('/') + percorso

    private fun richiesta(percorso: String, corpo: RequestBody?, etag: String? = null, base: String = indirizzo): Request {
        val b = Request.Builder().url(url(percorso, base))
        if (corpo != null) b.post(corpo) else b.get()
        chiave?.takeIf { it.isNotBlank() }?.let { b.header("x-sierradeck-chiave", it) }
        etag?.let { b.header("If-None-Match", it) }
        return b.build()
    }

    private suspend fun corpoTesto(percorso: String, corpo: RequestBody?): String {
        val pc = ponte ?: return conSegno(Collegamenti.ACCOPPIATO, null) { corpoTestoDiretto(percorso, corpo) }
        // Attraverso il ponte: solo le rotte del riquadro remoto, impacchettate
        // per il PC accoppiato, che le gira all'altro.
        if (percorso !in Ponte.ROTTE) throw Errore(403, Ponte.nonSiPuo(percorso))
        val interno = corpo?.let { val b = okio.Buffer(); it.writeTo(b); b.readUtf8() }
        return conSegno(pc, Collegamenti.ACCOPPIATO) { corpoTestoDiretto("/api/ponte", Ponte.corpo(pc, percorso, interno).toRequestBody(JSON_MEDIA), lenta = percorso in ROTTE_LENTE) }
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
            Collegamenti.passo(chiave, EventoLinea.Ok(ora, ora - t0, if (tramite == null) Linea.stradaDiIndirizzo(Percorsi.effettivo(indirizzo)) else null))
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

    /**
     * Una chiamata al PC, sull'indirizzo che oggi funziona (k-50, `Percorsi`).
     *
     * L'indirizzo accoppiato resta l'identità del computer; la strada è quella che
     * risponde: rete di casa se sei sulla stessa WiFi, Tailscale se sei fuori. Se
     * la strada in uso cade (hai cambiato rete) si cerca l'altra e si riprova una
     * volta, con la stessa chiave: il PC lo si riconosce dall'impronta prima di
     * mandargliela.
     */
    private suspend fun corpoTestoDiretto(percorso: String, corpo: RequestBody?, lenta: Boolean = percorso in ROTTE_LENTE): String =
        withContext(Dispatchers.IO) {
            val base = Percorsi.effettivo(indirizzo)
            try {
                eseguiSu(base, percorso, corpo, lenta)
            } catch (e: java.io.IOException) {
                val altra = Percorsi.ritrova(indirizzo)
                if (altra == null || altra == base) throw e
                eseguiSu(altra, percorso, corpo, lenta)
            }
        }

    private fun eseguiSu(base: String, percorso: String, corpo: RequestBody?, lenta: Boolean): String =
        run {
            // Non un client solo: **quello legato alla rete giusta**. Un
            // indirizzo di casa deve uscire dal wifi, e Android da solo sceglie
            // la rete che porta a Internet — che con una VPN accesa, o con un
            // wifi che giudica scadente, non e' la stessa cosa. Il perche' sta
            // per intero in `Rete`.
            val cliente = Rete.clientePer(Indirizzi.hostDi(base)).let { c ->
                // Le rotte del negozio aspettano Claude Code: un'installazione
                // da GitHub ci mette fino a un paio di minuti. Con i 15 secondi
                // di sempre l'app diceva «non riuscito» mentre il computer
                // stava ancora installando (prova dell'08/10).
                if (lenta) c.newBuilder().readTimeout(LENTE_SECONDI, TimeUnit.SECONDS).build() else c
            }
            // Con l'ETag (PC 0.86.0, `EtagTenuti`): uguale a prima, 304 e il testo tenuto.
            val chiaveEtag = if (percorso in EtagTenuti.ROTTE) EtagTenuti.chiave(indirizzo, percorso, corpo?.let { val b = okio.Buffer(); it.writeTo(b); b.readUtf8() }) else null
            val etag = chiaveEtag?.let { EtagTenuti.etag(it) }
            cliente.newCall(richiesta(percorso, corpo, etag, base)).execute().use { r ->
                if (r.code == 304 && chiaveEtag != null) {
                    EtagTenuti.testo(chiaveEtag)?.let { return@run it }
                }
                val testo = leggiConTetto(r)
                if (r.code == 304) {
                    // Il testo tenuto non c'è più (uscito dalle voci): si richiede senza ETag.
                    return@run cliente.newCall(richiesta(percorso, corpo, null, base)).execute().use { r2 ->
                        val t2 = leggiConTetto(r2)
                        if (!r2.isSuccessful) throw Errore(r2.code, t2)
                        chiaveEtag?.let { EtagTenuti.tieni(it, r2.header("ETag"), t2) }
                        t2
                    }
                }
                if (!r.isSuccessful) throw Errore(r.code, testo)
                chiaveEtag?.let { EtagTenuti.tieni(it, r.header("ETag"), testo) }
                testo
            }
        }

    /**
     * Il corpo come testo, ma con un tetto (k-4): una risposta da 214 MB letta
     * intera finiva in OutOfMemoryError (limite di 256 MB) e portava giù il
     * lavoro. Oltre il tetto si lancia un Errore chiaro, senza leggere il resto.
     */
    private fun leggiConTetto(r: okhttp3.Response): String {
        val b = r.body ?: return ""
        val troppo = { Errore(413, "Risposta troppo grande per il telefono (oltre ${TETTO_RISPOSTA_BYTE / (1024 * 1024)} MB).") }
        if (b.contentLength() > TETTO_RISPOSTA_BYTE) throw troppo()
        val sorgente = b.source()
        sorgente.request(TETTO_RISPOSTA_BYTE + 1)
        if (sorgente.buffer.size > TETTO_RISPOSTA_BYTE) throw troppo()
        return sorgente.readString(b.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8)
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
    suspend fun stato(): Stato = statoConTesto().first

    /** Gli autopiloti degli altri PC (PC 0.59.0): li raccoglie il PC accoppiato, con la firma di casa. */
    suspend fun autopilotiAltri(): List<AutopilotiDiPc> =
        json.decodeFromString(RispostaAutopilotiAltri.serializer(), corpoTesto("/api/autopiloti/altri", null)).pc
    /** Tutto quello che aspetta una risposta da te (dalla 0.30 del computer: prima 404). */
    suspend fun domande(): Domande {
        val testo = corpoTesto("/api/domande", null)
        return withContext(Dispatchers.Default) { json.decodeFromString<Domande>(testo) }
    }
    /** Lo stato com'è arrivato, da decodificare solo se è cambiato (0.83.0, `StatoSoloSeCambia`). */
    suspend fun statoGrezzo(): String = corpoTesto("/api/stato", null)
    /** Lo stato letto, insieme al testo grezzo: la guardia degli avvisi lo legge come JSON generico. */
    suspend fun statoConTesto(): Pair<Stato, String> {
        val testo = corpoTesto("/api/stato", null)
        // Lo stato sono 14 KB ogni due secondi: decodificarli sul thread dello
        // schermo rubava fotogrammi a chi scorre (0.83.0). Si legge a parte.
        return withContext(Dispatchers.Default) { json.decodeFromString<Stato>(testo) } to testo
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
            put("chat", chat); put("opzione", senzaMezziCaratteri(opzione))
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

    // ─── l'autopilota unico (PC 0.86.x): sempre acceso, niente ferma, riprendi o via ───
    /**
     * L'avanzamento dell'autopilota di un workspace: la vista dell'orchestratore
     * (percentuale, specialisti, piano) e la coda delle richieste. Senza
     * workspace la chiave è la cartella dell'autopilota (`id`). Un PC che non
     * le conosce risponde con `null` (o «non trovato», se è più vecchio).
     */
    suspend fun avanzamentoAutopilota(workspace: String?, id: String): AvanzamentoAutopilota =
        json.decodeFromString(corpoTesto("/api/autopilota/avanzamento", oggetto {
            if (!workspace.isNullOrBlank()) put("workspace", workspace) else put("autopilota", id)
        }))

    /** PC 0.95.1: la conversazione di uno specialista dell'autopilota del workspace. */
    suspend fun specialista(workspace: String, id: String): TrascrizioneSpecialista =
        json.decodeFromString(corpoTesto("/api/autopilota/specialista", oggetto {
            put("workspace", workspace); put("id", id)
        }))

    // ─── chat: azioni ───
    suspend fun chiudiChat(chat: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/chiudi", oggetto { put("chat", chat) }))

    suspend fun rinominaChat(chat: String, nome: String): Fatto =
        json.decodeFromString(corpoTesto("/api/chat/nome", oggetto {
            put("chat", chat); put("nome", nome)
        }))

    // ─── la gestione delle chat (PC 0.79.0): Chiudi, Archivia, Elimina dal PC, lo spazio, il recupero ───
    private fun sessioniJson(sessioni: List<String>) = kotlinx.serialization.json.JsonArray(sessioni.map { kotlinx.serialization.json.JsonPrimitive(it) })

    suspend fun spazioChat(sessioni: List<String> = emptyList()): VistaSpazioChat =
        json.decodeFromString(corpoTesto("/api/chat/gestione/spazio", oggetto { if (sessioni.isNotEmpty()) put("sessioni", sessioniJson(sessioni)) }))

    suspend fun azioneChat(azione: String, sessioni: List<String>, ancheDalDrive: Boolean = false): EsitoAzioniChat =
        json.decodeFromString(corpoTesto("/api/chat/gestione/azione", oggetto {
            put("azione", azione); put("sessioni", sessioniJson(sessioni)); put("ancheDalDrive", ancheDalDrive)
        }))

    // ─── lo storico degli errori (PC 0.81.0) ───
    suspend fun storicoErrori(): StoricoErroriPc = json.decodeFromString(corpoTesto("/api/errori", oggetto { }))

    suspend fun mandaErrori(): EsitoInvioErrori = json.decodeFromString(corpoTesto("/api/errori/manda", oggetto { }))

    /** Gli errori di quest'app, al PC: lui li tiene nel suo storico con «app» come posto. */
    suspend fun aggiungiErrori(versione: String, errori: List<ErroreDaMandare>) {
        corpoTesto("/api/errori/aggiungi", oggetto {
            put("dove", "app"); put("versione", versione)
            put("errori", kotlinx.serialization.json.JsonArray(errori.map { e ->
                buildJsonObject { put("testo", e.testo); e.cosa?.let { put("cosa", it) } }
            }))
        })
    }

    // ─── il nome scelto di questo computer (PC 0.52.4) ───
    suspend fun nomePc(nome: String): NomeComputer =
        json.decodeFromString(corpoTesto("/api/nome-pc", oggetto { put("nome", nome) }))

    // ─── workspace ───
    suspend fun cambiaWorkspace(nome: String): Fatto {
        // Mai un cambio senza nome (PC 0.67.1): il PC lo rifiuta e il registro
        // del ponte scriveva «passo al workspace «»».
        require(nome.isNotBlank()) { "manca il nome del workspace" }
        return json.decodeFromString(corpoTesto("/api/workspace", oggetto { put("nome", nome) }))
    }

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

    suspend fun sessioni(senzaNome: Boolean = false): Sessioni =
        json.decodeFromString(corpoTesto("/api/sessioni", if (senzaNome) oggetto { put("senzaNome", true) } else null))

    suspend fun riprendiSessione(cartella: String, sessione: String): Fatto =
        json.decodeFromString(corpoTesto("/api/sessioni/riprendi", oggetto {
            put("cartella", cartella); put("sessione", sessione)
        }))

    /**
     * Le chat in sottofondo (PC 0.58.4): quel PC avvia la conversazione senza
     * finestre e il testo parte appena è pronta. Si chiama con `suPc(pc)`.
     */
    suspend fun avviaSottofondo(cartella: String, sessione: String, titolo: String, testo: String?, idMessaggio: String?): StatoSottofondo =
        json.decodeFromString(corpoTesto("/api/sottofondo/avvia", oggetto {
            put("cartella", cartella); put("sessione", sessione); put("titolo", titolo)
            if (testo != null && idMessaggio != null) { put("testo", testo); put("idMessaggio", idMessaggio) }
        }))

    suspend fun statoSottofondo(sessione: String): StatoSottofondo =
        json.decodeFromString(corpoTesto("/api/sottofondo/stato", oggetto { put("sessione", sessione) }))

    // ─── autopiloti: dettaglio, crea, elimina, riavvio ───
    /**
     * La scheda di un autopilota. Leggera (PC 0.86.0): di decisioni, dialogo e
     * modifiche la coda, della conversazione le ultime battute (`chatIntera`
     * dice quante erano). `intera` solo quando la chiedi tu, con «Mostra tutta
     * la conversazione». Un PC più vecchio ignora il segno e la manda intera.
     */
    suspend fun autopilota(id: String, intera: Boolean = false): AutopilotaDettaglio {
        val testo = corpoTesto("/api/autopilota", oggetto { put("autopilota", id); if (!intera) put("leggero", true) })
        return withContext(Dispatchers.Default) { json.decodeFromString<AutopilotaDettaglio>(testo) }
    }

    /** La Panoramica del workspace (PC 0.77.0): il riassunto dell'autopilota e una scheda per chat, già in ordine. */
    suspend fun panoramica(workspace: String): Panoramica =
        json.decodeFromString(corpoTesto("/api/panoramica", oggetto { put("workspace", workspace) }))

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
     * Con i campi della finestra del PC (PC 0.55.0), già controllati da
     * `AzioniTelefono.controlla`. Criteri e partenza no (PC 0.88.0): l'autopilota
     * unico se li ricava lui, e il PC li ignorava.
     */
    suspend fun creaAutopilota(r: RichiestaAutopilota): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/crea", oggetto {
            put("obiettivo", r.obiettivo); put("cartella", r.cwd); put("nome", r.nome)
            put("pubblicazione", r.pubblicazione); put("vaSulCloud", r.vaSulCloud == true)
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

    /**
     * Gli scrivi. Il computer risponde subito «ricevuto»: la sua risposta
     * compare in `AutopilotaDettaglio.dialogo` al giro dopo. Un computer con
     * una versione precedente risponde 409.
     */
    /** «Salute del sistema» (0.44.0). */
    suspend fun salute(): Salute = json.decodeFromString(corpoTesto("/api/salute", null))

    suspend fun dialogaAutopilota(id: String, testo: String): Fatto =
        json.decodeFromString(corpoTesto("/api/autopilota/dialogo", oggetto {
            put("autopilota", id); put("testo", testo)
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

    /** I workspace eliminati negli ultimi 30 giorni (PC 0.81.0). Un PC più vecchio risponde «non trovato». */
    suspend fun recuperoWorkspace(): RecuperoWs =
        json.decodeFromString(corpoTesto("/api/workspace/recupero", null))

    /** «Ripristina»: il workspace torna sul PC, lo schermo del PC non cambia. */
    suspend fun ripristinaWorkspace(nome: String, eliminatoIl: String): Ripristinato =
        json.decodeFromString(corpoTesto("/api/workspace/ripristina", oggetto { put("nome", nome); put("eliminatoIl", eliminatoIl) }))

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

    // ─── aggiornamento del COMPUTER ───
    suspend fun aggiornamento(): Aggiornamento =
        json.decodeFromString(corpoTesto("/api/aggiornamento", null))

    suspend fun scaricaAggiornamento(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/scarica", oggetto { }))

    suspend fun installaAggiornamento(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/installa", oggetto { }))

    /**
     * «Aggiorna adesso» (PC 0.84.1): non aspetta che le chat finiscano il turno,
     * salva il loro lavoro sul loro ramo e installa. Solo col tasto di Nicholas.
     */
    suspend fun aggiornaAdesso(): Fatto =
        json.decodeFromString(corpoTesto("/api/aggiornamento/aggiorna-adesso", oggetto { }))

    /** Cosa cambia con l'aggiornamento pronto: si mostra prima di «Installa» (0.39.0). */
    suspend fun noteAggiornamento(): NoteAggiornamento =
        json.decodeFromString(corpoTesto("/api/aggiornamento/note", null))

    /** Che versione ha il computer. Serve a dire «sei alla X» invece di niente. */
    suspend fun ciao(): Ciao = json.decodeFromString(corpoTesto("/api/ciao", null))

    /** Gli indirizzi del PC (rete di casa e Tailscale) e la sua impronta, per ritrovarlo senza VPN (k-50). */
    suspend fun indirizziPc(): IndirizziPc = json.decodeFromString(corpoTesto("/api/indirizzi", null))

    /**
     * Le cartelle dentro una cartella del computer.
     *
     * Senza percorso torna i punti di partenza. Serve ad aprire una chat in un
     * progetto **nuovo**: prima si potevano scegliere solo le cartelle gia'
     * conosciute, e un progetto mai aperto da qui non c'era modo di sceglierlo.
     */
    suspend fun sfoglia(percorso: String = ""): Sfoglia =
        json.decodeFromString(corpoTesto("/api/sfoglia", oggetto { put("percorso", percorso) }))

    /**
     * La catena del Drive del computer. Dal PC 0.88.0 l'account di SierraDeck
     * non c'è più: risponde `entrato: false`, con la catena se c'è.
     */
    suspend fun account(): Account =
        json.decodeFromString(corpoTesto("/api/account", null))

    // ─── consumi ───
    suspend fun consumi(): Consumi = json.decodeFromString(corpoTesto("/api/consumi", null))

    // ─── la sezione File (PC 0.54.0): i progetti del PC, in sola lettura ───
    suspend fun fileProgetti(): ProgettiFile = json.decodeFromString(corpoTesto("/api/file/progetti", oggetto { }))

    /** «Apri cartella» (PC 0.82.0): dove sta la cartella di un workspace o di una chat, per la sezione File. */
    suspend fun fileCartella(workspace: String? = null, chat: String? = null): CartellaFile =
        json.decodeFromString(corpoTesto("/api/file/cartella", oggetto { if (chat != null) put("chat", chat) else put("workspace", workspace ?: "") }))

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
        /** Le rotte che possono metterci più dei 15 secondi di sempre: il CLI di Claude Code (minuti) e il pannello del Drive. */
        val ROTTE_LENTE = setOf(
            "/api/negozio", "/api/negozio/installa", "/api/negozio/aggiorna",
            "/api/negozio/commuta", "/api/negozio/cerca", "/api/negozio/salute-mcp",
            // Il pannello del Drive (PC 0.60.2): sul PC ci mette anche 15
            // secondi, quanto l'attesa di sempre; attraverso il ponte di più.
            // Vale anche quando passa dal ponte: lì la rotta è dentro il corpo.
            "/api/drive/pannello", "/api/drive/azione",
            // «Libera spazio sul Drive» (PC k-307): misurare la quota e le proposte legge il Drive.
            "/api/drive/spazio/stato", "/api/drive/spazio/quota", "/api/drive/spazio/in-sospeso", "/api/drive/spazio/riprendi",
            // PC 0.68.0: l'elenco delle conversazioni e l'avvio in sottofondo di un altro PC.
            "/api/sessioni", "/api/sessioni/riprendi", "/api/sottofondo/avvia",
            // PC 0.79.0: lo spazio misura ogni chat sul disco, e svuotare il recupero cancella davvero.
            "/api/chat/gestione/spazio", "/api/chat/gestione/azione", "/api/chat/gestione/ripristina", "/api/chat/gestione/svuota",
            // PC 0.81.0: le stesse lente del ponte del PC (pc-remoto.ts). Con 15 s
            // l'app diceva «scaduto» mentre il PC creava il workspace, e chi
            // riprovava ne faceva due. Un test le tiene allineate.
            "/api/workspace/crea", "/api/workspace/progetto", "/api/file/progetti", "/api/file/elenco", "/api/file/cartella"
        )
        /** Il CLI ne concede 180 a un'installazione: qualcosa in più, per la rete. */
        const val LENTE_SECONDI = 200L

        /** Il tetto di una risposta letta come testo: 16 MB (limite di memoria dell'app: 256 MB). */
        const val TETTO_RISPOSTA_BYTE = 16L * 1024 * 1024

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
