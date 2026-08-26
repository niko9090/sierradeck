package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Badge
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/** Le quattro destinazioni della fascia in basso. */
enum class Scheda { ADESSO, CHAT, LAVORI, COMPUTER }

/**
 * La radice dell'app: prima il muro dell'accoppiamento, poi il resto.
 *
 * Finché non c'è un indirizzo **e** una chiave, si vede solo l'ingresso: senza,
 * ogni altra schermata potrebbe solo mostrare un errore. Appena il pairing riesce
 * lo stato cambia e la stessa `App` ricompone sulla plancia vera.
 */
@Composable
fun App(deposito: Collegamento, scansionaQr: ((String) -> Unit, (String) -> Unit) -> Unit) {
    var indirizzo by remember { mutableStateOf(deposito.indirizzo) }
    var chiave by remember { mutableStateOf(deposito.chiave) }
    val collegato = indirizzo.isNotBlank() && chiave.isNotBlank()

    Surface(color = Banco.fondo) {
        if (!collegato) {
            Ingresso(
                deposito = deposito,
                scansionaQr = scansionaQr,
                onCollegato = { ind, ch -> indirizzo = ind; chiave = ch }
            )
        } else {
            Principale(
                api = remember(indirizzo, chiave) { Api(indirizzo, chiave) },
                onScollega = { deposito.dimentica(); indirizzo = ""; chiave = "" }
            )
        }
    }
}

/**
 * La plancia: la fascia in basso a quattro destinazioni, e sopra la schermata
 * scelta. Il polso del computer arriva da `/api/stato` ogni due secondi finché
 * questa schermata è viva; dopo due giri a vuoto si dichiara «scollegato» invece
 * di mostrare dati vecchi come se fossero freschi.
 */
@Composable
fun Principale(api: Api, onScollega: () -> Unit) {
    val contesto = LocalContext.current
    var scheda by remember { mutableStateOf(Scheda.ADESSO) }
    var stato by remember { mutableStateOf<Stato?>(null) }
    var connesso by remember { mutableStateOf(true) }
    var giriFalliti by remember { mutableIntStateOf(0) }

    // La guardia in background: è ciò per cui l'app esiste invece della sola
    // pagina — avvisa anche quando l'app è chiusa.
    LaunchedEffect(Unit) {
        try {
            GuardiaService.avvia(contesto)
        } catch (_: Exception) {
        }
    }

    LaunchedEffect(api) {
        while (isActive) {
            try {
                stato = api.stato(); connesso = true; giriFalliti = 0
            } catch (e: Api.Errore) {
                if (e.daRiaccoppiare) { onScollega(); break }
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
            } catch (e: Exception) {
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
            }
            delay(2000)
        }
    }

    Scaffold(
        containerColor = Banco.fondo,
        bottomBar = { Fascia(scheda, stato, connesso) { scheda = it } }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (scheda) {
                Scheda.ADESSO -> Adesso(api, stato, connesso)
                Scheda.CHAT -> Chat(api, stato)
                Scheda.LAVORI -> Lavori(api, stato)
                Scheda.COMPUTER -> Computer(api, stato)
            }
        }
    }
}

/** La fascia in basso. Ogni voce porta il suo pallino di urgenza, così si vede
 *  da dove ti chiamano anche senza aprire la scheda. */
@Composable
private fun Fascia(
    attuale: Scheda,
    stato: Stato?,
    connesso: Boolean,
    onScegli: (Scheda) -> Unit
) {
    val domande = stato?.domande?.isNotEmpty() == true
    val fermi = stato?.autopiloti?.any { it.stato == "sospeso" || it.stato == "fallito" } == true

    NavigationBar(containerColor = Banco.chassis) {
        voce(attuale, Scheda.ADESSO, "Adesso", Icons.Filled.Bolt, allarme = domande || fermi, onScegli)
        voce(attuale, Scheda.CHAT, "Chat", Icons.Filled.Forum, allarme = false, onScegli)
        voce(attuale, Scheda.LAVORI, "Lavori", Icons.Filled.SmartToy, allarme = fermi, onScegli)
        voce(attuale, Scheda.COMPUTER, "Computer", Icons.Filled.Computer, allarme = false, onScegli)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.voce(
    attuale: Scheda,
    quale: Scheda,
    testo: String,
    icona: ImageVector,
    allarme: Boolean,
    onScegli: (Scheda) -> Unit
) {
    NavigationBarItem(
        selected = attuale == quale,
        onClick = { onScegli(quale) },
        icon = {
            if (allarme) {
                BadgedBox(badge = { Badge(containerColor = Banco.rosso) }) {
                    Icon(icona, contentDescription = testo)
                }
            } else {
                Icon(icona, contentDescription = testo)
            }
        },
        label = { Text(testo) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = Banco.accento,
            selectedTextColor = Banco.testo,
            indicatorColor = Banco.incisione,
            unselectedIconColor = Banco.testoQuieto,
            unselectedTextColor = Banco.testoQuieto
        )
    )
}

/** Segnaposto per le schede non ancora native (Chat, Lavori, Computer). */
@Composable
private fun Prossimamente(nome: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            "«$nome» in arrivo — sto portando questa schermata in nativo.",
            color = Banco.testoQuieto,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp)
        )
    }
}
