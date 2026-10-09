package it.ferrariconsulenze.sierradeck

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
// con lo stesso testo della banda del PC.
//
// 0.56.3: era un riquadro rosso grande che copriva l'app e non si chiudeva.
// Adesso è una riga sola in cima, con «Perché?» per la spiegazione intera e ×
// per chiuderla; chiusa resta chiusa finché il problema è lo stesso (`chiave`
// = il momento dello scollegamento). Il PC la manda solo quando c'è da fare
// qualcosa: mai a chi il Drive non l'ha mai collegato, mai mentre ritenta.

@Serializable
data class AvvisoDrive(
    val titolo: String = "",
    val testo: String = "",
    val giorni: Int? = null,
    val breve: String? = null,
    val chiave: String? = null,
)

/** La riga si vede? No se manca, o se l'hai chiusa per questo stesso problema. */
fun mostraAvvisoDrive(a: AvvisoDrive?, chiuso: String?): Boolean {
    if (a == null || a.titolo.isBlank()) return false
    val k = a.chiave
    return k == null || k != chiuso
}

/** La riga breve: quella nuova del PC, o il titolo dei PC di prima della 0.56.3. */
fun rigaDriveScollegato(a: AvvisoDrive): String = a.breve?.takeIf { it.isNotBlank() } ?: a.titolo

private const val DRIVE_CHIUSO = "driveChiuso"

/** Il colore delle chat di altri PC: lo stesso viola del PC. */
val ColoreRemoto = Color(0xFFA77BF3)

/**
 * Il titolo di una conversazione con il segno «SU <PC>» davanti, se e' di un
 * altro PC; dalla 0.40.0 anche la strada con cui il computer ci arriva:
 * «SU LAPTOP (Tailscale) · Trading».
 */
fun titoloConSegno(c: Conversazione): String =
    c.suPc?.takeIf { it.isNotBlank() }?.let { pc ->
        val via = c.viaPc?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
        "SU $pc$via · ${c.titolo.removeSuffix(" · su $pc")}"
    } ?: c.titolo

/** Il testo della banda, intero: cosa, perche', cosa fare dal computer. */
fun testoDriveScollegato(a: AvvisoDrive): String =
    "${a.testo} Si ricollega dal computer: Impostazioni → Account → Drive → «Collega»."

@Composable
fun BandaDriveScollegato(avviso: AvvisoDrive?) {
    val contesto = LocalContext.current
    val pref = remember { contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE) }
    var chiuso by remember { mutableStateOf(pref.getString(DRIVE_CHIUSO, null)) }
    var perche by remember { mutableStateOf(false) }
    if (!mostraAvvisoDrive(avviso, chiuso) || avviso == null) return
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 2.dp)
            .background(Banco.rosso.copy(alpha = 0.10f))
            .padding(start = 8.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            Text(rigaDriveScollegato(avviso), color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            if (perche) {
                Spacer(Modifier.height(4.dp))
                Text(testoDriveScollegato(avviso), color = Banco.testo, fontSize = 12.sp)
            }
        }
        TextButton(onClick = { perche = !perche }) { Text(if (perche) "Meno" else "Perché?", fontSize = 12.sp) }
        val k = avviso.chiave
        if (k != null) {
            TextButton(onClick = { chiuso = k; pref.edit().putString(DRIVE_CHIUSO, k).apply() }) {
                Text("×", fontSize = 16.sp, color = Banco.rosso)
            }
        } else {
            Spacer(Modifier.width(4.dp))
        }
    }
}
