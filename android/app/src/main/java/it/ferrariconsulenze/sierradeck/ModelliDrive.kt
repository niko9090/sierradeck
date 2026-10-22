package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

// ─── il recupero dei workspace eliminati (PC 0.81.0) ───
@Serializable
data class VoceRecuperoWs(val nome: String, val eliminatoIl: String, val scadeIl: String = "", val chat: Int = 0, val da: String? = null)

@Serializable
data class RecuperoWs(val voci: List<VoceRecuperoWs> = emptyList(), val senzaRecupero: Boolean = false)

@Serializable
data class Ripristinato(val fatto: Boolean = false, val nome: String? = null)

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
    /** Riga per riga: continua la precedente, spezzata solo dal terminale del PC (PC 0.52.6). */
    val continua: List<Boolean> = emptyList(),
    /** Le colonne del terminale del PC (PC 0.52.6; 0 = PC più vecchio). */
    val colonne: Int = 0,
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
    val corrente: Int = 0,
    /** Scelta multipla (PC 0.52.5): ogni tocco spunta, «Submit» manda. */
    val multipla: Boolean = false
)

@Serializable
data class Opzione(
    val numero: Int = 0,
    val testo: String = "",
    /** Quella su cui il cursore e' fermo: e' anche quella che prenderebbe un invio secco. */
    val scelta: Boolean = false,
    /** La spiegazione sotto l'opzione, nelle domande di Claude Code (PC 0.52.5). */
    val descrizione: String = "",
    /** «Type something.»: si risponde scrivendo nel campo, non toccando. */
    val libera: Boolean = false,
    /** Scelta multipla: la casella è spuntata (null = non è una casella). */
    val spuntata: Boolean? = null,
    /** Scelta multipla: la riga «Submit», che manda le spunte. */
    val invio: Boolean = false,
    /** PC 0.84.1: l'opzione fissa di Claude Code detta in italiano; al tocco si manda `testo`. */
    val etichetta: String? = null
)

/** Quello che il computer ha in dotazione. */
@Serializable
data class DatiNegozio(
    /** Dalla 0.53.0: gli installati e i più installati, non i 3500 del catalogo. */
    val plugin: List<PluginVoce> = emptyList(),
    val skill: List<SkillVoce> = emptyList(),
    val agenti: List<AgenteVoce> = emptyList(),
    val mcp: List<McpVoce> = emptyList(),
    /** Il computer non ha potuto rispondere: diverso da «non c'è niente». */
    val errore: String? = null,
    /** La spiegazione di un vuoto legittimo, tipo «nessuna chat aperta». */
    val nota: String? = null,
    /** Quanti plugin ha il catalogo intero (0.53.0): gli altri si trovano cercando. */
    val totalePlugin: Int? = null,
    /** La cartella da cui il computer legge skill e MCP di progetto (0.53.0). */
    val cartella: String? = null
)

/**
 * Lo stato di una voce come lo scrive il computer (0.53.0, `shared/negozio.ts`):
 * la parola breve, il tono del colore, e cosa vuol dire per esteso. Le stesse
 * parole del pannello sul PC e della pagina.
 */
@Serializable
data class StatoVoce(val etichetta: String = "", val tono: String = "neutro", val spiegazione: String = "",
    /** PC 0.70: lo stato in una parola con il colore. */
    val parola: String? = null, val colore: String? = null)

@Serializable
data class PluginVoce(
    val id: String = "",
    val nome: String = "",
    val descrizione: String = "",
    val marketplace: String = "",
    val installato: Boolean = false,
    val abilitato: Boolean = false,
    val installazioni: Int? = null,
    val versione: String? = null,
    val versioneNuova: String? = null,
    val aggiornamento: Boolean = false,
    val stato: StatoVoce? = null
)

@Serializable
data class SkillVoce(
    val nome: String = "",
    val descrizione: String = "",
    val origine: String = "",
    val abilitata: Boolean = true,
    val plugin: String? = null,
    val percorso: String = "",
    val stato: StatoVoce? = null
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
    val abilitato: Boolean = true,
    /** locale, utente, progetto (.mcp.json), altro (plugin o claude.ai). Vuoto da un PC di prima. */
    val ambito: String = "",
    val tipo: String = "",
    /** I nomi delle variabili e delle intestazioni: i valori restano sul computer. */
    val variabili: List<String> = emptyList(),
    val intestazioni: List<String> = emptyList(),
    /** attivo, spento, da-approvare, rifiutato. Vuoto da un PC di prima. */
    val config: String = "",
    val salute: String? = null,
    val motivo: String? = null,
    val stato: StatoVoce? = null
)

/** Il comando che un marketplace vuole eseguire per installare: si mostra, e si conferma. */
@Serializable
data class ConfermaComando(val sha256: String = "", val comando: String = "")

/** Com’è andata un’azione del negozio: il motivo se no, cosa cambia se sì. */
@Serializable
data class EsitoNegozio(
    val ok: Boolean = false,
    val messaggio: String? = null,
    val fatto: String? = null,
    val conferma: ConfermaComando? = null
)

/** La ricerca nel catalogo intero (0.53.0). */
@Serializable
data class RicercaNegozio(val plugin: List<PluginVoce> = emptyList(), val totale: Int = 0, val errore: String? = null)

/** Gli MCP con lo stato del collegamento, provato dal computer (0.53.0). */
@Serializable
data class SaluteMcp(val mcp: List<McpVoce> = emptyList(), val errore: String? = null)

/** Chi è entrato sul computer. Sola lettura. */
@Serializable
data class Account(
    val entrato: Boolean = false,
    val email: String? = null,
    /** PC 0.70: la catena Account → Drive → Cassaforte → Salvataggio, con le parole decise dal PC. */
    val catena: CatenaAccount? = null
)

@Serializable
data class TesseraAccount(val id: String = "", val titolo: String = "", val vista: StatoVistaDrive? = null, val sotto: String? = null)

@Serializable
data class PassoAccount(val id: String = "", val testo: String = "")

@Serializable
data class CatenaAccount(val tessere: List<TesseraAccount> = emptyList(), val prossimo: PassoAccount? = null)

/** La riga «Prossimo passo, sul computer: …» della catena; null se è tutto a posto o se il PC è di prima. */
fun passoAccount(a: Account?): String? = a?.catena?.prossimo?.testo?.takeIf { it.isNotBlank() }?.let { "Prossimo passo, sul computer: $it" }

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

/** Il nome da mostrare di una chat: quello distinto del PC 0.70 («Nome #2»), poi il titolo, poi la cartella. */
fun nomeChat(c: Chat): String = c.nome?.takeIf { it.isNotBlank() } ?: c.titolo.ifBlank { c.cwd }
