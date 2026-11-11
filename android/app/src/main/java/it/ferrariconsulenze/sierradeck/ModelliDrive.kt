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
data class Ciao(val programma: String = "", val versione: String = "", val impronta: String = "")

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

/** Il nome da mostrare di una chat: quello distinto del PC 0.70 («Nome #2»), poi il titolo, poi la cartella. */
fun nomeChat(c: Chat): String = c.nome?.takeIf { it.isNotBlank() } ?: c.titolo.ifBlank { c.cwd }
