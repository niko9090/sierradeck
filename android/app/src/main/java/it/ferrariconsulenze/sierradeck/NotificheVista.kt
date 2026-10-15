package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Un interruttore per tipo di notifica (app 2.74.0), con la spiegazione dietro il «?». */
@Composable
fun InterruttoriNotifiche() {
    val contesto = LocalContext.current
    var scelte by remember { mutableStateOf(Notifiche.scelte(contesto)) }
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Quali notifiche", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Aiuto("Arrivano solo le notifiche utili: una domanda o un’attesa tua, un lavoro finito o fermo, una versione pronta, il computer perso da più di 5 minuti. Le chat che finiscono un turno avvisano solo se ti aspettano da 3 minuti; ogni chat e ogni autopilota hanno una notifica sola, che si aggiorna. Qui spegni i tipi che non vuoi.", di = "Quali notifiche")
            }
            for (t in TipoNotifica.values()) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(t.nome, color = Banco.testo, fontSize = 14.sp)
                        Text(t.spiega, color = Banco.testoQuieto, fontSize = 11.sp)
                    }
                    Switch(
                        checked = Notifiche.suona(t, scelte),
                        onCheckedChange = { acceso ->
                            Notifiche.scegli(contesto, t, acceso)
                            scelte = Notifiche.scelte(contesto)
                        }
                    )
                }
            }
        }
    }
}
