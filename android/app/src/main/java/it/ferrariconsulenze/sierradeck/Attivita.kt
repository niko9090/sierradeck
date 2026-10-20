package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Il colore fisso di cosa fa una chat (PC 0.82.0). La tabella è
 * `ColoriAttivita.kt`, generata da quella del PC: qui solo come si legge e
 * come si disegna. Il colore non è mai da solo: c'è sempre il simbolo, e il
 * nome per il lettore dello schermo.
 */
object Attivita {
    private val RUOLI = listOf("sviluppo", "interfaccia", "collaudo", "revisione", "rilascio")

    fun scheda(id: String?): SchedaAttivita? = id?.let { TabellaAttivita.attivita[it] }

    /** Il colore di un nome della tabella (anche «verde», «quieto»); grigio se non c'è. */
    fun argb(nome: String?): Long = TabellaAttivita.colori[nome] ?: TabellaAttivita.colori.getValue("quieto")

    fun colore(nome: String?): Color = Color(argb(nome))

    fun coloreDi(id: String?): Color = colore(scheda(id)?.colore)

    /** «al lavoro» per i ruoli, altrimenti «aspetta te», «ferma», «finita»: come `parolaStato` del PC. */
    fun parolaStato(id: String?): String {
        val s = scheda(id) ?: return ""
        return if (id in RUOLI) "al lavoro" else s.parola
    }

    /** Da un PC di prima della 0.82.0, che non manda l'attività: si ricava da ruolo e stato. */
    fun diSpecialista(x: Specialista): String = x.attivita?.takeIf { it in TabellaAttivita.attivita } ?: when {
        x.chiusa || x.stato == "finita" -> "finita"
        x.stato.startsWith("aspetta") -> "aspetta"
        !x.attivo -> "ferma"
        else -> x.ruolo.lowercase().takeIf { it in RUOLI } ?: "sviluppo"
    }

    fun diRiga(r: RigaAlLavoro): String = r.attivita?.takeIf { it in TabellaAttivita.attivita } ?: when {
        r.aspettaTe -> "aspetta"
        else -> r.ruolo?.takeIf { it in RUOLI } ?: "sviluppo"
    }
}

/** Il simbolo di cosa fa una chat, nel suo colore. */
@Composable
fun SegnoAttivita(id: String, modifier: Modifier = Modifier) {
    val s = Attivita.scheda(id) ?: return
    Text(
        s.icona, color = Attivita.colore(s.colore), fontWeight = FontWeight.Bold, fontSize = 14.sp,
        modifier = modifier.semantics { contentDescription = s.nome }
    )
}

/** La legenda dei colori dietro «?»: una riga per attività, con simbolo, nome e cosa vuol dire. */
@Composable
fun LegendaAttivita(modifier: Modifier = Modifier) {
    var aperto by remember { mutableStateOf(false) }
    Box(
        modifier.size(32.dp).clickable { aperto = true }.semantics { contentDescription = "Legenda: ${TabellaAttivita.TITOLO_LEGENDA}" },
        contentAlignment = Alignment.Center
    ) {
        Box(Modifier.size(20.dp).border(1.dp, Banco.testoQuieto, CircleShape), contentAlignment = Alignment.Center) {
            Text("?", color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
    if (aperto) {
        AlertDialog(
            onDismissRequest = { aperto = false },
            title = { Text(TabellaAttivita.TITOLO_LEGENDA, fontSize = 17.sp) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    for (id in TabellaAttivita.ordine) {
                        val a = TabellaAttivita.attivita.getValue(id)
                        Text("${a.icona} ${a.nome}", color = Attivita.colore(a.colore), fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(top = 6.dp))
                        Text(a.spiega, color = Banco.testo, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = { TextButton(onClick = { aperto = false }) { Text("Chiudi") } }
        )
    }
}
