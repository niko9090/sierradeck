package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.QuestionAnswer
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.foundation.layout.Column
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.heightIn
import androidx.activity.compose.BackHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Le linguette in cima a Chat e Progetti: tasti alti 48 dp, la scelta in accento e in grassetto. */
@Composable
internal fun ConLinguette(posto: Posto, onLinguetta: (Int) -> Unit, contenuto: @Composable (Int) -> Unit) {
    val nomi = linguetteDi(posto.voce)
    val scelta = posto.linguetta.coerceIn(0, (nomi.size - 1).coerceAtLeast(0))
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            nomi.forEachIndexed { i, nome ->
                TextButton(onClick = { onLinguetta(i) }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(nome, fontSize = 15.sp, color = if (scelta == i) Banco.accento else Banco.testoQuieto, fontWeight = if (scelta == i) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
        Box(Modifier.weight(1f)) { contenuto(scelta) }
    }
}

/**
 * La barra in basso (2.83.0): quattro voci fisse, il nome su una riga che
 * segue la dimensione dei caratteri del telefono. Ogni voce porta il suo
 * pallino, con i colori della tabella del PC: ambra «aspetta te», rosso
 * «fermo».
 */
@Composable
internal fun BarraVoci(attuale: VoceBarra, stato: Stato?, onScegli: (VoceBarra) -> Unit) {
    val p = Pallini.di(stato)
    NavigationBar(containerColor = Banco.chassis) {
        for (v in VoceBarra.entries) {
            val (icona, pallino) = when (v) {
                VoceBarra.ADESSO -> Icons.Filled.Bolt to p.adesso
                VoceBarra.CHAT -> Icons.Filled.Forum to p.chat
                VoceBarra.PROGETTI -> Icons.Filled.Dashboard to null
                VoceBarra.ALTRO -> Icons.Filled.Menu to null
            }
            NavigationBarItem(
                selected = attuale == v,
                onClick = { onScegli(v) },
                icon = {
                    if (pallino != null) {
                        BadgedBox(badge = {
                            Badge(containerColor = if (pallino.rosso) Banco.rosso else Banco.ambra) { if (pallino.numero > 0) Text("${pallino.numero}", fontSize = 11.sp) }
                        }) { Icon(icona, contentDescription = v.nome + (pallino.descrizione?.let { ", $it" } ?: "")) }
                    } else {
                        Icon(icona, contentDescription = v.nome)
                    }
                },
                label = { Text(v.nome, fontSize = 13.sp, maxLines = 1) },
                alwaysShowLabel = true,
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Banco.accento,
                    selectedTextColor = Banco.testo,
                    indicatorColor = Banco.incisione,
                    unselectedIconColor = Banco.testoQuieto,
                    unselectedTextColor = Banco.testoQuieto
                )
            )
        }
    }
}

/** Un pallino della barra: rosso (fermo) o ambra (aspetta te), con il numero e cosa dice. */
data class Pallino(val rosso: Boolean, val numero: Int, val descrizione: String?)

/** I pallini delle voci, dallo stato del computer. Puri: si provano senza Compose (`NavigazioneTest`). */
data class Pallini(val adesso: Pallino?, val chat: Pallino?) {
    companion object {
        fun di(stato: Stato?): Pallini {
            if (stato == null) return Pallini(null, null)
            val fermi = stato.autopiloti.any { it.stato == "sospeso" || it.stato == "fallito" }
            // Uno che si e' preparato e aspetta il via e' fermo quanto uno sospeso:
            // senza di te non parte. Ambra, non rosso: non e' andato storto niente.
            val pronti = stato.autopiloti.any { it.stato == "pronto" }
            // Domande degli autopiloti e chat che aspettano una scelta: e' quello che
            // chiede davvero qualcosa a te.
            val chiedono = domandeInAttesa(stato)
            val adesso = when {
                fermi -> Pallino(true, chiedono, "un autopilota è fermo")
                chiedono > 0 -> Pallino(false, chiedono, if (chiedono == 1) "una domanda per te" else "$chiedono domande per te")
                pronti -> Pallino(false, 0, "un autopilota aspetta il via")
                else -> null
            }
            // Le chat ferme su una scelta (0.80.0: una chat che ha finito il turno non lo accende).
            val aspettano = stato.chat.count { leggiChat(it).tono == TonoChat.SCEGLIE }
            val chat = if (aspettano > 0) Pallino(false, aspettano, if (aspettano == 1) "una chat aspetta una scelta" else "$aspettano chat aspettano una scelta") else null
            return Pallini(adesso, chat)
        }
    }
}

/**
 * La tastiera è aperta? (2.83.0, c-509) Con la tastiera la barra delle voci
 * sparisce: sopra la tastiera devono restare la conversazione e la casella.
 * Letto dagli inset della finestra, che ci sono anche senza edge-to-edge.
 */
@Composable
fun tastieraAperta(): Boolean {
    val vista = androidx.compose.ui.platform.LocalView.current
    var aperta by remember { mutableStateOf(false) }
    DisposableEffect(vista) {
        val ascolta = android.view.ViewTreeObserver.OnGlobalLayoutListener {
            aperta = androidx.core.view.ViewCompat.getRootWindowInsets(vista)?.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime()) == true
        }
        vista.viewTreeObserver.addOnGlobalLayoutListener(ascolta)
        onDispose { vista.viewTreeObserver.removeOnGlobalLayoutListener(ascolta) }
    }
    return aperta
}
