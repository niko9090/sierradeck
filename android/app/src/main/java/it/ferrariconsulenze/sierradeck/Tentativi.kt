package it.ferrariconsulenze.sierradeck

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * «Mi collego a NOME-PC…» (PC 0.52.1, app 2.52.1).
 *
 * Nicholas (07/10): «Ho cambiato pc e non si vede nessuna animazione e lo
 * stato della connessione». Al cambio di computer dal selettore in alto si
 * vedono i tentativi in ordine (rete di casa, Tailscale, WebRTC / ponte,
 * Drive), poi la strada buona con il ritardo; se nessuna risponde, il motivo,
 * l'ultimo segno e «Riprova». I passi si ricavano **solo** dagli eventi
 * osservati (`passi`), la stessa funzione di `src/shared/collegamento.ts`.
 */
sealed class EventoTentativo {
    data class Provo(val strada: String, val il: Long) : EventoTentativo()
    data class Fallita(val strada: String, val il: Long, val motivo: String) : EventoTentativo()
    data class Salta(val strada: String, val motivo: String) : EventoTentativo()
    data class Riuscita(val strada: String, val il: Long, val ritardoMs: Long) : EventoTentativo()
    data class Fallito(val il: Long, val motivo: String) : EventoTentativo()
}

data class PassoCollegamento(val strada: String, val nome: String, val icona: String, val stato: String, val motivo: String? = null, val ms: Long? = null)

data class VistaCollegamento(
    val fase: String,
    val titolo: String,
    val sotto: String,
    val passi: List<PassoCollegamento>,
    val strada: String? = null,
    val ritardoMs: Long? = null,
    val motivo: String? = null
)

object Tentativi {
    val STRADE = listOf("lan", "tailscale", "webrtc", "drive")

    fun nome(s: String): String = when (s) { "lan" -> "rete di casa"; "tailscale" -> "Tailscale"; "webrtc" -> "WebRTC / ponte"; "drive" -> "Drive (lento)"; else -> s }
    private fun icona(s: String): String = when (s) { "lan" -> "🏠"; "tailscale" -> "🔐"; "webrtc" -> "🌐"; "drive" -> "☁️"; else -> "…" }

    fun passi(nomePc: String, eventi: List<EventoTentativo>): VistaCollegamento {
        val passi = STRADE.map { PassoCollegamento(it, nome(it), icona(it), "attesa") }.toMutableList()
        fun i(s: String) = passi.indexOfFirst { it.strada == s }
        var fase = "provo"
        var strada: String? = null
        var ritardo: Long? = null
        var motivo: String? = null
        for (e in eventi) {
            when (e) {
                is EventoTentativo.Provo -> {
                    for (j in passi.indices) if (passi[j].stato == "provo" && passi[j].strada != e.strada) passi[j] = passi[j].copy(stato = "fallita", motivo = "non ha risposto")
                    val k = i(e.strada); if (k >= 0) passi[k] = passi[k].copy(stato = "provo", motivo = null)
                    fase = "provo"
                }
                is EventoTentativo.Fallita -> { val k = i(e.strada); if (k >= 0) passi[k] = passi[k].copy(stato = "fallita", motivo = e.motivo) }
                is EventoTentativo.Salta -> { val k = i(e.strada); if (k >= 0) passi[k] = passi[k].copy(stato = "salta", motivo = e.motivo) }
                is EventoTentativo.Riuscita -> {
                    val k = i(e.strada)
                    for (j in passi.indices) {
                        val p = passi[j]
                        passi[j] = when {
                            j == k -> p.copy(stato = "ok", ms = e.ritardoMs, motivo = null)
                            j < k && p.stato == "provo" -> p.copy(stato = "fallita", motivo = "non ha risposto")
                            j < k && p.stato == "attesa" -> p.copy(stato = "salta", motivo = "non provata")
                            j > k && p.stato == "attesa" -> p.copy(stato = "inutile", motivo = "non serve")
                            else -> p
                        }
                    }
                    fase = "collegato"; strada = e.strada; ritardo = e.ritardoMs; motivo = null
                }
                is EventoTentativo.Fallito -> {
                    for (j in passi.indices) {
                        val p = passi[j]
                        if (p.stato == "provo") passi[j] = p.copy(stato = "fallita", motivo = "non ha risposto")
                        else if (p.stato == "attesa") passi[j] = p.copy(stato = "salta", motivo = "non disponibile")
                    }
                    fase = "fallito"; motivo = e.motivo
                }
            }
        }
        val ora = passi.firstOrNull { it.stato == "provo" }
        val titolo = when (fase) { "collegato" -> "Collegato a $nomePc"; "fallito" -> "Non riesco a collegarmi a $nomePc"; else -> "Mi collego a $nomePc…" }
        val sotto = when (fase) {
            "collegato" -> "${nome(strada ?: "")} · ${ritardo ?: 0} ms"
            "fallito" -> motivo ?: "nessuna strada ha risposto"
            else -> ora?.let { "provo ${it.nome}" } ?: "cerco la strada"
        }
        return VistaCollegamento(fase, titolo, sotto, passi, strada, ritardo, motivo)
    }

    /**
     * Gli eventi ricavati dalla macchina della linea, per il ponte (dove le
     * singole strade le prova il PC accoppiato): come `eventiDaLinea` del PC.
     */
    fun daLinea(l: StatoLinea, inizio: Long): List<EventoTentativo> {
        val fuori = mutableListOf<EventoTentativo>(EventoTentativo.Provo("lan", inizio))
        val primo = l.storia.firstOrNull { it.tipo == "collegato" || it.tipo == "tornato" }
        val misura = l.misure.firstOrNull { it.ok }
        if (primo == null && l.motivo == "collegando") {
            fuori += EventoTentativo.Fallita("lan", l.cadutaIl ?: inizio, "non risponde")
            fuori += EventoTentativo.Fallita("tailscale", l.cadutaIl ?: inizio, "non risponde")
            fuori += EventoTentativo.Provo("webrtc", l.cadutaIl ?: inizio)
            return fuori
        }
        if (primo != null) {
            fuori += EventoTentativo.Riuscita(primo.strada ?: "lan", primo.il, misura?.ritardoMs ?: 0)
            return fuori
        }
        if (l.fase == "ricollego") fuori += EventoTentativo.Fallito(l.cadutaIl ?: inizio, l.messaggio ?: l.motivo ?: "non risponde")
        return fuori
    }

    /** Il conto alla rovescia a linea caduta, e il colore: ambra i primi due tentativi, poi rosso. */
    fun rovescia(l: StatoLinea, adesso: Long): Pair<String, String>? {
        if (l.fase != "ricollego") return null
        val s = Linea.fraSecondi(l, adesso)
        return (if (s > 0) "riprovo fra $s s" else "riprovo adesso") to (if (l.tentativo <= 2) "ambra" else "rosso")
    }
}

/**
 * La scheda del collegamento in corso, sotto il computer scelto: i tentativi
 * che scorrono, poi la strada buona; se fallisce, il motivo, l'ultimo segno e
 * «Riprova». Mai una schermata vuota.
 */
@Composable
fun SchedaCollegamento(v: VistaCollegamento, ultimoSegno: String?, onRiprova: () -> Unit) {
    val pulsa = rememberInfiniteTransition(label = "tentativo")
    val luce by pulsa.animateFloat(0.35f, 1f, infiniteRepeatable(tween(650), RepeatMode.Reverse), label = "luce")
    val colore = when (v.fase) { "collegato" -> Banco.verde; "fallito" -> Banco.rosso; else -> Banco.accento }
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 14.dp, vertical = 8.dp)) {
        Text(v.titolo, color = colore, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(v.sotto, color = Banco.testoQuieto, fontSize = 12.sp)
        Spacer(Modifier.padding(top = 4.dp))
        for (p in v.passi) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 1.dp)) {
                val segno = when (p.stato) { "ok" -> "✓"; "fallita" -> "✗"; "provo" -> "●"; "salta", "inutile" -> "–"; else -> "○" }
                val c = when (p.stato) { "ok" -> Banco.verde; "fallita" -> Banco.rosso; "provo" -> Banco.accento; else -> Banco.testoQuieto }
                Text(segno, color = c, fontSize = 13.sp, modifier = Modifier.width(18.dp).alpha(if (p.stato == "provo") luce else 1f))
                Text("${p.icona} ${p.nome}", color = if (p.stato == "salta" || p.stato == "inutile") Banco.testoQuieto else Banco.testo, fontSize = 12.sp)
                val dopo = p.ms?.let { " · $it ms" } ?: p.motivo?.let { " · $it" } ?: if (p.stato == "provo") " · provo…" else ""
                Text(dopo, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
            }
        }
        if (v.fase == "fallito") {
            Spacer(Modifier.padding(top = 4.dp))
            Text(
                (ultimoSegno?.let { "L'ultima volta che ha risposto: $it. " } ?: "") +
                    "Controlla che il computer sia acceso con SierraDeck aperto e che il telefono sia sulla stessa rete o su Tailscale. Puoi riprovare, o tornare a un altro computer dal selettore qui sopra.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
            OutlinedButton(onClick = onRiprova, modifier = Modifier.padding(top = 4.dp)) { Text("Riprova", fontSize = 12.sp) }
        }
    }
}
