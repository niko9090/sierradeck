package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

/** La fine del lavoro (PC 0.85.0): la riga e la percentuale per la barra. */
@Serializable
data class FineIndicatore(
    val testo: String = "",
    val percento: Int = 0
)

/** Va / lento / fermo (PC 0.85.0), dai soli segnali veri: già in parole e col colore del PC. */
@Serializable
data class AndamentoIndicatore(
    /** va | lento | fermo */
    val livello: String = "va",
    /** verde | ambra | rosso */
    val colore: String = "verde",
    val simbolo: String = "",
    val testo: String = ""
)

/**
 * **L'indicatore a colpo d'occhio** (PC 0.85.0) in cima al Punto: la
 * prossima versione, la fine del lavoro con la barra, e va / lento / fermo.
 * Le righe le scrive il PC (`indicatoreDi`): qui si mostrano e basta. Assente
 * con un PC più vecchio.
 */
@Serializable
data class IndicatoreAutopilota(
    val versione: String = "",
    val fine: FineIndicatore = FineIndicatore(),
    val andamento: AndamentoIndicatore = AndamentoIndicatore(),
    /** Una riga per chat, per il «?». */
    val dettaglio: List<String> = emptyList(),
    val aiuto: String = ""
)

/** Le parole dell'indicatore, uguali alla pagina del telefono: pure, si provano senza schermo. */
object RigheIndicatore {
    /** La barra fra 0 e 1. */
    fun frazione(i: IndicatoreAutopilota): Float = i.fine.percento.coerceIn(0, 100) / 100f

    /** «● Va: Sviluppo, commit 2 min fa». */
    fun andamento(i: IndicatoreAutopilota): String = "${i.andamento.simbolo} ${i.andamento.testo}".trim()

    /** Il «?»: la spiegazione e, sotto, chat per chat. */
    fun aiuto(i: IndicatoreAutopilota): String =
        if (i.dettaglio.isEmpty()) i.aiuto else i.aiuto + "\n\nChat per chat:\n" + i.dettaglio.joinToString("\n")
}

@Composable
fun IndicatoreAutopilotaVista(i: IndicatoreAutopilota) {
    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
        if (i.versione.isNotBlank()) Text(i.versione, color = Banco.testo, fontSize = 12.sp)
        if (i.fine.testo.isNotBlank()) Text(i.fine.testo, color = Banco.testo, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
        Box(Modifier.fillMaxWidth().padding(top = 3.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Banco.incisione)) {
            Box(Modifier.fillMaxWidth(RigheIndicatore.frazione(i)).fillMaxHeight().background(ColoreStato.verde))
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
            Text(RigheIndicatore.andamento(i), color = coloreVista(i.andamento.colore), fontSize = 12.sp, modifier = Modifier.weight(1f))
            Aiuto(RigheIndicatore.aiuto(i), di = "l’indicatore")
        }
    }
}
