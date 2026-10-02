package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

// ─── Il Drive del computer scollegato, e le chat di altri PC (0.39.3) ───
//
// Il 23/09 Google ha rifiutato l'autorizzazione al Drive su due PC: i segni di
// vita degli altri PC non arrivavano piu', e le loro chat sembravano spente
// anche se erano accese. Il computer lo dice in /api/stato (`driveScollegato`),
// con lo stesso testo della banda del PC; l'app lo mostra in cima e non si
// chiude finche' il Drive resta scollegato.

@Serializable
data class AvvisoDrive(val titolo: String = "", val testo: String = "", val giorni: Int? = null)

/** Il colore delle chat di altri PC: lo stesso viola del PC. */
val ColoreRemoto = Color(0xFFA77BF3)

/** Il titolo di una conversazione con il segno «SU <PC>» davanti, se e' di un altro PC. */
fun titoloConSegno(c: Conversazione): String =
    c.suPc?.takeIf { it.isNotBlank() }?.let { "SU $it · ${c.titolo.removeSuffix(" · su $it")}" } ?: c.titolo

/** Il testo della banda, intero: cosa, perche', cosa fare dal computer. */
fun testoDriveScollegato(a: AvvisoDrive): String =
    "${a.testo} Si ricollega dal computer: Impostazioni → Account → Drive → «Collega»."

@Composable
fun BandaDriveScollegato(avviso: AvvisoDrive?) {
    if (avviso == null || avviso.titolo.isBlank()) return
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .border(1.dp, Banco.rosso, RoundedCornerShape(10.dp))
            .padding(12.dp)
    ) {
        Text(avviso.titolo.uppercase(), color = Banco.rosso, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(testoDriveScollegato(avviso), color = Banco.testo, fontSize = 13.sp)
    }
}
