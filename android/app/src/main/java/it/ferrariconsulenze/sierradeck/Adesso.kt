package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * **Adesso** (app 2.83.0): la prima voce, dove si apre l'app. In cima le
 * domande per te, ognuna con le scelte come tasti (un tocco risponde); sotto
 * gli autopiloti di questo PC e degli altri, con «+ Affida». Prima erano due
 * voci, Domande e Autopiloti, e l'app si apriva sulle chat.
 *
 * «Apri» su una domanda: un autopilota apre il suo dettaglio (con le sue
 * domande in cima), una chat apre la conversazione intera. «Indietro» torna qui.
 */
@Composable
fun Adesso(api: Api, stato: Stato?, apriAutopilota: String?, onAperto: () -> Unit) {
    val domande = remember(api) { DomandeLette() }
    var conversazione by remember { mutableStateOf<String?>(null) }
    var autopilota by remember { mutableStateOf<String?>(null) }
    val apri = apriAutopilota ?: autopilota
    val tutte = domande.conversazioni
    if (conversazione != null && tutte.isNotEmpty()) {
        BackHandler { conversazione = null }
        PolsoDomande(api, domande)
        Column(Modifier.fillMaxSize()) {
            TextButton(onClick = { conversazione = null }, modifier = Modifier.heightIn(min = 48.dp)) { Text("‹ Adesso", fontSize = 15.sp) }
            VistaConversazioni(
                api, tutte, onRiletto = { domande.giro += 1 },
                onApriAutopilota = { id -> conversazione = null; autopilota = id },
                iniziale = conversazione
            )
        }
        return
    }
    Lavori(
        api, stato, apri = apri,
        onAperto = { autopilota = null; onAperto() },
        testa = {
            domandeInCima(api, domande, DomandeAdesso.firma(stato)) { c ->
                val ap = c.autopilota
                if (c.tipo == "autopilota" && ap != null) autopilota = ap else conversazione = c.chiave
            }
        }
    )
}
