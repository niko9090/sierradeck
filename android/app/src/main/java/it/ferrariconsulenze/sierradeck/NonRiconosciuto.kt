package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Column

// «Il computer non ti riconosce», e ogni quanto si chiede lo stato al PC con l'app dietro.
// Spostati così com'erano da App.kt nella 0.83.0.

/**
 * Quanti rifiuti di fila prima di dire che c'è un problema.
 *
 * Il giro è di due secondi: cinque sono dieci secondi di «non ti riconosco»
 * ininterrotti, che nessun inciampo momentaneo del computer produce. Una revoca
 * vera, invece, dura per sempre e li raggiunge in dieci secondi.
 */
internal const val RIFIUTI_PER_ARRENDERSI = 5

/**
 * «Il computer non ti riconosce più.»
 *
 * Al posto di quello che c'era prima, cioè niente: l'app cancellava chiave e
 * indirizzo e si ritrovava alla schermata del codice QR, senza dire perché.
 * Chi guardava vedeva un'app che si era dimenticata di tutto da sola.
 *
 * Qui si dice cosa è successo e si lasciano due strade, senza prenderne
 * nessuna al posto di chi legge: riprovare — perché il computer potrebbe essere
 * appena tornato — o rifare l'accoppiamento, che è l'unica cosa che serve se il
 * telefono è stato tolto davvero dall'elenco.
 */
@Composable
internal fun NonRiconosciuto(onRiprova: () -> Unit, onRiaccoppia: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Il computer non ti riconosce",
                color = Banco.testo,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Da qualche secondo risponde che questo telefono non è fra i suoi. " +
                    "Può essere passeggero: riprova. Se è stato tolto dall'elenco dei " +
                    "dispositivi, serve rifare l'accoppiamento con il codice QR.",
                color = Banco.testoQuieto,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onRiprova) { Text("Riprova") }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onRiaccoppia) { Text("Rifai l'accoppiamento") }
        }
    }
}

/** Ogni quanto l'app chiede lo stato al PC quando non è davanti (app 2.69.0). */
object PolsoApp {
    const val DIETRO_OGNI_MS = 15_000L
    fun tocca(davanti: Boolean, ultimaIl: Long, ora: Long): Boolean = davanti || ora - ultimaIl >= DIETRO_OGNI_MS
}
