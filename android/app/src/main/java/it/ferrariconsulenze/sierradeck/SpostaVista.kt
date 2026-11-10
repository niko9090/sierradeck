package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

/*
 * «Sposta su questo PC» (PC 0.88.0, avanzamento k-308): lo stato di uno
 * spostamento di un progetto fra PC, come lo manda il PC dentro il pannello
 * (`sposta`, forma `VistaSposta` di src/shared/sposta.ts). Qui si disegna:
 * percentuale totale, i sei passi con il loro stato, il conteggio del passo
 * in corso, l'ultimo contatto con l'altro PC e «Riprova». Le fasce, i passi e
 * i testi sono quelli del PC: tests/android/avanzamento-app.test.ts li
 * confronta con quelli veri.
 */

@Serializable data class VistaSposta(
    val progetto: String = "", val nome: String = "", val daNome: String = "",
    val fase: String = "controlli", val messaggio: String = "", val errore: String? = null,
    val percorso: String = "", val avvisi: List<String> = emptyList(),
    val fileFatti: Double? = null, val fileTotali: Double? = null,
    val byteFatti: Double? = null, val byteTotali: Double? = null,
    val percentuale: Double? = null, val percentualePasso: Double? = null,
    val ultimoContatto: String? = null, val attesa: String? = null,
    val fallitaIn: String? = null, val puoRiprovare: Boolean = false
)

enum class StatoPassoSposta(val parola: String) {
    FATTO("fatto"), IN_CORSO("in corso"), DA_FARE("da fare"), FERMO("fermo")
}

data class RigaPassoSposta(val titolo: String, val stato: StatoPassoSposta, val dettaglio: String? = null)

object SpostaRegole {
    /** I passi, nell'ordine, con il titolo da mostrare (`PASSI_SPOSTA`). */
    val PASSI = listOf(
        "controlli" to "Controlli",
        "chiesta" to "Il PC di prima ferma le chat del progetto e carica tutto sul Drive",
        "scarico" to "Scarico file e chat dal Drive",
        "verifica" to "Verifico le impronte, file per file",
        "cambio" to "Il progetto diventa di questo PC",
        "vecchia-copia" to "La copia di prima va nel recupero (30 giorni)"
    )

    /** Da quale a quale percentuale va ogni passo (`FASCE_SPOSTA`). */
    val FASCE = mapOf(
        "controlli" to (0 to 2), "chiesta" to (2 to 35), "attesa-proprietario" to (2 to 35), "scarico" to (35 to 85),
        "verifica" to (85 to 95), "cambio" to (95 to 98), "vecchia-copia" to (98 to 100)
    )

    /** Come `percentualeSposta` del PC. */
    fun percentuale(fase: String, passoPerc: Double?): Int {
        if (fase == "fatta") return 100
        val f = FASCE[fase] ?: return 0
        val dentro = (passoPerc ?: 0.0).coerceIn(0.0, 100.0) / 100.0
        return Math.round(f.first + (f.second - f.first) * dentro).toInt()
    }

    /** La percentuale totale: quella del PC, o ricavata dai dati vecchi. */
    fun totale(v: VistaSposta): Int =
        if (v.fase == "fatta") 100 else v.percentuale?.let { Math.round(it).toInt().coerceIn(0, 100) } ?: percentuale(v.fase, v.percentualePasso)

    /** A che passo è (1…6); 0 = non si sa. Come `passoDi` del PC, ma una fallita dice dove si è fermata. */
    fun passoDi(fase: String): Int {
        if (fase == "fatta" || fase == "fallita") return 0
        val chiave = if (fase == "attesa-proprietario") "chiesta" else fase
        val i = PASSI.indexOfFirst { it.first == chiave }
        return if (i < 0) 0 else i + 1
    }

    /** Il passo di adesso (1…6); per una fallita quello dove si è fermata, 0 se non lo dice. */
    fun passoAttuale(v: VistaSposta): Int = if (v.fase == "fallita") (v.fallitaIn?.let { passoDi(it) } ?: 0) else passoDi(v.fase)

    fun finita(v: VistaSposta) = v.fase == "fatta" || v.fase == "fallita"

    /** «12 di 40 file · 120 MB di 2,0 GB» — vuoto se il passo non si conta. */
    fun conteggio(v: VistaSposta): String {
        val pezzi = mutableListOf<String>()
        val ft = v.fileTotali
        if (ft != null && ft > 0) pezzi += "${(v.fileFatti ?: 0.0).toLong()} di ${ft.toLong()} file"
        val bt = v.byteTotali
        if (bt != null && bt > 0) pezzi += "${SpazioRegole.byte(v.byteFatti ?: 0.0)} di ${SpazioRegole.byte(bt)}"
        return pezzi.joinToString(" · ")
    }

    /** I sei passi con il loro stato (fatto, in corso, da fare, fermo con il motivo). */
    fun passi(v: VistaSposta): List<RigaPassoSposta> {
        val c = passoAttuale(v)
        return PASSI.mapIndexed { i, (_, titolo) ->
            val n = i + 1
            when {
                v.fase == "fatta" -> RigaPassoSposta(titolo, StatoPassoSposta.FATTO)
                v.fase == "fallita" && c > 0 && n == c -> RigaPassoSposta(titolo, StatoPassoSposta.FERMO, v.errore ?: v.messaggio.ifBlank { null })
                c > 0 && n < c -> RigaPassoSposta(titolo, StatoPassoSposta.FATTO)
                v.fase != "fallita" && n == c -> RigaPassoSposta(titolo, StatoPassoSposta.IN_CORSO, listOf(conteggio(v), v.attesa ?: "").filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null })
                else -> RigaPassoSposta(titolo, StatoPassoSposta.DA_FARE)
            }
        }
    }

    /** «5 min fa» dall'ultimo contatto; vuoto se non si sa. */
    fun contatto(iso: String?, adesso: Long = System.currentTimeMillis()): String {
        if (iso.isNullOrBlank()) return ""
        val t = try { java.time.Instant.parse(iso).toEpochMilli() } catch (e: Exception) { return "" }
        val s = ((adesso - t) / 1000).coerceAtLeast(0)
        return when {
            s < 60 -> "proprio adesso"
            s < 3600 -> "${s / 60} min fa"
            s < 86_400 -> "${s / 3600} h fa"
            else -> "${s / 86_400} giorni fa"
        }
    }

    fun titolo(v: VistaSposta): String = when (v.fase) {
        "fatta" -> "«${v.nome}» adesso vive su questo PC"
        "fallita" -> "Spostamento di «${v.nome}» fermo"
        else -> "Sposto «${v.nome}» da ${v.daNome}"
    }

    const val SPIEGA = "Il progetto passa da un PC all'altro in sei passi. Il PC di prima ferma le chat del progetto (mai una che sta lavorando) e carica tutto sul Drive; questo PC scarica file e chat e controlla le impronte, file per file. Se una sola non torna, si ferma e il progetto resta dov'era. Solo dopo il progetto cambia PC, e la copia di prima va nel recupero per 30 giorni: niente si cancella. Se l'altro PC è spento la richiesta aspetta nella sua posta e riparte da sola. «Riprova» rifà partire lo spostamento dal punto dove si è fermato."
}

/** Quanto è fatto, i passi, il conteggio, l'ultimo contatto e «Riprova». */
@Composable
fun AvanzamentoSposta(v: VistaSposta, occupato: Boolean, onRiprova: () -> Unit, onChiudi: () -> Unit) {
    val tot = SpostaRegole.totale(v)
    val fermo = v.fase == "fallita"
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        RigaConAiuto(SpostaRegole.titolo(v), SpostaRegole.SPIEGA, di = "Sposta su questo PC")
        Row(verticalAlignment = Alignment.CenterVertically) {
            LinearProgressIndicator(progress = { tot / 100f }, modifier = Modifier.weight(1f), color = if (fermo) Banco.ambra else Banco.accento)
            Text("  $tot%", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        for (r in SpostaRegole.passi(v)) {
            val colore: Color = when (r.stato) {
                StatoPassoSposta.FATTO -> Banco.verde
                StatoPassoSposta.IN_CORSO -> Banco.accento
                StatoPassoSposta.FERMO -> Banco.ambra
                StatoPassoSposta.DA_FARE -> Banco.testoQuieto
            }
            val segno = when (r.stato) { StatoPassoSposta.FATTO -> "✓"; StatoPassoSposta.IN_CORSO -> "●"; StatoPassoSposta.FERMO -> "■"; StatoPassoSposta.DA_FARE -> "○" }
            Column {
                Text("$segno ${r.titolo} · ${r.stato.parola}", color = colore, fontSize = 12.sp)
                r.dettaglio?.let { Text(it, color = if (r.stato == StatoPassoSposta.FERMO) Banco.ambra else Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp)) }
            }
        }
        if (v.messaggio.isNotBlank() && v.errore == null) Text(v.messaggio, color = Banco.testo, fontSize = 12.sp)
        if (v.errore != null && SpostaRegole.passoAttuale(v) == 0) Text("⚠ ${v.errore}", color = Banco.ambra, fontSize = 12.sp)
        for (a in v.avvisi) Text(a, color = Banco.testoQuieto, fontSize = 12.sp)
        val contatto = SpostaRegole.contatto(v.ultimoContatto)
        if (contatto.isNotEmpty() && v.fase != "fatta") Text("Ultimo contatto con ${v.daNome}: $contatto", color = Banco.testoQuieto, fontSize = 12.sp)
        if (SpostaRegole.finita(v)) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (fermo && v.puoRiprovare) Button(onClick = onRiprova, enabled = !occupato) { Text("Riprova") }
            OutlinedButton(onClick = onChiudi, enabled = !occupato) { Text("OK") }
        }
    }
}
