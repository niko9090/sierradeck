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
    val progetti: List<ProgettoBreve> = emptyList()
)

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
    val pin: String? = null
)

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
    val origine: String = "lavoro"
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
    val viaPc: String? = null
)

/** Un nodo dell'albero delle chat di un autopilota (T7, 0.36.0). */
@Serializable
data class NodoAlbero(
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
    val criteri: Int = 0
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
    val chat: List<ChatSalvata> = emptyList()
)

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

// ─── /api/dentro ───  (le ultime righe del terminale di UNA chat)
@Serializable
data class Dentro(
    val chat: String = "",
    val titolo: String = "",
    /** Righe ripulite (senza codici ANSI). */
    val righe: List<String> = emptyList(),
    /** Righe grezze con i codici ANSI: sono queste che la nativa colora. */
    val grezze: List<String> = emptyList(),
    val scelte: Scelte? = null
)

// ─── /api/consumi ───
@Serializable
data class Consumi(
    val oggi: Quota = Quota(),
    val settimana: Quota = Quota(),
    val totale: Quota = Quota(),
    /** I limiti del piano, letti dal computer (dalla 0.31): finestra di 5 ore e settimana. */
    val limiti: Limiti? = null,
    /** La spesa che Claude Code stima, in dollari. */
    val costo: Costo? = null,
    /** Le chat aperte sul computer con il loro contesto, gia' detto in parole (dalla 0.37). */
    val chatAperte: List<ChatConsumo> = emptyList(),
    /** Cosa farebbe adesso il freno degli autopiloti con questi limiti (dalla 0.37). */
    val freno: FrenoConsumi? = null
)

/**
 * Una finestra del piano. Dalla 0.37 il computer manda anche `stato`
 * («fresca», «vecchia», «azzerata») e `etichetta`, la frase intera — la
 * stessa della console e della pagina: l'app la mostra cosi' com'e'.
 */
@Serializable
data class Finestra(
    val percento: Double = 0.0,
    val resettaIl: Long? = null,
    val stato: String? = null,
    val etichetta: String? = null
)

@Serializable
data class ContestoChat(val percento: Int = 0, val usati: Long = 0, val dimensione: Long = 0)

@Serializable
data class ChatConsumo(
    val sessione: String = "",
    val titolo: String? = null,
    val modello: String? = null,
    val contesto: ContestoChat? = null,
    val contestoEtichetta: String? = null
)

@Serializable
data class FrenoConsumi(val livello: String = "", val titolo: String = "", val spiegazione: String = "", val motivo: String = "")

@Serializable
data class Limiti(val cinqueOre: Finestra? = null, val settimana: Finestra? = null, val letti: Long = 0, val modello: String? = null)

@Serializable
data class Costo(val oggi: Double = 0.0, val settimana: Double = 0.0, val totale: Double = 0.0, val chat: Int = 0)

@Serializable
data class Quota(
    val ingresso: Long = 0,
    val uscita: Long = 0,
    val cache: Long = 0,
    val chat: Int = 0
)

// ─── /api/cartelle ───  (è una lista di percorsi, non di oggetti)
@Serializable
data class Cartelle(val cartelle: List<String> = emptyList())

// ─── /api/autopilota (dettaglio) = tutto l'autopilota + passaggi + misura ───
@Serializable
data class AutopilotaDettaglio(
    val id: String = "",
    val nome: String = "",
    /** L'obiettivo come l'ha capito lui (riscritto dalla preparazione). */
    val obiettivo: String = "",
    /** L'obiettivo come l'hai chiesto tu (assente = coincide con `obiettivo`). */
    val obiettivoTuo: String? = null,
    val stato: String = "",
    val cicli: Int = 0,
    val strategia: String? = null,
    val motivoSospensione: String? = null,
    /** Assente vale «sì». */
    val riprendiAlRiavvio: Boolean? = null,
    val criteri: List<Criterio> = emptyList(),
    val decisioni: List<Decisione> = emptyList(),
    val passaggi: List<Passo> = emptyList(),
    val misura: MisuraPasso = MisuraPasso(),
    /**
     * Il dialogo con lui (0.27.0): le tue battute e le sue risposte, dalla
     * scheda. Assente nei computer con una versione precedente.
     */
    val dialogo: List<ScambioDialogo> = emptyList(),
    /**
     * La chat con lui (0.29.0), composta dal computer: la stessa della sezione
     * sul PC. Vuota nei computer con una versione precedente: allora la
     * schermata mostra solo il dialogo di prima.
     */
    val chat: List<Battuta> = emptyList(),
    /** Ha una domanda aperta: quello che scrivi nella casella è la risposta. */
    val domanda: Boolean = false,
    val domandaId: String? = null,
    /** Sta pensando alla tua ultima battuta. */
    val pensa: Boolean = false,
    val compitiDaFare: List<String> = emptyList(),
    val chats: List<ChatGovernataBreve> = emptyList(),
    /** Il coordinatore e le sue sotto-chat (0.36.0). Assente nei computer piu' vecchi. */
    val albero: NodoAlbero? = null,
    /** Il ramo principale in cui si uniscono i lavori delle chat. */
    val ramoBase: String? = null,
    /** La regola di pubblicazione del progetto: beta, stabile, unica. */
    val pubblicazione: String? = null,
    /** Le sue domande per la linguetta «Domande» (0.38.0), una per volta. */
    val domandeScheda: List<DomandaScheda> = emptyList()
)

/**
 * Una riga della chat con lui: `da` è "tu", "lui" o "nota" (la sua voce di
 * lavoro); `tono` colora la riga (domanda, pronto, decisione, correzione,
 * fine, fermo…); `volte` quante note uguali di fila.
 */
@Serializable
data class Battuta(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val dettaglio: String? = null,
    val tono: String? = null,
    val volte: Int? = null
)

/** Una chat che esegue per l'autopilota: `stato` è lavoro | bloccata | finita. */
@Serializable
data class ChatGovernataBreve(
    val id: String = "",
    val compito: String = "",
    val stato: String = "",
    val cicli: Int = 0
)

/** Una battuta del dialogo: `da` è "tu" o "lui"; `esito` dice cosa ne ha fatto. */
@Serializable
data class ScambioDialogo(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val esito: String? = null
)

@Serializable
data class Criterio(
    val descrizione: String = "",
    val comando: String? = null,
    val soddisfatto: Boolean = false,
    val raggiuntoIl: String? = null,
    /** Com'e' andata l'ultima misura del comando. Assente se non l'ha ancora provato. */
    val ultimaVerifica: UltimaVerifica? = null
)

/**
 * L'esito dell'ultima volta che un criterio e' stato misurato (`Verifica` in
 * `src/shared/autopilota.ts`): zero e' passato, qualunque altro codice e' come
 * e' uscito il comando, e `uscita` e' quello che ha stampato, gia' tagliato.
 */
@Serializable
data class UltimaVerifica(
    val quando: String = "",
    val codice: Int? = null,
    val uscita: String = ""
)

@Serializable
data class Decisione(val quando: String = "", val cosa: String = "")

@Serializable
data class Passo(
    /** fatto | corrente | attesa | fermo | davanti */
    val stato: String = "davanti",
    val nome: String = "",
    val nota: String? = null
)

@Serializable
data class MisuraPasso(
    val percento: Int = 0,
    /** preparazione | criteri */
    val di: String = "",
    val dettaglio: String = "",
    /** preparazione | lavoro | attesa | fermo */
    val tono: String = ""
)

// ─── /api/quaderno ───
@Serializable
data class Schede(val schede: List<SchedaBreve> = emptyList())

@Serializable
data class SchedaBreve(val file: String = "", val titolo: String = "", val quando: String = "")

@Serializable
data class SchedaPiena(
    val file: String = "",
    val titolo: String = "",
    val corpo: String = "",
    val quando: String = ""
)

// ─── /api/preferenze ───
@Serializable
data class PreferenzeInvolucro(val preferenze: Preferenze = Preferenze())

@Serializable
data class Preferenze(
    /** banco | foglio */
    val stile: String = "banco",
    /** Chiarore del fondo, 0..100. */
    val chiarore: Int = 20
)

// ─── /api/aggiornamento (del computer) ───
@Serializable
data class Aggiornamento(
    val fase: String = "",
    val versione: String? = null,
    val percento: Int? = null,
    val errore: String? = null,
    /**
     * Quante chat stanno finendo quello che avevano in mano, in fase «attendo».
     *
     * Fra «Installa» e il computer che si chiude c'e' un'attesa vera: un
     * aggiornamento non uccide piu' le chat dove sono arrivate, aspetta che
     * ognuna chiuda il turno. Senza questo numero, da qui si vedrebbe un tasto
     * premuto e nient'altro - e un'attesa legittima di due minuti e' identica
     * a un tasto rotto.
     */
    val chatOccupate: Int? = null,
    /**
     * Cosa aspetta, quando non sono le chat: il lavoro con il Drive, con il
     * conto dei file. Manca sui computer prima della 0.28.1.
     */
    val attesa: String? = null,
    /**
     * Quello che l'installer sta scrivendo **adesso**, parola per parola.
     *
     * Arriva solo mentre il computer si sta aggiornando, e non lo manda
     * SierraDeck — che in quel momento e' chiuso — ma l'installer stesso, che
     * prende in prestito la porta rimasta libera. Quando c'e', questa e' la
     * verita' e non si deduce piu' niente dal silenzio.
     */
    val testo: String? = null,
    /**
     * L'ultima installazione sul computer non e' riuscita (0.39.2): al riavvio
     * era ancora sulla versione di prima. Manca sui computer piu' vecchi.
     */
    val tentativoFallito: TentativoFallitoPc? = null
)

/** Il perche' e le strade di un'installazione non riuscita, scritti dal computer. */
@Serializable
data class TentativoFallitoPc(
    val versione: String = "",
    val da: String = "",
    val quando: String = "",
    val titolo: String = "",
    val motivo: String = "",
    val strade: List<String> = emptyList(),
    val pagina: String = ""
)

// ─── /api/sessioni ───
@Serializable
data class Sessioni(val sessioni: List<SessioneRipresa> = emptyList())

@Serializable
data class SessioneRipresa(
    val id: String = "",
    val cwd: String = "",
    val titolo: String = "",
    val quando: String = "",
    /**
     * La cartella di questa chat sta su un altro PC: il suo nome. Riprenderla
     * qui non si puo' (il computer risponde 409 e lo spiega); si vede, per
     * sapere dove andarla a cercare.
     */
    val altrove: String? = null,
    /**
     * Quel PC e' acceso adesso (dal suo battito sul Drive, 0.35.0): e' la
     * stessa etichetta del computer, «su X · acceso» o «spento». Assente nei
     * computer piu' vecchi.
     */
    val altroveAcceso: Boolean? = null
)

// ─── risposta generica delle azioni ───
@Serializable
data class Fatto(val fatto: Boolean = false, val autopilota: String? = null)


/**
 * Un pezzo di conversazione, e quanto ce n’è in tutto.
 *
 * `da` è l’indice della prima riga di questo pezzo dentro tutta la
 * cronologia: con quello e `totale` si sa se sopra c’è ancora roba, e quindi
 * se ha senso offrire di risalire.
 */
@Serializable
data class Storia(
    val chat: String = "",
    val totale: Int = 0,
    val da: Int = 0,
    val righe: List<String> = emptyList(),
    val grezze: List<String> = emptyList(),
    /**
     * Le scelte che il terminale sta aspettando, quando ne aspetta.
     *
     * Ha un valore predefinito, come tutto qui dentro, e non per abitudine: un
     * computer con una versione precedente non manda questo campo, e senza il
     * predefinito la lettura della risposta fallirebbe **tutta** — cioe' una
     * schermata vuota al posto della chat.
     */
    val scelte: Scelte? = null
)

/**
 * Un elenco di scelte disegnato dal terminale, reso toccabile.
 *
 * Quando Claude Code chiede «vuoi riprendere questa conversazione?» non aspetta
 * parole: aspetta una freccia e un invio. Su un telefono quei tasti non
 * esistono, e senza questi pulsanti la domanda si poteva solo leggere.
 */
@Serializable
data class Scelte(
    val opzioni: List<Opzione> = emptyList(),
    /** Su quale riga e' fermo il cursore adesso. */
    val corrente: Int = 0
)

@Serializable
data class Opzione(
    val numero: Int = 0,
    val testo: String = "",
    /** Quella su cui il cursore e' fermo: e' anche quella che prenderebbe un invio secco. */
    val scelta: Boolean = false
)

/** Quello che il computer ha in dotazione. */
@Serializable
data class DatiNegozio(
    val plugin: List<PluginVoce> = emptyList(),
    val skill: List<SkillVoce> = emptyList(),
    val agenti: List<AgenteVoce> = emptyList(),
    val mcp: List<McpVoce> = emptyList(),
    /** Il computer non ha potuto rispondere: diverso da «non c'è niente». */
    val errore: String? = null,
    /** La spiegazione di un vuoto legittimo, tipo «nessuna chat aperta». */
    val nota: String? = null
)

@Serializable
data class PluginVoce(
    val id: String = "",
    val nome: String = "",
    val descrizione: String = "",
    val marketplace: String = "",
    val installato: Boolean = false,
    val abilitato: Boolean = false
)

@Serializable
data class SkillVoce(
    val nome: String = "",
    val descrizione: String = "",
    val origine: String = "",
    val abilitata: Boolean = true
)

@Serializable
data class AgenteVoce(
    val nome: String = "",
    val descrizione: String = "",
    val origine: String = ""
)

@Serializable
data class McpVoce(
    val nome: String = "",
    val come: String = "",
    val abilitato: Boolean = true
)

/** Com’è andata un’azione del negozio. */
@Serializable
data class EsitoNegozio(val ok: Boolean = false, val messaggio: String? = null)

/** Chi è entrato sul computer. Sola lettura. */
@Serializable
data class Account(val entrato: Boolean = false, val email: String? = null)

/** Chi risponde dall’altra parte, e con quale versione. */
@Serializable
data class Ciao(val programma: String = "", val versione: String = "")

/** Una cartella dentro cui si può scendere. */
@Serializable
data class VoceCartella(val nome: String = "", val percorso: String = "")

/**
 * Un giro di sfoglio del disco del computer.
 *
 * Senza percorso arrivano i punti di partenza — dischi, cartella dell'utente,
 * progetti già noti — perché su un telefono risalire una gerarchia dalla radice
 * è l'unica cosa peggiore che digitare un percorso di Windows a mano.
 */
@Serializable
data class Sfoglia(
    val percorso: String = "",
    /** La cartella che contiene questa: il tasto «su». Assente in cima. */
    val su: String? = null,
    val voci: List<VoceCartella> = emptyList(),
    val radici: Boolean = false,
    /** Qui dentro c'è già un progetto Claude Code. */
    val progetto: Boolean = false
)

/** L'app da scaricare, come la sa il computer (`/api/app`): versione dell'APK e indirizzo. */
@Serializable
data class AppScaricabile(
    val versione: String = "",
    val url: String = ""
)

// ─── Il Drive: il catalogo e il lavoro in corso, come li racconta il computer ───

@Serializable
data class ContiCatalogo(val uguali: Int = 0, val indietro: Int = 0, val avanti: Int = 0, val soloDrive: Int = 0, val soloQui: Int = 0)

@Serializable
data class FileCatalogo(val totale: Int = 0, val soloDrive: Int = 0, val indietro: Int = 0, val avanti: Int = 0, val soloQui: Int = 0, val uguali: Int = 0)

@Serializable
data class ChatCatalogo(
    val sessione: String = "",
    val percorso: String = "",
    val titolo: String = "Conversazione",
    val quando: String? = null,
    val messaggi: Int? = null,
    val workspace: String? = null,
    val stato: String = "uguale",
    val altroveQui: String? = null,
    /** Solo nella vista per workspace: il progetto (cartella) della chat. */
    val progetto: String? = null,
    val chiaveProgetto: String? = null
)

@Serializable
data class ProgettoCatalogo(
    val chiave: String = "",
    val nome: String = "",
    val cartellaOrigine: String = "",
    val id: String? = null,
    val cartellaQui: String? = null,
    val quiEsiste: Boolean = false,
    val cartellaSulDrive: Boolean = false,
    val origine: String = "altrove",
    val chat: List<ChatCatalogo> = emptyList(),
    val file: FileCatalogo = FileCatalogo(),
    val conti: ContiCatalogo = ContiCatalogo(),
    val stato: String = "allineato",
    val ultimoTocco: String? = null
)

@Serializable
data class WorkspaceCatalogo(
    val nome: String = "",
    val quiEsiste: Boolean = false,
    val chat: List<ChatCatalogo> = emptyList(),
    val progetti: List<String> = emptyList(),
    val daPortare: Int = 0,
    val quiUguali: Int = 0
)

@Serializable
data class TotaliCatalogo(val progetti: Int = 0, val chat: Int = 0, val daPortare: Int = 0, val daAggiornare: Int = 0, val soloQui: Int = 0, val uguali: Int = 0)

@Serializable
data class Catalogo(
    val progetti: List<ProgettoCatalogo> = emptyList(),
    val workspace: List<WorkspaceCatalogo> = emptyList(),
    val totali: TotaliCatalogo = TotaliCatalogo(),
    val letto: String = ""
)

/** La risposta di `/api/drive/catalogo`: `disponibile = false` e' un computer vecchio. */
@Serializable
data class RispostaCatalogo(
    val ok: Boolean = false,
    val disponibile: Boolean = true,
    val catalogo: Catalogo? = null,
    val messaggio: String? = null,
    val cassaforteDiversa: Boolean? = null
)

@Serializable
data class LavoroInCorso(
    val tipo: String = "",
    val avviato: String = "",
    val fase: String = "",
    val fatto: Int? = null,
    val totale: Int? = null,
    val unita: String? = null,
    val dettaglio: String? = null,
    val verso: String? = null,
    val caricati: Int? = null,
    val scaricati: Int? = null,
    val saltati: Int? = null,
    val annullamento: Boolean = false
)

@Serializable
data class EsitoLavoro(
    val tipo: String = "",
    val esito: String = "ok",
    val messaggio: String = "",
    val quando: String = "",
    val riavvioConsigliato: Boolean? = null
)

@Serializable
data class StatoLavoro(val inCorso: LavoroInCorso? = null, val ultimo: EsitoLavoro? = null)

/** L'esito di «Porta qui»: `ok` e, se e' andata, i conti della fusione. */
@Serializable
data class EsitoPorta(val ok: Boolean = false, val messaggio: String? = null, val errore: String? = null)

/** A che fase sta la lettura del catalogo sul computer: il telefono la chiede mentre aspetta. */
@Serializable
data class ProgressoCatalogo(val fase: String = "", val fatto: Int? = null, val totale: Int? = null, val avviato: String = "")

@Serializable
data class StatoCatalogo(val inCorso: ProgressoCatalogo? = null)
