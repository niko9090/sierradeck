package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * I modelli dell'API del computer, tipati.
 *
 * Uno per forma di risposta, con i campi che il desktop manda davvero (vedi il
 * contratto in `client-rotte.ts`). Tutti i campi hanno un default: se il computer
 * gira una versione più vecchia che non manda un campo, l'app non cade — legge
 * ciò che c'è e tira avanti. Lo stesso vale al contrario, grazie a
 * `ignoreUnknownKeys` nel `Json` del client.
 *
 * NB: `led`, le percentuali dei passaggi e i colori arrivano **già calcolati**
 * dal desktop — non si reinventano qui, o tornerebbe la divergenza già vissuta
 * (fallito e finito con lo stesso puntino grigio).
 */

// ─── /api/accoppia ───
@Serializable
data class Accoppiamento(val id: String = "", val chiave: String = "")

// ─── /api/stile ───  (la tavolozza del computer, per vestirsi uguale)
@Serializable
data class Stile(
    /** I token CSS del desktop: `--fondo`, `--accento`, `--incisione`, `--raggio`… */
    val token: Map<String, String> = emptyMap(),
    /** banco | foglio */
    val stile: String = "banco"
)

// ─── /api/stato ───
@Serializable
data class Stato(
    val chat: List<Chat> = emptyList(),
    val autopiloti: List<AutopilotaBreve> = emptyList(),
    val domande: List<Domanda> = emptyList(),
    /**
     * Quante domande aspettano te, contate dal computer con la stessa funzione
     * del tasto «Domande» del PC (dalla 0.37.2). Null da un computer piu' vecchio.
     */
    val domandeInAttesa: Int? = null,
    val workspace: Workspace = Workspace(),
    /**
     * Come sta l'aggiornamento del computer.
     *
     * Viaggia con lo stato perche' e' l'unico modo di accorgersi che il
     * computer si sta per **chiudere**: la fase «installo» e' l'ultima cosa che
     * dice prima di sparire, e senza di lei il silenzio che segue e'
     * indistinguibile da un cavo staccato.
     */
    val aggiornamento: Aggiornamento? = null,
    /** Il Drive del computer scollegato (0.39.3): la banda in cima. Manca se e' collegato. */
    val driveScollegato: AvvisoDrive? = null,
    /** Come si chiama questa macchina: serve a chi ne ha piu' di una. */
    val computer: NomeComputer? = null,
    /** Attraverso il ponte (PC 0.51.0): la strada fra il PC accoppiato e quello guardato, e il tempo del giro. */
    val ponte: InfoPonte? = null,
    /** I progetti sul Drive: chi li ha in mano e quanti comandi aspettano nella coda condivisa. */
    val progetti: List<ProgettoBreve> = emptyList(),
    /** Le chat chiuse da te sul computer (PC 0.60.9), con l'ora: chi le guarda da qui lo dice e torna all'elenco. */
    val chiuse: List<ChiusaDaTe> = emptyList(),
    /** «N di M chat» (PC 0.82.0): quante chat degli autopiloti lavorano insieme sul computer. Null da un PC più vecchio. */
    val postiChat: PostiChat? = null
)

/**
 * Quante chat degli autopiloti lavorano sul computer e quante ne lascia
 * lavorare insieme (PC 0.82.0). I testi li scrive il computer, uguali al PC e
 * alla pagina: qui si mostrano e basta.
 */
@Serializable
data class PostiChat(
    val attive: Int = 0,
    val posti: Int = 0,
    val inFila: Int = 0,
    val riga: String = "",
    val spiega: String = ""
) {
    /** Pieno: le chat nuove aspettano in fila. */
    val pieno: Boolean get() = posti > 0 && attive >= posti
}

@Serializable
data class ChiusaDaTe(val sessione: String = "", val il: String = "")

@Serializable
data class ProgettoBreve(
    val id: String,
    val nome: String = "",
    val chi: String = "libero",
    val pcNome: String? = null,
    val inCoda: Int = 0
)

/** Un altro PC sul Drive, dal suo battito: c'e', dove lavora, che chat ha. */
@Serializable
data class PcRemoto(
    val pcId: String,
    val nome: String = "",
    /** L'hostname e il nome scelto (PC 0.52.4): si mostra `mostra`, l'hostname piccolo sotto. */
    val host: String = "",
    val nomeScelto: String = "",
    val versione: String = "",
    val battito: String = "",
    /** Deciso dal computer, che ha l'ora giusta. */
    val vivo: Boolean = false,
    val cartelle: List<String> = emptyList(),
    val chat: List<ChatDiPc> = emptyList()
) {
    /** Il nome da mostrare (`NomePc.daMostrare`). */
    val mostra: String get() = NomePc.daMostrare(nomeScelto, nome, host)
    /** L'hostname piccolo sotto, se dice qualcosa in più. */
    val sotto: String? get() = NomePc.sottotitolo(nomeScelto, nome, host)
}

@Serializable
data class ChatDiPc(val sessione: String? = null, val titolo: String = "", val cwd: String = "", val aspetta: Boolean = false)

@Serializable
data class ElencoPc(val io: String = "", val pc: List<PcRemoto> = emptyList(), val disponibile: Boolean = true)

/** La cassetta di un PC: le azioni da eseguire solo la'. */
@Serializable
data class Posta(val voci: List<VocePosta> = emptyList(), val disponibile: Boolean = true, val fatto: Boolean = false)

@Serializable
data class VocePosta(
    val id: String,
    val testo: String = "",
    val cwd: String = "",
    val sessione: String? = null,
    val creataIl: String = "",
    val daNome: String = "",
    val stato: String = "attesa",
    val consegnataIl: String? = null,
    val esito: String? = null,
    val apertaIl: String? = null
)

/** La coda condivisa dei comandi di un progetto, com'e' sul Drive. */
@Serializable
data class Coda(val voci: List<VoceCoda> = emptyList(), val disponibile: Boolean = true, val fatto: Boolean = false)

@Serializable
data class VoceCoda(
    val id: String,
    val testo: String = "",
    val creataIl: String = "",
    val daNome: String = "",
    val sessione: String? = null,
    val stato: String = "attesa",
    val consegnataIl: String? = null,
    val aNome: String? = null,
    val aSessione: String? = null
)

@Serializable
data class NomeComputer(
    /** Dalla 0.52.4 è il nome scelto (ripiego: l'hostname); prima era sempre l'hostname. */
    val nome: String = "",
    /** L'hostname (dalla 0.52.4): solo come sottotitolo piccolo. */
    val host: String = "",
    /** Il nome scelto, se c'è (dalla 0.52.4). */
    val nomeScelto: String = "",
    /** La versione del programma (dalla 0.43.0): l'app spegne le funzioni che il computer non ha ancora. */
    val versione: String? = null
)

@Serializable
data class Chat(
    val id: String,
    val titolo: String = "",
    /** PC 0.70: il nome da mostrare quando più chat del workspace hanno lo stesso titolo («Nome #2»). */
    val nome: String? = null,
    val cwd: String = "",
    val sessione: String? = null,
    /** L'ultima riga del terminale: il «battito» a colpo d'occhio. */
    val ultimaRiga: String? = null,
    /** Il progetto di questa chat e' in mano a un altro PC: il suo nome. Un'informazione, non un comando. */
    val altrove: String? = null,
    /** Sullo schermo c'e' un elenco di scelte che aspetta te (dalla 0.30). */
    val chiede: Boolean = false,
    /** Ha finito di scrivere e aspetta te. */
    val aspetta: Boolean = false,
    /** La governa un autopilota: e' lui a parlare per lei. */
    val governata: Boolean = false,
    /**
     * Ha un terminale acceso. Assente nei computer piu' vecchi: allora vale
     * «si'», che era come l'app la trattava prima di saperlo.
     */
    val viva: Boolean = true,
    /**
     * Il PIN delle chat (PC 0.49.0): `chiusa` = protetta e non sbloccata da
     * questo telefono (niente ultima riga), `aperta` = protetta ma sbloccata.
     * Assente se la chat non è protetta, o con un computer più vecchio.
     */
    val pin: String? = null,
    /** Lavora in sottofondo, senza riquadro sullo schermo del PC (PC 0.58.4; mostrato dalla 0.69.0). */
    val sottofondo: ChiSottofondo? = null,
    /** PC 0.82.0: il workspace della chat; anche quelle dei workspace che il PC tiene vivi dietro, che prima mancavano (e risultavano «chiusa»). */
    val workspace: String? = null
)

@Serializable
data class ChiSottofondo(val id: String = "", val nome: String = "")

/**
 * Una voce della scheda «Domande»: una sola forma per tre famiglie, con i
 * campi che non servono lasciati al predefinito. `tipo` e' `autopilota`,
 * `scelta` o `chat` (vedi `domande-telefono.ts` sul computer).
 */
@Serializable
data class VoceDomanda(
    val tipo: String = "",
    val id: String = "",
    val autopilotaId: String = "",
    val autopilota: String = "",
    /** `intervista` (prima di partire) o `lavoro`. */
    val origine: String = "",
    val testo: String = "",
    val apertaIl: Long? = null,
    val scadeIl: Long? = null,
    val chat: String = "",
    val titolo: String = "",
    val cwd: String = "",
    val righe: List<String> = emptyList(),
    /** Oggetti dalla 0.43.0 del PC; dalla 0.36 alla 0.42 per un autopilota erano stringhe: si leggono tutte e due. */
    val opzioni: List<@Serializable(with = OpzioneTollerante::class) Opzione> = emptyList(),
    val corrente: Int = 0
)

/**
 * Un'opzione scritta come oggetto o come stringa (0.43.0). I PC dalla 0.36
 * alla 0.42 mandavano le risposte da toccare di un autopilota come stringhe,
 * e l'app non leggeva piu' niente della scheda Domande.
 */
object OpzioneTollerante : kotlinx.serialization.json.JsonTransformingSerializer<Opzione>(Opzione.serializer()) {
    override fun transformDeserialize(element: kotlinx.serialization.json.JsonElement): kotlinx.serialization.json.JsonElement =
        if (element is kotlinx.serialization.json.JsonPrimitive && element.isString)
            kotlinx.serialization.json.buildJsonObject { put("testo", element) }
        else element
}

@Serializable
data class Domande(
    val voci: List<VoceDomanda> = emptyList(),
    /**
     * Le stesse domande come conversazioni a messaggi (0.36.0), composte dal
     * computer con la stessa funzione del PC e della pagina. Vuote con un
     * computer piu' vecchio: allora si mostra la vista di prima.
     */
    val conversazioni: List<Conversazione> = emptyList()
)

/** Un messaggio della conversazione: `da` e' "lui", "tu" o "nota". */
@Serializable
data class MessaggioConversazione(
    val da: String = "lui",
    val testo: String = "",
    val quando: String? = null,
    /** "domanda" = aspetta la tua risposta a questo messaggio. */
    val tono: String? = null,
    val opzioni: List<Opzione>? = null
)

/** Come si risponde: `via` e' "rispondi" (domanda), "dialogo" (autopilota) o "scrivi" (chat). */
@Serializable
data class ViaRisposta(
    val via: String = "scrivi",
    val domanda: String? = null,
    val autopilota: String? = null,
    val chat: String? = null
)

@Serializable
data class ScelteConversazione(val chat: String = "", val opzioni: List<Opzione> = emptyList())

/** Una domanda della linguetta «Domande» dell'autopilota (0.38.0). */
@Serializable
data class DomandaScheda(
    val chiave: String = "",
    /** "domanda" (si risponde al servizio) o "via" (il via, o un messaggio). */
    val tipo: String = "domanda",
    val idDomanda: String? = null,
    val testo: String = "",
    val opzioni: List<String> = emptyList(),
    /** preparazione, lavoro, pubblica, via. */
    val origine: String = "lavoro",
    /** PC 0.72.1: la domanda essenziale (la frase, i tasti, il resto nel «?»). */
    val scheda: SchedaDomanda? = null
)

/**
 * Una domanda essenziale (PC 0.72.1): chi chiede in piccolo, la domanda in una
 * frase, le scelte come tasti (la consigliata segnata), «Scrivi tu», e il resto
 * dietro un «?». La calcola il PC; l'app la disegna così com'è.
 */
@Serializable
data class SchedaDomanda(
    val chi: String = "",
    val domanda: String = "",
    val scelte: List<SceltaScheda> = emptyList(),
    val dettagli: List<DettaglioScheda> = emptyList(),
    val segnaposto: String = "Scrivi tu",
    /** L'autopilota ha già risposto da solo. */
    val risposta: String? = null,
    /** Chiusa senza risposta perché non serve più (PC 0.84.1): il motivo. */
    val superata: String? = null,
    /** Quante altre domande aspettano dopo questa. */
    val poi: Int? = null
)

@Serializable
data class SceltaScheda(
    val testo: String = "",
    val consigliata: Boolean = false,
    val numero: Int? = null,
    val libera: Boolean = false,
    val spuntata: Boolean? = null,
    val invio: Boolean = false
)

@Serializable
data class DettaglioScheda(val etichetta: String = "", val testo: String = "")

/** Gli specialisti di un autopilota (PC 0.73.0): come è organizzato il lavoro, e uno per chat. */
@Serializable
data class Specialisti(val riga: String = "", val elenco: List<Specialista> = emptyList())

@Serializable
data class Specialista(
    val id: String = "",
    val ruolo: String = "",
    /** Un nome della tabella dei colori (`TabellaAttivita.colori`). */
    val colore: String = "quieto",
    val compito: String = "",
    val stato: String = "",
    val attivo: Boolean = false,
    val ultimaAzione: String = "",
    val sessionId: String? = null,
    val workspace: String? = null,
    /** PC 0.74.0: ha finito e la sua chat si è chiusa da sola. */
    val chiusa: Boolean = false,
    /** PC 0.82.0: cosa fa, per il colore fisso (`TabellaAttivita`); assente da un PC più vecchio. */
    val attivita: String? = null,
    /** PC 0.82.0: cosa fa in parole semplici e da quanto. */
    val cosa: String = "",
    val quanto: String = ""
)

/** La linguetta «File» (0.38.0): i file cambiati, per chat. */
@Serializable
data class FileAutopilota(val gruppi: List<GruppoFile> = emptyList())

@Serializable
data class GruppoFile(
    val chiave: String = "",
    val nome: String = "",
    val cartella: String = "",
    val ramo: String? = null,
    val base: String = "",
    val file: List<FileCambiato> = emptyList(),
    val errore: String? = null
)

@Serializable
data class FileCambiato(
    val percorso: String = "",
    val vecchio: String? = null,
    val stato: String = "modificato",
    val piu: Int = 0,
    val meno: Int = 0,
    val salvato: Boolean = false,
    val binario: Boolean? = null
)

@Serializable
data class DiffFile(val diff: String = "")

@Serializable
data class Conversazione(
    val chiave: String = "",
    /** "autopilota" o "chat". */
    val tipo: String = "chat",
    val titolo: String = "",
    val sotto: String = "",
    val chiede: Boolean = false,
    val messaggi: List<MessaggioConversazione> = emptyList(),
    val risposta: ViaRisposta = ViaRisposta(),
    val scelte: ScelteConversazione? = null,
    val segnaposto: String = "Scrivi…",
    /** Quante domande dentro (0.38.0). */
    val quante: Int? = null,
    /** L'autopilota di questa conversazione: si risponde nella sua scheda (0.38.0). */
    val autopilota: String? = null,
    /** La chat e' su un altro PC (0.39.3): il suo nome, per il segno «SU <PC>». */
    val suPc: String? = null,
    /** La strada con cui il computer arriva a quel PC (0.40.0): «rete di casa», «Tailscale», «WebRTC», «Drive, lento». */
    val viaPc: String? = null,
    /** PC 0.70: il tipo in una parola (permesso, scelta, domanda, autopilota, ha finito). */
    val vista: StatoVistaDrive? = null,
    /** PC 0.72.1: la domanda essenziale, al posto della conversazione. */
    val scheda: SchedaDomanda? = null
)

/** Aspetta davvero te (PC 0.70): tutto tranne le chat che hanno solo finito il turno. */
fun aspettaTe(c: Conversazione): Boolean = c.vista?.let { it.id != "finito" } ?: (c.chiede || c.tipo == "autopilota")

/** PC 0.73.1: nel numero solo chi aspetta davvero; le risposte già date dall'autopilota stanno nella lista, non nel conto. */
fun contaAspettanoTe(tutte: List<Conversazione>): Int =
    tutte.count { c -> c.vista?.let { it.id != "finito" && it.id != "risposta" } ?: c.chiede }

/** Un nodo dell'albero delle chat di un autopilota (T7, 0.36.0). */
@Serializable
data class RuoloChat(val id: String = "", val nome: String = "", val parola: String = "", val colore: String = "quieto")

@Serializable
data class NodoAlbero(
    /** PC 0.71: il ruolo della chat (Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio) e se il suo ramo è approvato. */
    val ruolo: RuoloChat? = null,
    val revisioneDi: String? = null,
    val approvata: Boolean = false,
    val id: String = "",
    /** "coordinatore" o "chat". */
    val tipo: String = "chat",
    val titolo: String = "",
    val stato: String = "",
    val parola: String = "",
    val ramo: String? = null,
    val cartella: String? = null,
    val cicli: Int = 0,
    val figli: List<NodoAlbero> = emptyList()
)

@Serializable
data class AutopilotaBreve(
    val id: String,
    val nome: String = "",
    /** intervista | pronto | lavoro | attesa | sospeso | finito | fallito */
    val stato: String = "",
    /** Colore/urgenza del LED, deciso dal desktop. */
    val led: String = "",
    val cicli: Int = 0,
    val strategia: String = "",
    val motivo: String = "",
    val cwd: String = "",
    val fatti: Int = 0,
    val criteri: Int = 0,
    /** Si vede sempre chi lavora (PC 0.69.0): le parole le decide il PC. */
    val dalVivo: StatoDalVivo? = null,
    /** PC 0.70: lo stato in una parola, i criteri, l'ultima azione, il verbo. */
    val vista: VistaAutopilotaApp? = null
)

@Serializable data class CriteriVistaApp(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—")
@Serializable data class VistaAutopilotaApp(
    val stato: StatoVistaDrive = StatoVistaDrive(), val criteri: CriteriVistaApp = CriteriVistaApp(),
    val ultima: String = "", val da: String = "", val azione: String = "nessuna"
)

/** La riga sotto il nome di un autopilota (PC 0.70): «da 6 min · criteri 0/1». */
fun sottoAutopilota(v: VistaAutopilotaApp): String = listOfNotNull(v.da.takeIf { it.isNotBlank() }?.let { "da $it" }, "criteri ${v.criteri.testo}").joinToString(" · ")

@Serializable
data class RigaAdesso(
    val id: String = "",
    val chi: String = "",
    val compito: String = "",
    val testo: String = "",
    /** lavoro | aspetta | pausa | ferma */
    val tono: String = "lavoro"
)

/**
 * Il riquadro «Adesso» (PC 0.81.0): cosa fa ogni chat dell'autopilota, da
 * quanto, e se è ferma perché. Le righe sono già scritte dal PC.
 */
@Serializable
data class Adesso(
    val righe: List<RigaAdesso> = emptyList(),
    val finite: Int = 0,
    val aiuto: String = ""
)

/** Lo stesso colore del PC (`COLORE_ADESSO`). */
fun coloreAdesso(tono: String): String = when (tono) {
    "ferma" -> "rosso"
    "aspetta" -> "ambra"
    "pausa" -> "quieto"
    else -> "verde"
}

/** «2 chat finite»: le finite non hanno una riga ciascuna. */
fun righeFinite(n: Int): String? = when {
    n <= 0 -> null
    n == 1 -> "1 chat finita"
    else -> "$n chat finite"
}

/** «al lavoro · da 12 min», l'ultima azione, «nessun segno da 10 min» (PC 0.69.0). */
@Serializable
data class StatoDalVivo(
    val etichetta: String = "",
    val da: String = "",
    val ultimaAzione: String = "",
    val senzaSegni: String? = null
)

/**
 * La parola di una chat governata (0.80.0, come `chatAlLavoro` del PC): segnata
 * «lavoro» ma con l'autopilota fermo non è al lavoro.
 */
fun parolaChatGovernata(statoAutopilota: String, statoChat: String): String = when (statoChat) {
    "lavoro" -> if (statoAutopilota == "lavoro" || statoAutopilota == "attesa" || statoAutopilota == "intervista") "al lavoro" else "ferma: l’autopilota è fermo"
    "bloccata" -> "ferma, aspetta una risposta"
    else -> "finita"
}

/** Il colore della parola dal vivo, come `COLORE_DAL_VIVO` del PC (0.80.0): «fermo» è rosso. */
fun tonoDalVivo(etichetta: String): String = when (etichetta) {
    "al lavoro" -> "verde"
    "aspetta te" -> "ambra"
    "fermo" -> "rosso"
    else -> "quieto"
}

/** Un messaggio verso la chat e il suo stato vero (PC 0.69.0). */
@Serializable
data class StatoMessaggio(
    val id: String = "",
    val testo: String = "",
    /** in attesa | in consegna | consegnato */
    val stato: String = "",
    /** «consegnato alle 20:31», «in attesa da 3 min». */
    val dettaglio: String = "",
    val mandaAdesso: Boolean = false
)

@Serializable
data class Domanda(
    val id: String,
    val autopilotaId: String = "",
    val testo: String = ""
)

@Serializable
data class Workspace(
    val nomi: List<String> = emptyList(),
    val attivo: String = "",
    /**
     * Tutte le chat dell'archivio, workspace per workspace.
     *
     * Quelle vive (un terminale acceso in una finestra) arrivano in `Stato.chat`;
     * queste sono anche le altre — degli altri workspace, o spente — e si
     * riaprono con un tocco. Assente nei computer con una versione precedente.
     */
    val chat: List<ChatSalvata> = emptyList(),
    /** PC 0.65.1: i workspace degli altri PC che qui non ci sono, a parte («Su altri PC»). */
    val altrove: List<WorkspaceAltrove> = emptyList(),
    /** PC 0.82.0: dove Nicholas è andato per ultimo, per «Recenti» del menu dei workspace. */
    val recenti: List<String> = emptyList()
)

@Serializable
data class WorkspaceAltrove(val pc: String = "", val nome: String = "", val workspace: List<String> = emptyList())

/** Una chat come sta nell'archivio del computer. */
@Serializable
data class ChatSalvata(
    val workspace: String = "",
    val sessione: String = "",
    val cwd: String = "",
    val titolo: String = "",
    val ibernata: Boolean = false,
    /** Il progetto di questa chat e' in mano a un altro PC: il suo nome. */
    val altrove: String? = null
)
