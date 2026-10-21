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

/**
 * La nota d'errore di tutta l'app: una sola, in cima, qualunque schermata.
 *
 * Decine di tasti facevano `catch (_: Exception) {}`: un «Chiudi la chat» che
 * non arrivava, un «Vai» rifiutato, un workspace non cambiato — e a schermo
 * niente, come se fosse andata. La pagina servita dal computer lo dice in
 * cima («Non sono riuscito: …»); qui lo stesso. È un oggetto e non uno stato
 * passato di mano in mano perché chi fallisce sta in fondo a una tessera in
 * fondo a una scheda, e la nota deve comparire dove si sta guardando.
 *
 * Si chiude col tasto, o da sola dopo qualche secondo: è una notizia, non un
 * muro. `giro` cresce a ogni nota, così un secondo errore uguale al primo fa
 * ripartire il tempo invece di sparire a metà lettura.
 */
object Nota {
    var testo by mutableStateOf<String?>(null)
        private set
    var giro by mutableIntStateOf(0)
        private set

    fun mostra(t: String) { testo = t; giro += 1 }
    fun chiudi() { testo = null }

    /**
     * Cosa dire di una risposta del computer che non e' andata.
     *
     * Il computer spiega i suoi rifiuti in JSON, campo `errore` («cartella
     * non conosciuta», «questa chat lavora su …»): e' quella la frase utile.
     * Se il corpo non e' JSON si mostra com'e'; se e' vuoto, almeno il codice.
     */
    fun spiega(e: Api.Errore, cosa: String): String {
        if (e.daRiaccoppiare) return "Non sono riuscito a $cosa: il computer non riconosce più questo telefono."
        val dalJson = try {
            Api.json.parseToJsonElement(e.corpo).jsonObject["errore"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) { null }
        val motivo = dalJson?.takeIf { it.isNotBlank() }
            ?: e.corpo.trim().takeIf { it.isNotBlank() }?.take(300)
            ?: "il computer ha risposto ${e.codice}"
        return "Non sono riuscito a $cosa: $motivo"
    }
}

/** Dopo quanto la nota se ne va da sola. Abbastanza per leggerla due volte. */
private const val NOTA_DURA_MS = 8_000L

/**
 * Prova a fare una cosa; se non va, lo dice nella [Nota] e torna `null`.
 *
 * `cosa` e' la descrizione all'infinito di quello che si stava facendo
 * («cambiare workspace», «chiudere la chat»): finisce nella frase «Non sono
 * riuscito a …». L'annullamento della coroutine non e' un errore da mostrare
 * e passa oltre com'e'.
 */
suspend fun <T> tenta(cosa: String, azione: suspend () -> T): T? =
    try {
        azione()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Api.Errore) {
        Nota.mostra(Nota.spiega(e, cosa)); null
    } catch (e: Exception) {
        Nota.mostra("Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}"); null
    }

/** La nota in cima: rossa, con «Ok» per chiuderla; sparisce da sola. */
@Composable
fun NotaGlobale() {
    val testo = Nota.testo
    LaunchedEffect(testo, Nota.giro) {
        if (testo != null) { delay(NOTA_DURA_MS); Nota.chiudi() }
    }
    AnimatedVisibility(
        visible = testo != null,
        enter = expandVertically(),
        exit = shrinkVertically()
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Banco.rosso.copy(alpha = 0.14f))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.width(3.dp).height(38.dp).background(Banco.rosso)) {}
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Non è andata", color = Banco.rosso, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(testo ?: "", color = Banco.testo, fontSize = 12.sp, maxLines = 4)
            }
            Spacer(Modifier.width(10.dp))
            TextButton(onClick = { Nota.chiudi() }) { Text("Ok") }
        }
    }
}
