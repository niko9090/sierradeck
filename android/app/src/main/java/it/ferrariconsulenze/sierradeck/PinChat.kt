package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Il PIN delle chat (PC 0.49.0, app 2.49.0). Il computer risponde **423** a
 * una chat protetta che questo telefono non ha sbloccato: l'app mostra il
 * lucchetto al posto del terminale e della casella, e il PIN lo controlla il
 * computer (`/api/pin/sblocca`), anche attraverso il ponte verso un altro PC.
 */
object PinChat {
    const val STATO_CHIUSA = 423

    fun chiusa(e: Throwable): Boolean = e is Api.Errore && e.codice == STATO_CHIUSA

    fun pinValido(pin: String): Boolean = Regex("^\\d{4,8}$").matches(pin)

    /** Solo cifre, al massimo otto: quello che il campo accetta mentre si scrive. */
    fun pulisci(testo: String): String = testo.filter { it.isDigit() }.take(8)

    /** La frase del computer (`errore`), o una per esteso se non c'è. */
    fun messaggio(e: Throwable): String {
        if (e !is Api.Errore) return "Non sono riuscito a controllare il PIN: ${e.message ?: "il computer non risponde"}"
        val dalJson = try {
            Api.json.parseToJsonElement(e.corpo).jsonObject["errore"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) { null }
        return dalJson?.takeIf { it.isNotBlank() } ?: when (e.codice) {
            403 -> "PIN sbagliato."
            429 -> "Troppi tentativi sbagliati: aspetta un po' e riprova."
            404, 409 -> "Questo computer non conosce ancora il PIN delle chat: aggiornalo alla 0.49.0."
            else -> "Il computer ha risposto ${e.codice}."
        }
    }
}

@Composable
fun CoperturaPinApp(api: Api, chatId: String, titolo: String, onAperta: () -> Unit, modifier: Modifier = Modifier) {
    var pin by remember(chatId) { mutableStateOf("") }
    var errore by remember(chatId) { mutableStateOf<String?>(null) }
    var provo by remember(chatId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(
        modifier.background(Banco.fondo).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("🔒", fontSize = 40.sp)
        Spacer(Modifier.height(8.dp))
        Text("«${titolo.ifBlank { "Questa chat" }}» è protetta dal PIN", color = Banco.testo, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            "La chat continua a lavorare sul computer: qui non si vede e non si scrive finché non metti il PIN. Lo controlla il computer, e la chat si richiude da sola dopo il tempo di inattività scelto là.",
            color = Banco.testoQuieto, fontSize = 12.sp, textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = PinChat.pulisci(it); errore = null },
            placeholder = { Text("PIN") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.width(180.dp)
        )
        Spacer(Modifier.height(8.dp))
        Button(enabled = PinChat.pinValido(pin) && !provo, onClick = {
            provo = true
            scope.launch {
                try {
                    api.sbloccaPin(chatId, pin)
                    pin = ""
                    onAperta()
                } catch (e: Exception) {
                    errore = PinChat.messaggio(e)
                    pin = ""
                } finally {
                    provo = false
                }
            }
        }) { Text(if (provo) "Controllo…" else "Apri") }
        errore?.let { Spacer(Modifier.height(6.dp)); Text(it, color = Banco.ambra, fontSize = 12.sp, textAlign = TextAlign.Center) }
    }
}
