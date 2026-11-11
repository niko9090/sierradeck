package it.ferrariconsulenze.sierradeck.schermate.vecchie

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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import it.ferrariconsulenze.sierradeck.rete.PcPonte
import it.ferrariconsulenze.sierradeck.rete.StatoLinea
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/** Il viola delle chat di un altro PC: lo stesso del riquadro remoto sul PC. */
val VIOLA_ALTRO_PC = Color(0xFFA77BF3)

/**
 * La fascia viola «SU <PC>», in cima a ogni schermata del ponte: non deve
 * mai esserci il dubbio di quale computer si stia comandando.
 */
@Composable
fun FasciaSuPc(pc: PcPonte, viaNome: String?, linea: StatoLinea? = null, onTorna: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(VIOLA_ALTRO_PC.copy(alpha = 0.22f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text("SU ${pc.nome.uppercase()}", color = VIOLA_ALTRO_PC, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            Text(
                "Stai comandando ${pc.nome}" + (if (!viaNome.isNullOrBlank()) " attraverso $viaNome" else " attraverso il PC accoppiato") + ": quello che scrivi arriva là.",
                color = Banco.testo, fontSize = 12.sp, maxLines = 2
            )
        }
        // La strada, la qualità e il ritardo (0.51.0); toccando, la storia.
        if (linea != null) { Spacer(Modifier.width(6.dp)); IndicatoreLinea(linea, pc.nome) }
        Spacer(Modifier.width(8.dp))
        OutlinedButton(onClick = onTorna) { Text("Torna", fontSize = 12.sp) }
    }
}
