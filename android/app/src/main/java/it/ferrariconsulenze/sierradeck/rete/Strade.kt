package it.ferrariconsulenze.sierradeck.rete

import it.ferrariconsulenze.sierradeck.dati.Collegamento
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

/** Per quale strada si raggiunge un PC. */
enum class TipoStrada(val parola: String) { CASA("in WiFi"), TAILSCALE("via VPN"), PONTE("da un altro PC") }

/** Un indirizzo del PC, con quello che si sa di lui. */
@Serializable
data class IndirizzoNoto(
    val indirizzo: String,
    /** `casa` | `tailscale` (contratto: `POST /api/accoppia`, `/api/stato` → `pc.indirizzi`). */
    val tipo: String,
    val ultimaRiuscita: Long = 0,
    /** La rete del telefono da cui ha funzionato l'ultima volta (es. il gateway del wifi). */
    val rete: String? = null
)

/**
 * Un PC accoppiato. Il PC **è la sua impronta**: due indirizzi con la stessa
 * impronta sono lo stesso PC. `id` è l'indirizzo dell'accoppiamento, la chiave
 * con cui le preferenze di sempre tengono la chiave e la copia dello stato:
 * non cambia, così l'aggiornamento non chiede un nuovo accoppiamento.
 */
data class PcNoto(
    val id: String,
    val nome: String,
    val chiave: String,
    val impronta: String = "",
    val indirizzi: List<IndirizzoNoto> = emptyList(),
    /** Ha dato almeno una volta una prova buona: da lì in poi senza prova non riceve la chiave. */
    val saProvare: Boolean = false,
    val host: String = "",
    val tenuta: Boolean = true,
    val ultimoUso: Long = 0,
    val versione: String = ""
)

/** I PC accoppiati, letti una volta e tenuti in memoria (niente preferenze lette dalle schermate). */
interface Rubrica {
    val elenco: StateFlow<List<PcNoto>>
    /** L'id del PC scelto, null se nessuno (ingresso). */
    val corrente: StateFlow<String?>
    /** Letta la prima volta dal disco. */
    val pronta: StateFlow<Boolean>
    fun pc(id: String): PcNoto? = elenco.value.firstOrNull { it.id == id }
    fun scegli(id: String?)
    fun impara(id: String, impronta: String?, indirizzi: List<IndirizzoNoto>, versione: String? = null)
    fun riuscita(id: String, indirizzo: String, rete: String?)
    fun saProvare(id: String)
    /** Dopo un accoppiamento: se l'impronta è di un PC già noto, si aggiorna quello. Restituisce l'id. */
    fun accoppiato(indirizzo: String, chiave: String, nome: String, impronta: String, indirizzi: List<IndirizzoNoto>): String
    fun dimentica(id: String)
}

/**
 * Le regole del Centralino, pure: quali strade provare, con quali tempi, se un
 * PC che risponde è il nostro, quanto aspettare dopo un fallimento.
 */
object Strade {
    const val CASA_MS = 1_500L
    const val TAILSCALE_MS = 4_000L
    const val PONTE_DOPO_MS = 2_000L
    const val PONTE_MS = 6_000L
    /** Tetto di una gara intera. */
    const val GARA_MS = 6_000L
    /** Dopo un fallimento: 1, 2, 4, 8, 15 secondi, mai oltre. */
    val ATTESE_MS = listOf(1_000L, 2_000L, 4_000L, 8_000L, 15_000L)

    fun attesaDopo(fallimenti: Int): Long = if (fallimenti <= 0) 0 else ATTESE_MS[minOf(fallimenti, ATTESE_MS.size) - 1]

    fun tipoDi(indirizzo: String): String? = when (Linea.stradaDiIndirizzo(indirizzo)) {
        "lan" -> "casa"
        "tailscale" -> "tailscale"
        else -> null
    }

    data class Candidato(val indirizzo: String, val tipo: TipoStrada)

    /**
     * Gli indirizzi da provare: quelli noti del PC, quelli visti in rete con la sua
     * impronta, l'indirizzo dell'accoppiamento. Solo privati o Tailscale, senza
     * doppioni; prima quello che ha funzionato da ultimo.
     */
    fun candidati(pc: PcNoto, scoperti: List<String>): List<Candidato> {
        val tutti = (pc.indirizzi.sortedByDescending { it.ultimaRiuscita }.map { it.indirizzo } + scoperti + listOf(pc.id))
            .map { Collegamento.pulisci(it) }
            .filter { it.isNotBlank() && Indirizzi.accettabile(it) }
            .distinct()
        return tutti.mapNotNull { a ->
            when (tipoDi(a)) {
                "casa" -> Candidato(a, TipoStrada.CASA)
                "tailscale" -> Candidato(a, TipoStrada.TAILSCALE)
                else -> null
            }
        }
    }

    /** Com'è il telefono adesso, per decidere quali strade hanno senso. */
    data class RetiAdesso(val casa: Boolean, val vpn: Boolean, val etichettaCasa: String? = null)

    /** Perché una strada si salta senza provarla (null = si prova). */
    fun saltata(c: Candidato, reti: RetiAdesso): String? = when (c.tipo) {
        TipoStrada.CASA -> if (reti.casa) null else "niente wifi di casa"
        TipoStrada.TAILSCALE -> if (reti.vpn) null else "nessuna VPN attiva"
        TipoStrada.PONTE -> null
    }

    fun tempoDi(t: TipoStrada): Long = when (t) {
        TipoStrada.CASA -> CASA_MS
        TipoStrada.TAILSCALE -> TAILSCALE_MS
        TipoStrada.PONTE -> PONTE_MS
    }

    /** Cosa ha risposto `/api/ciao` a una sfida. */
    @Serializable
    data class RispostaCiao(
        val programma: String = "",
        val versione: String = "",
        val impronta: String = "",
        val prova: String? = null,
        val saProvare: Boolean = false
    )

    sealed interface Verifica {
        /** È il nostro PC: si può mandare la chiave. `impronta` da imparare se non la si sapeva. */
        data class Buona(val impronta: String?, val provato: Boolean) : Verifica
        /** Risponde un altro computer. */
        data class Estraneo(val motivo: String) : Verifica
        /** È lui ma non conosce questo telefono (tolto dall'elenco): la chiave non parte. */
        data object NonMiConosce : Verifica
    }

    /**
     * Il PC che ha risposto è il nostro? (contratto, sezione 1)
     *
     * - impronte diverse: è un altro computer;
     * - un PC che sa provare deve dare la prova giusta, altrimenti non conosce
     *   questo telefono e la chiave non parte;
     * - un PC che una volta ha provato e adesso non prova: si diffida;
     * - un PC vecchio (niente prova): la logica di prima, cioè impronta uguale, o
     *   impronta non ancora imparata e indirizzo dell'accoppiamento.
     */
    fun verifica(pc: PcNoto, candidato: String, r: RispostaCiao, sfida: String): Verifica {
        if (pc.impronta.isNotBlank() && r.impronta.isNotBlank() && r.impronta != pc.impronta) return Verifica.Estraneo("risponde un altro computer")
        val segno = ProvaTelefono.segno(pc.chiave)
        if (r.saProvare) {
            return if (ProvaTelefono.provaBuona(segno, sfida, r.prova)) Verifica.Buona(r.impronta.ifBlank { null }, provato = true)
            else Verifica.NonMiConosce
        }
        if (pc.saProvare) return Verifica.Estraneo("non sa più dare la prova")
        if (pc.impronta.isNotBlank() && r.impronta == pc.impronta) return Verifica.Buona(null, provato = false)
        val stessoIndirizzo = Collegamento.pulisci(candidato) == Collegamento.pulisci(pc.id)
        return if (pc.impronta.isBlank() && stessoIndirizzo) Verifica.Buona(r.impronta.ifBlank { null }, provato = false)
        else Verifica.Estraneo("impronta non ancora nota")
    }

    // ─── le rotte ───

    /** Le rotte che possono metterci più dei 15 secondi di sempre (comprendono quelle lente del PC: ContrattoRotteTest). */
    val LENTE = setOf(
        "/api/negozio", "/api/negozio/installa", "/api/negozio/aggiorna",
        "/api/negozio/commuta", "/api/negozio/cerca", "/api/negozio/salute-mcp",
        "/api/drive/pannello", "/api/drive/azione",
        "/api/drive/spazio/stato", "/api/drive/spazio/quota", "/api/drive/spazio/in-sospeso", "/api/drive/spazio/riprendi",
        "/api/sessioni", "/api/sessioni/riprendi", "/api/sottofondo/avvia",
        "/api/chat/gestione/spazio", "/api/chat/gestione/azione", "/api/chat/gestione/ripristina", "/api/chat/gestione/svuota",
        "/api/workspace/crea", "/api/workspace/progetto", "/api/file/progetti", "/api/file/elenco", "/api/file/cartella"
    )
    const val LENTE_MS = 200_000L

    /** La rotta senza la parte dopo `?`: è quella che sta nelle tabelle. */
    fun via(rotta: String): String = rotta.substringBefore('?')

    /**
     * L'attesa di una richiesta che il PC tiene apposta (11/11): `/api/eventi`
     * con `attesa=N` risponde dopo al più N secondi (massimo 50), e con i 15 s
     * di sempre la si troncava. N + 15 s di margine; null = l'attesa di sempre.
     */
    fun attesaDi(rotta: String): Long? {
        if (via(rotta) != "/api/eventi") return null
        val n = rotta.substringAfter("attesa=", "").substringBefore('&').toLongOrNull() ?: return null
        return n.coerceIn(0, 50) * 1000 + NORMALE_MS
    }
    const val NORMALE_MS = 15_000L

    /** Le rotte che leggono e basta: se cadono si riprovano sull'altra strada senza pensarci. */
    val LETTURE = setOf(
        "/api/stato", "/api/storia", "/api/dentro", "/api/domande", "/api/panoramica", "/api/autopilota",
        "/api/autopilota/avanzamento", "/api/autopilota/specialista", "/api/autopiloti/altri", "/api/stile", "/api/app",
        "/api/ciao", "/api/indirizzi", "/api/consumi", "/api/sessioni", "/api/workspace", "/api/quaderno",
        "/api/quaderno/scheda", "/api/file/progetti", "/api/file/elenco", "/api/file/leggi", "/api/file/cartella",
        "/api/consegne", "/api/consegne/pezzo", "/api/errori", "/api/salute", "/api/modelli", "/api/sfoglia",
        "/api/cartelle", "/api/pc", "/api/eventi", "/api/aggiornamento", "/api/sottofondo/stato", "/api/allegati/stato",
        "/api/chat/gestione/spazio", "/api/quaderno-personale", "/api/note-aggiornamento", "/api/account"
    )

    /** Il tetto di una risposta, per tipo di rotta: lo stato e la storia 2 MB, i pezzi di file 256 KB, il resto 4 MB. */
    fun tettoDi(rotta: String): Long = when (rotta) {
        "/api/stato", "/api/storia", "/api/eventi" -> 2L * 1024 * 1024
        "/api/file/leggi", "/api/consegne/pezzo" -> 256L * 1024
        else -> 4L * 1024 * 1024
    }

    fun pesoInParole(byte: Long): String = when {
        byte >= 1024 * 1024 -> "${byte / (1024 * 1024)} MB"
        byte >= 1024 -> "${byte / 1024} KB"
        else -> "$byte byte"
    }

    /** Un 404 è «la rotta non c'è» solo se il PC dice «non trovato» (o niente): altrimenti è un no con motivo. */
    fun eMancaSulPc(codice: Int, corpo: String): Boolean =
        codice == 404 && (corpo.isBlank() || corpo.contains("non trovato", ignoreCase = true) || corpo.contains("not found", ignoreCase = true))

    /** Il motivo scritto dal PC (`errore`/`messaggio` nel JSON), o il testo, o il codice. */
    fun motivoDa(codice: Int, corpo: String): String {
        val m = Regex("\"(?:messaggio|errore|motivo)\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(corpo)?.groupValues?.get(1)
        return when {
            codice == 401 -> "Il computer non riconosce più questo telefono."
            !m.isNullOrBlank() -> m.replace("\\\"", "\"").replace("\\n", " ")
            corpo.isNotBlank() && corpo.length < 160 && !corpo.trimStart().startsWith("{") -> corpo.trim()
            else -> "Il computer ha detto di no."
        }
    }
}
