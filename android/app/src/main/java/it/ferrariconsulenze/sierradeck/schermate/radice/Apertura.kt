package it.ferrariconsulenze.sierradeck.schermate.radice

import it.ferrariconsulenze.sierradeck.schermate.altro.*
import it.ferrariconsulenze.sierradeck.schermate.file.*
import it.ferrariconsulenze.sierradeck.schermate.comune.*
import it.ferrariconsulenze.sierradeck.schermate.radice.*
import it.ferrariconsulenze.sierradeck.nucleo.*

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
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.activity.compose.BackHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import it.ferrariconsulenze.sierradeck.nucleo.ApriChatAltrove
import it.ferrariconsulenze.sierradeck.nucleo.CartellaRichiesta
import it.ferrariconsulenze.sierradeck.rete.PcPonte
import it.ferrariconsulenze.sierradeck.rete.SuPc

/**
 * Le destinazioni di prima (app 2.61.0, le sette voci del PC): restano come
 * **destinazione** per chi chiede di aprire l'app in un posto — una notifica,
 * «Apri la chat», «Apri cartella», «Chat di X dal vivo». Dalla 2.83.0 la barra
 * ha quattro voci (`VoceBarra`, in `Navigazione.kt`) e `Navigazione.verso` dice in
 * quale voce sta ogni destinazione; l'ordine e i nomi corti restano quelli del
 * PC (`MenuPrincipaleTest`).
 */
enum class Scheda(val id: String, val breve: String) {
    PROGETTI("progetti", "Progetti"),
    AUTOPILOTI("autopiloti", "Auto\u00adpiloti"),
    DOMANDE("domande", "Domande"),
    CHAT("chat", "Chat"),
    FILE("file", "File"),
    SALUTE("salute", "Salute"),
    IMPOSTAZIONI("impostazioni", "Imposta\u00adzioni")
}

/**
 * Dove aprire l'app quando lo chiede qualcun altro: una notifica toccata.
 * `MainActivity` lo scrive, `App` lo legge una volta e lo azzera.
 */
object Apertura {
    var schedaRichiesta by mutableStateOf<Scheda?>(null)
    /** La chat da aprire nella scheda Chat (da «Apri la chat» in Domande). */
    var chatRichiesta by mutableStateOf<String?>(null)

    /** Porta alla scheda Chat, dentro quella chat. */
    fun apriChat(id: String) { chatRichiesta = id; schedaRichiesta = Scheda.CHAT }
    /** La conversazione da aprire fra le chat di un altro PC (PC 0.84.1), per sessione. */
    var sessioneRichiesta by mutableStateOf<String?>(null)
    /** «Apri la chat su <PC>» (PC 0.84.1): le chat di quel PC dal ponte, dentro quella conversazione. */
    fun apriChatSu(a: ApriChatAltrove) {
        SuPc.corrente = PcPonte(a.pcId, a.pc)
        sessioneRichiesta = a.sessione.takeIf { it.isNotBlank() }
        schedaRichiesta = Scheda.CHAT
    }
    /** «Apri cartella» (PC 0.82.0): la cartella da aprire nella sezione File. */
    var cartellaRichiesta by mutableStateOf<CartellaRichiesta?>(null)
    fun apriCartella(r: CartellaRichiesta) { cartellaRichiesta = r; schedaRichiesta = Scheda.FILE }
    /** Dalla notifica dell'aggiornamento (0.43.0): versione e APK da installare. */
    var aggiornamento by mutableStateOf<Pair<String, String>?>(null)
    /** I file condivisi con SierraDeck da un'altra app (app 2.50.0): si apre «Manda a…». */
    var condivisi by mutableStateOf<List<android.net.Uri>?>(null)
}

