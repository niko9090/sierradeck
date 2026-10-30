package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import androidx.compose.ui.draw.alpha
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.draw.clip


/**
 * Il «⋯» di una chat (PC 0.55.0, app 2.56.0): Rinomina, Dormi o Svegliala,
 * Sposta, PIN, Chiudi, Apri cartella, Archivia o elimina. Dalla
 * 2.83.0 sta anche su ogni riga dell'elenco delle chat: due tocchi invece di tre.
 * `onLasciata` dice che la chat non c'è più (chiusa, spostata, archiviata).
 */
@Composable
fun MenuChat(api: Api, chat: Chat, workspace: Workspace, nomePc: String?, versionePc: String?, onLasciata: () -> Unit) {
    val scope = rememberCoroutineScope()
    var menuAperto by remember { mutableStateOf(false) }
    var rinominando by remember { mutableStateOf(false) }
    var chiudendo by remember { mutableStateOf(false) }
    // Archivia ed Elimina dal PC (PC 0.79.0), con Chiudi e il loro «?».
    var gestendo by remember { mutableStateOf(false) }
    var lasciata by remember(chat.id) { mutableStateOf(false) }
    // ⏸ e ⇄ del riquadro sul PC (0.55.0).
    var addormentando by remember { mutableStateOf(false) }
    var spostando by remember { mutableStateOf(false) }
    var spostaIn by remember { mutableStateOf<String?>(null) }
    // Il PIN (app 2.56.0), come il tasto 🔐 del riquadro sul PC. L'ospite non c'è più (PC 0.88.0):
    // una chat vive con il suo progetto, sul PC del progetto.
    var pinDa by remember { mutableStateOf<Boolean?>(null) }
    // Anche su un altro PC, attraverso il ponte. Il tasto è di 48 dp (2.83.0).
    Box {
        IconButton(onClick = { menuAperto = true }, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Filled.MoreVert, "Altro", tint = Banco.testo)
        }
        DropdownMenu(expanded = menuAperto, onDismissRequest = { menuAperto = false }) {
            DropdownMenuItem(text = { Text("Rinomina") }, onClick = { menuAperto = false; rinominando = true })
            if (chat.viva) DropdownMenuItem(text = { Text("Metti a dormire") }, onClick = { menuAperto = false; addormentando = true })
            else DropdownMenuItem(text = { Text("Svegliala") }, onClick = {
                menuAperto = false
                scope.launch { if (tentaGestione("svegliare la chat", nomePc) { api.svegliaChat(chat.id) } != null) Nota.mostra("La chat si sveglia sul computer: riparte da dove era.") }
            })
            DropdownMenuItem(text = { Text("Sposta in un altro workspace…") }, onClick = { menuAperto = false; spostando = true })
            DropdownMenuItem(text = { Text(if (chat.pin == null) "Proteggi con il PIN…" else "Togli il PIN…") }, onClick = { menuAperto = false; pinDa = chat.pin == null })
            DropdownMenuItem(text = { Text("Chiudi la chat…") }, onClick = { menuAperto = false; chiudendo = true })
            // «Apri cartella» (PC 0.82.0): la sezione File sulla cartella della chat.
            if (FunzioniPc.disponibile(FunzionePc.CARTELLA, versionePc) != false) DropdownMenuItem(text = { Text("Apri cartella") }, onClick = {
                menuAperto = false
                scope.launch { apriCartellaDa(api, nomePc, chat = chat.id) }
            })
            // Con un PC più vecchio della 0.79.0 la voce non c'è (revisione ECC): là non saprebbe farlo.
            if (!chat.sessione.isNullOrBlank() && FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, versionePc) != false) DropdownMenuItem(text = { Text("Archivia o elimina dal PC…") }, onClick = { menuAperto = false; gestendo = true })
        }
    }
    if (rinominando) {
        RinominaChat(
            titolo = chat.titolo,
            onSalva = { nome -> scope.launch { tenta("rinominare la chat") { api.rinominaChat(chat.id, nome) } } },
            onChiudi = { rinominando = false }
        )
    }
    val titoloChat = chat.titolo.ifBlank { chat.cwd }
    val sessioneChat = chat.sessione
    // Chiusa, archiviata o eliminata davvero: letto l'esito si torna all'elenco, come con «Chiudi la chat…»
    // (prima si restava su una chat che non c'era più).
    if (gestendo && !sessioneChat.isNullOrBlank()) AzioniChatDialogo(api, sessioneChat, titoloChat, nomePc,
        onFatto = { fatte -> if (fatte > 0) lasciata = true },
        onChiudi = { gestendo = false; if (lasciata) onLasciata() })
    if (chiudendo) {
        DialogoConferma(AzioniTelefono.confermaChiudi(titoloChat), pericolo = true, onSi = {
            chiudendo = false
            // Si torna all'elenco **dopo** che il computer ha detto si':
            // tornare prima cancellava questo scope con la risposta
            // dentro, e un rifiuto restava muto. Se non va, si resta
            // qui e la nota in cima dice perche'.
            scope.launch {
                if (tentaGestione("chiudere la chat", nomePc) { api.chiudiChat(chat.id) } != null) onLasciata()
            }
        }, onNo = { chiudendo = false })
    }
    if (addormentando) {
        DialogoConferma(AzioniTelefono.confermaDormi(titoloChat), onSi = {
            addormentando = false
            scope.launch { if (tentaGestione("mettere a dormire la chat", nomePc) { api.dormiChat(chat.id) } != null) Nota.mostra("«$titoloChat» dorme: il suo claude.exe è chiuso, la conversazione è al suo posto. «Svegliala» dal menu la riaccende.") }
        }, onNo = { addormentando = false })
    }
    if (spostando) {
        SceltaWorkspace("Sposta «$titoloChat» in…", workspace.nomi, tranne = workspace.chat.firstOrNull { it.sessione == chat.sessione }?.workspace ?: workspace.attivo,
            onScegli = { spostando = false; spostaIn = it }, onChiudi = { spostando = false })
    }
    pinDa?.let { proteggi ->
        DialogoConferma(AzioniTelefono.confermaPin(titoloChat, proteggi), onSi = {
            pinDa = null
            scope.launch {
                if (tentaGestione(if (proteggi) "proteggere la chat" else "togliere il PIN", nomePc, FunzionePc.PARITA) { api.proteggiChat(chat.id, proteggi) } != null)
                    Nota.mostra(if (proteggi) "«$titoloChat» è protetta dal PIN." else "«$titoloChat» non ha più il PIN.")
            }
        }, onNo = { pinDa = null })
    }
    spostaIn?.let { verso ->
        DialogoConferma(AzioniTelefono.confermaSposta(titoloChat, verso), onSi = {
            spostaIn = null
            scope.launch { if (tentaGestione("spostare la chat", nomePc) { api.spostaChat(chat.id, verso) } != null) { Nota.mostra("«$titoloChat» è in «$verso»: riparte quando sul computer si passa a quel workspace."); onLasciata() } }
        }, onNo = { spostaIn = null })
    }
}
