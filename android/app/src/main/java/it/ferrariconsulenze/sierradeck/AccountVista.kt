package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.border
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions

/**
 * Con quale account sta lavorando il computer — e i due gesti per cambiarlo.
 *
 * Uscire chiede conferma, ed è l'unica cosa qui che merita una domanda: tolto
 * l'accesso, il computer resta senza account finché qualcuno non rientra, e chi
 * ha premuto potrebbe essere in tram.
 *
 * Entrare è anche il modo di **cambiare** account: si esce e si rientra con
 * l'altro. Non c'è un comando apposta perché non serve, e un comando in meno è
 * uno in meno che può sbagliare.
 */
@Composable
internal fun AccountVista(account: Account?, api: Api, onCambiato: () -> Unit) {
    val scope = rememberCoroutineScope()
    var chiedeUscita by remember { mutableStateOf(false) }
    var apreIngresso by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var occupato by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf<String?>(null) }

    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        account?.email ?: if (account?.entrato == true) "entrato" else "Nessun account",
                        color = Banco.testo,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        maxLines = 1
                    )
                    Text(
                        if (account?.entrato == true) "Il computer sta lavorando con questo account."
                        else "Il computer lavora senza account.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp
                    )
                }
                if (account?.entrato == true) {
                    OutlinedButton(
                        enabled = !occupato,
                        shape = MaterialTheme.shapes.small,
                        onClick = { chiedeUscita = true }
                    ) { Text("Esci") }
                } else {
                    Button(
                        enabled = !occupato,
                        shape = MaterialTheme.shapes.small,
                        onClick = { apreIngresso = true; nota = null }
                    ) { Text("Entra") }
                }
            }

            // PC 0.70: la catena Account → Drive → Cassaforte → Salvataggio, come sul PC.
            account?.catena?.let { catena ->
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
                    for (t in catena.tessere) {
                        Column(Modifier.weight(1f)) {
                            Text(t.titolo, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                            Text(t.vista?.parola ?: "", color = coloreVista(t.vista?.colore ?: "quieto"), fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                        }
                    }
                }
                catena.tessere.firstOrNull { it.vista?.id == "scade" }?.vista?.ragione?.let {
                    Spacer(Modifier.height(6.dp))
                    Text("⚠ $it", color = Banco.ambra, fontSize = 12.sp)
                }
                passoAccount(account)?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = Banco.testoQuieto, fontSize = 12.sp)
                }
            }

            if (account?.entrato == true) {
                Spacer(Modifier.height(10.dp))
                TextButton(onClick = { apreIngresso = true; nota = null }) {
                    Text("Passa a un altro account", fontSize = 13.sp)
                }
            }

            if (nota != null) {
                Spacer(Modifier.height(8.dp))
                Text(nota ?: "", color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
    }

    if (chiedeUscita) {
        AlertDialog(
            onDismissRequest = { chiedeUscita = false },
            title = { Text("Esco dall'account?") },
            text = {
                Text(
                    "L'accesso lo perde il computer, non solo questo telefono: " +
                        "finché qualcuno non rientra, lavora senza account.",
                    color = Banco.testoQuieto,
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    chiedeUscita = false; occupato = true; nota = "Sto uscendo…"
                    scope.launch {
                        nota = try {
                            api.esciAccount(); null
                        } catch (e: Exception) {
                            "Questo computer non sa ancora uscire da fuori: aggiornalo."
                        }
                        occupato = false
                        onCambiato()
                    }
                }) { Text("Esci") }
            },
            dismissButton = { TextButton(onClick = { chiedeUscita = false }) { Text("Annulla") } }
        )
    }

    if (apreIngresso) {
        AlertDialog(
            onDismissRequest = { if (!occupato) apreIngresso = false },
            title = { Text(if (account?.entrato == true) "Passa a un altro account" else "Entra") },
            text = {
                Column {
                    if (account?.entrato == true) {
                        Text(
                            "Esce da quello di adesso e entra con questo.",
                            color = Banco.testoQuieto,
                            fontSize = 12.sp
                        )
                        Spacer(Modifier.height(10.dp))
                    }
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.trim() },
                        singleLine = true,
                        label = { Text("Email") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        singleLine = true,
                        label = { Text("Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !occupato && email.isNotBlank() && password.isNotBlank(),
                    onClick = {
                        occupato = true; nota = "Sto entrando…"
                        val e = email
                        val pw = password
                        password = ""
                        scope.launch {
                            nota = try {
                                // Uscire prima: entrare con un altro senza uscire
                                // lascerebbe due sessioni a contendersi lo stesso
                                // computer, e vincerebbe quella che risponde prima.
                                if (account?.entrato == true) api.esciAccount()
                                val esito = api.entraAccount(e, pw)
                                if (esito.ok) { apreIngresso = false; null }
                                else esito.messaggio ?: "Email o password non vanno."
                            } catch (ex: Exception) {
                                "Questo computer non sa ancora entrare da fuori: aggiornalo."
                            }
                            occupato = false
                            onCambiato()
                        }
                    }
                ) { Text(if (occupato) "…" else "Entra") }
            },
            dismissButton = {
                TextButton(enabled = !occupato, onClick = { apreIngresso = false }) { Text("Annulla") }
            }
        )
    }
}
/** «Copia i dettagli» (app 2.56.0): un testo da incollare quando si chiede aiuto. Senza chiavi né indirizzi. */
object Dettagli {
    fun testo(app: String, codice: Int, nomePc: String?, versionePc: String?, l: StatoLinea, adesso: Long): String {
        val q = Linea.qualita(l.misure)
        val fase = Linea.parolaFase(Linea.faseVista(l, adesso))
        val righe = mutableListOf(
            "SierraDeck — dettagli per l’aiuto",
            "App: $app (codice $codice)",
            "Computer: ${nomePc ?: "non ancora letto"}, SierraDeck ${versionePc ?: "versione non ancora letta"}",
            "Collegamento: $fase, strada ${Linea.stradaBreve(l.strada)}, qualità ${q.parola}" + (q.ritardoMs?.let { ", $it ms" } ?: "")
        )
        val storia = l.storia.takeLast(8)
        if (storia.isNotEmpty()) { righe += "Ultimi eventi del collegamento:"; for (e in storia) righe += "  " + Linea.rigaStoria(e) }
        return righe.joinToString("\n")
    }
}
