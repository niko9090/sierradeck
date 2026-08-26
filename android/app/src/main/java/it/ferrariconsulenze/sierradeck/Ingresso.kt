package it.ferrariconsulenze.sierradeck

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * L'ingresso: dove sta il computer, e le sei cifre per fidarsi.
 *
 * Il computer mostra un QR con dentro l'indirizzo e il codice: inquadrarlo
 * riempie tutto e accoppia da solo. Chi preferisce, scrive l'indirizzo
 * (`192.168.1.7`, la porta la mette l'app) e le sei cifre a mano.
 */
@Composable
fun Ingresso(
    deposito: Collegamento,
    scansionaQr: ((String) -> Unit, (String) -> Unit) -> Unit,
    onCollegato: (indirizzo: String, chiave: String) -> Unit
) {
    var indirizzo by remember { mutableStateOf(deposito.indirizzo) }
    var codice by remember { mutableStateOf("") }
    var nome by remember { mutableStateOf(Build.MODEL ?: "telefono") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    /** Prova ad accoppiarsi con quello che c'è nei campi. */
    fun collega() {
        errore = null
        val scritto = indirizzo.trim()
        if (scritto.isBlank()) { errore = "Serve un indirizzo, come 192.168.1.7"; return }
        // Persistere l'indirizzo lo normalizza (schema + porta). Senza chiave il
        // muro dell'ingresso resta comunque su, quindi salvarlo ora è innocuo.
        deposito.indirizzo = scritto
        val completo = deposito.indirizzo
        if (!Indirizzi.accettabile(completo)) {
            errore = "Quell’indirizzo è su Internet, non sulla tua rete: non ci parlo in chiaro."
            return
        }
        if (codice.trim().length < 6) { errore = "Il codice sono sei cifre."; return }
        inCorso = true
        scope.launch {
            try {
                val esito = Api(completo, null).accoppia(codice.trim(), nome.trim().ifBlank { "telefono" })
                if (esito.chiave.isBlank()) {
                    errore = "Il computer non ha dato una chiave: il codice era giusto?"
                } else {
                    deposito.ricordaChiave(completo, esito.chiave)
                    onCollegato(completo, esito.chiave)
                }
            } catch (e: Api.Errore) {
                errore = if (e.codice == 403) "Codice sbagliato o scaduto: guardane uno nuovo sul computer."
                else "Il computer ha risposto ${e.codice}."
            } catch (e: Exception) {
                errore = "${completo} non risponde. Controlla l’indirizzo o che SierraDeck sia acceso."
            } finally {
                inCorso = false
            }
        }
    }

    fun inquadra() {
        scansionaQr(
            { grezzo ->
                // Il QR è un indirizzo con `#codice=NNNNNN` dopo il cancelletto.
                indirizzo = grezzo.substringBefore('#')
                val c = grezzo.substringAfter("codice=", "").takeWhile { it.isDigit() }.take(6)
                if (c.isNotBlank()) { codice = c; collega() }
            },
            { g -> errore = g }
        )
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("SierraDeck", color = Banco.testo, fontSize = 30.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            "Aggancia il tuo computer",
            color = Banco.testoQuieto,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(28.dp))

        OutlinedButton(onClick = ::inquadra, modifier = Modifier.fillMaxWidth()) {
            Text("Inquadra il codice")
        }
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = indirizzo,
            onValueChange = { indirizzo = it },
            label = { Text("Indirizzo del computer") },
            placeholder = { Text("192.168.1.7") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = codice,
            onValueChange = { nuovo -> codice = nuovo.filter { it.isDigit() }.take(6) },
            label = { Text("Codice a sei cifre") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = nome,
            onValueChange = { nome = it.take(40) },
            label = { Text("Nome di questo dispositivo") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        if (errore != null) {
            Spacer(Modifier.height(16.dp))
            Text(errore!!, color = Banco.rosso, textAlign = TextAlign.Center)
        }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = ::collega,
            enabled = !inCorso,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (inCorso) CircularProgressIndicator(modifier = Modifier.height(20.dp))
            else Text("Collega")
        }
    }
}
