package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Il tasto **?** (app 2.62.0, decisione di Nicholas del 12/10: «non si riesce a
 * leggere tutta la pappardella, piuttosto metti un punto di domanda e uno apre
 * la spiegazione di quello che non sa»).
 *
 * Sullo schermo restano tasti, numeri e stati; la spiegazione completa si apre
 * in una finestrella solo a chi tocca il «?», e si chiude con «Chiudi».
 */
object Spiegazioni {
    /** Il titolo della finestrella: di cosa parla, oppure una domanda generica. */
    fun titolo(di: String?): String {
        val d = di?.trim().orEmpty()
        return if (d.isEmpty()) "Cos’è?" else "Cos’è «$d»?"
    }

    /** Quello che si legge con il lettore dello schermo sul tasto. */
    fun descrizione(di: String?): String {
        val d = di?.trim().orEmpty()
        return if (d.isEmpty()) "Spiegazione" else "Spiegazione: $d"
    }

    /** Un «?» serve solo se c'è qualcosa da spiegare. */
    fun serve(testo: String?): Boolean = !testo.isNullOrBlank()
}

@Composable
fun Aiuto(testo: String, di: String? = null, modifier: Modifier = Modifier) {
    if (!Spiegazioni.serve(testo)) return
    var aperto by remember { mutableStateOf(false) }
    Box(
        modifier
            .size(48.dp)
            .tocco { aperto = true }
            .semantics { contentDescription = Spiegazioni.descrizione(di) },
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier.size(20.dp).border(1.dp, Banco.testoQuieto, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text("?", color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
    if (aperto) {
        AlertDialog(
            onDismissRequest = { aperto = false },
            title = { Text(Spiegazioni.titolo(di), fontSize = 17.sp) },
            text = {
                Box(Modifier.verticalScroll(rememberScrollState())) {
                    Text(testo, color = Banco.testo, fontSize = 14.sp)
                }
            },
            confirmButton = { TextButton(onClick = { aperto = false }) { Text("Chiudi") } }
        )
    }
}

/** Il titolo di una sezione con il suo «?» accanto. */
@Composable
fun TitoloConAiuto(titolo: String, spiegazione: String?, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Serigrafia(titolo)
        if (Spiegazioni.serve(spiegazione)) {
            Spacer(Modifier.width(4.dp))
            Aiuto(spiegazione!!, di = titolo)
        }
    }
}

/** Il titolo di una finestrella (AlertDialog) con il suo «?» accanto. */
@Composable
fun TitoloDialogo(titolo: String, spiegazione: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(titolo, modifier = Modifier.weight(1f))
        Aiuto(spiegazione.orEmpty(), di = titolo)
    }
}

/** Una riga corta sempre a vista, con la spiegazione completa dietro al «?». */
@Composable
fun RigaConAiuto(riga: String, spiegazione: String, di: String? = null, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(riga, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Aiuto(spiegazione, di = di)
    }
}
