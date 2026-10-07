package it.ferrariconsulenze.sierradeck

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Il cambio di computer passo per passo (app 2.52.3), per la schermata intera.
 *
 * Nicholas (07/10): «L'animazione del cambio pc vorrei che fosse a tutto
 * schermo dettagliata così da capire bene cosa sta succedendo e dove ci sono
 * errori». Qui, senza schermo, i sette passi: stacco dal precedente, gli
 * indirizzi del computer scelto, rete di casa, Tailscale, ponte o Internet,
 * la verifica della chiave, collegato. Le strade vengono da
 * `Tentativi.passi` (gli eventi osservati), arricchite con indirizzo, tempo,
 * motivo per esteso e cosa fare; il resto dai fatti del tentativo.
 */
data class DettaglioStrada(val indirizzo: String? = null, val inizio: Long? = null, val fine: Long? = null, val motivo: String? = null)

data class PassoViaggio(
    val id: String,
    val titolo: String,
    val icona: String,
    /** `attesa`, `provo`, `ok`, `fallita`, `salta`. */
    val stato: String,
    val indirizzo: String? = null,
    val durataMs: Long? = null,
    val il: Long? = null,
    val motivo: String? = null,
    val cosaFare: String? = null
)

data class Viaggio(
    val nomePc: String,
    /** Il nome del computer di prima, se c'era. */
    val precedente: String?,
    val inizio: Long,
    val indirizzi: List<String>,
    val eventi: List<EventoTentativo>,
    val dettagli: Map<String, DettaglioStrada> = emptyMap(),
    /** La verifica della chiave: un `DettaglioStrada` con `motivo` se è andata male. */
    val chiave: DettaglioStrada? = null,
    val chiaveOk: Boolean? = null
)

object Viaggi {
    private val STRADE = listOf("lan" to "Rete di casa", "tailscale" to "Tailscale", "webrtc" to "Ponte o Internet (WebRTC)")
    private val ICONE = mapOf("stacco" to "⏏", "indirizzi" to "📇", "lan" to "🏠", "tailscale" to "🔐", "webrtc" to "🌐", "chiave" to "🔑", "collegato" to "✅")

    fun passi(v: Viaggio, adesso: Long): List<PassoViaggio> {
        val vista = Tentativi.passi(v.nomePc, v.eventi)
        val fuori = mutableListOf<PassoViaggio>()
        fuori += PassoViaggio(
            "stacco", "Stacco dal computer di prima", ICONE.getValue("stacco"), "ok", il = v.inizio,
            motivo = v.precedente?.let { "collegamento con $it chiuso: da qui in poi parlo solo con ${v.nomePc}" } ?: "nessun collegamento da chiudere"
        )
        fuori += if (v.indirizzi.isEmpty()) {
            PassoViaggio("indirizzi", "Indirizzi di ${v.nomePc}", ICONE.getValue("indirizzi"), "fallita", il = v.inizio,
                motivo = "nessun indirizzo salvato per questo computer", cosaFare = "Aggiungilo di nuovo dal selettore in alto, «Aggiungi un computer», con il codice QR che mostra il computer.")
        } else {
            PassoViaggio("indirizzi", "Indirizzi di ${v.nomePc}", ICONE.getValue("indirizzi"), "ok", indirizzo = v.indirizzi.joinToString(", ") { Postazioni.hostDi(it) }, il = v.inizio,
                motivo = "provo solo questo computer: nessun ripiego su un altro")
        }
        for ((s, titolo) in STRADE) {
            val p = vista.passi.first { it.strada == s }
            val d = v.dettagli[s]
            val stato = when (p.stato) { "inutile" -> "salta"; else -> p.stato }
            val durata = when {
                d?.inizio != null && d.fine != null -> d.fine - d.inizio
                d?.inizio != null && p.stato == "provo" -> adesso - d.inizio
                else -> p.ms
            }
            val motivo = d?.motivo ?: p.motivo
            fuori += PassoViaggio(
                s, titolo, ICONE.getValue(s), stato, indirizzo = d?.indirizzo?.let { Postazioni.hostDi(it) }, durataMs = durata, il = d?.inizio,
                motivo = motivo, cosaFare = if (stato == "fallita" || (stato == "salta" && p.stato != "inutile")) cosaFare(motivo ?: "", s) else null
            )
        }
        val strada = vista.passi.firstOrNull { it.stato == "ok" }
        val c = v.chiave
        fuori += when {
            v.chiaveOk == true -> PassoViaggio("chiave", "Verifica della chiave di casa", ICONE.getValue("chiave"), "ok", durataMs = c?.let { (it.fine ?: adesso) - (it.inizio ?: adesso) }, il = c?.inizio, motivo = "il computer riconosce questo telefono")
            v.chiaveOk == false -> PassoViaggio("chiave", "Verifica della chiave di casa", ICONE.getValue("chiave"), "fallita", durataMs = c?.let { (it.fine ?: adesso) - (it.inizio ?: adesso) }, il = c?.inizio, motivo = c?.motivo ?: "la chiave non è stata accettata", cosaFare = cosaFare(c?.motivo ?: "chiave", "chiave"))
            strada != null && c?.inizio != null -> PassoViaggio("chiave", "Verifica della chiave di casa", ICONE.getValue("chiave"), "provo", durataMs = adesso - c.inizio, il = c.inizio)
            vista.fase == "fallito" -> PassoViaggio("chiave", "Verifica della chiave di casa", ICONE.getValue("chiave"), "salta", motivo = "nessuna strada ha risposto: non c'è a chi chiederla")
            else -> PassoViaggio("chiave", "Verifica della chiave di casa", ICONE.getValue("chiave"), "attesa")
        }
        fuori += when {
            v.chiaveOk == true -> PassoViaggio("collegato", "Collegato a ${v.nomePc}", ICONE.getValue("collegato"), "ok", durataMs = (c?.fine ?: adesso) - v.inizio,
                motivo = strada?.let { "via ${Tentativi.nome(it.strada)}" + (it.ms?.let { ms -> ", $ms ms" } ?: "") })
            v.chiaveOk == false || vista.fase == "fallito" -> PassoViaggio("collegato", "Collegato a ${v.nomePc}", ICONE.getValue("collegato"), "fallita", durataMs = adesso - v.inizio,
                motivo = "non collegato: resto su ${v.nomePc}, non torno da solo su un altro computer", cosaFare = "Correggi il passo segnato con ✗ e premi «Riprova», oppure «Torna al PC di prima».")
            else -> PassoViaggio("collegato", "Collegato a ${v.nomePc}", ICONE.getValue("collegato"), "attesa")
        }
        return fuori
    }

    /** `provo`, `collegato`, `fallito`: lo stato di tutta la schermata. */
    fun fase(passi: List<PassoViaggio>): String = when {
        passi.any { it.id == "collegato" && it.stato == "ok" } -> "collegato"
        passi.any { it.id == "collegato" && it.stato == "fallita" } -> "fallito"
        else -> "provo"
    }

    /** Il motivo di un passo fallito, tradotto in cosa fare. */
    fun cosaFare(motivo: String, strada: String): String {
        val m = motivo.lowercase(Locale.ROOT)
        return when {
            strada == "chiave" || "401" in m || "chiave" in m ->
                "Il computer risponde ma non riconosce più questo telefono (il telefono è stato tolto dal computer, o il computer è stato reinstallato). Rifai l'accoppiamento: sul computer apri il codice QR del telefono e inquadralo da «Aggiungi un computer»."
            "nessun indirizzo della rete di casa" in m ->
                "Questo computer è salvato solo con un indirizzo Tailscale: va bene anche a casa, se Tailscale è acceso. Per la rete di casa aggiungi il computer anche dal suo codice QR mentre sei sul suo wifi."
            "nessun indirizzo tailscale" in m ->
                "Fuori casa serve Tailscale: installalo sul computer e sul telefono con lo stesso account, poi aggiungi il computer con il suo indirizzo 100.x dal codice QR."
            "ponte" in m || "altri computer" in m ->
                "Dal telefono il collegamento via Internet passa dal computer accoppiato: apri questo PC dalla scheda Computer, «Altri computer»."
            "non ha risposto" in m || "timeout" in m || "timed out" in m ->
                if (strada == "tailscale") "Controlla che Tailscale sia acceso sul telefono e sul computer, con lo stesso account, e che il computer sia acceso con SierraDeck aperto."
                else "Controlla che telefono e computer siano sullo stesso wifi, che il computer sia acceso (non in sospensione) con SierraDeck aperto, e che il firewall di Windows lasci passare SierraDeck."
            "refused" in m || "failed to connect" in m || "rifiutat" in m ->
                "L'indirizzo esiste ma nessuno risponde sulla porta: SierraDeck non è aperto su quel computer, oppure il collegamento del telefono è spento nelle sue Impostazioni."
            "unable to resolve" in m || "no address" in m || "unknownhost" in m ->
                "Il nome del computer non si trova sulla rete: usa il suo indirizzo numerico (lo mostra il codice QR sul computer)."
            else -> "Riprova; se non cambia, apri l'indirizzo con il browser del telefono: se non si apre neanche lì, il problema è la rete e non l'app."
        }
    }

    private fun ora(il: Long): String = SimpleDateFormat("HH:mm:ss", Locale.ITALIAN).format(Date(il))

    fun segno(stato: String): String = when (stato) { "ok" -> "✓"; "fallita" -> "✗"; "provo" -> "…"; "salta" -> "–"; else -> "○" }
    fun parolaStato(stato: String): String = when (stato) { "ok" -> "fatto"; "fallita" -> "non riuscito"; "provo" -> "in corso"; "salta" -> "saltato"; else -> "in attesa" }

    /** «Copia i dettagli»: tutti i passi con orari, indirizzi, tempi e motivi. */
    fun testo(v: Viaggio, versionePc: String?, ultimoSegno: String?, adesso: Long): String {
        val p = passi(v, adesso)
        val righe = mutableListOf(
            "SierraDeck · collegamento a ${v.nomePc}" + (versionePc?.let { " (SierraDeck $it)" } ?: ""),
            "Iniziato alle ${ora(v.inizio)} · ${(adesso - v.inizio) / 1000} s · esito: ${when (fase(p)) { "collegato" -> "collegato"; "fallito" -> "non collegato"; else -> "in corso" }}",
        )
        if (ultimoSegno != null) righe += "Ultima risposta di ${v.nomePc}: $ultimoSegno"
        for (x in p) {
            val parti = mutableListOf("${x.il?.let { "[${ora(it)}] " } ?: ""}${segno(x.stato)} ${x.titolo}: ${parolaStato(x.stato)}")
            x.indirizzo?.let { parti += "indirizzo $it" }
            x.durataMs?.let { parti += "$it ms" }
            x.motivo?.let { parti += it }
            righe += parti.joinToString(" · ")
            x.cosaFare?.let { righe += "    Cosa fare: $it" }
        }
        return righe.joinToString("\n")
    }
}
