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

/** Le code dei progetti (app 2.61.0, in Progetti › Drive dalla 2.83.0): una fila di comandi per progetto. */
@Composable
fun CodeProgetti(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    // La coda condivisa: quale progetto e' aperto, le sue voci, il comando da mettere in fila.
    var codaAperta by remember { mutableStateOf<String?>(null) }
    var codaVoci by remember { mutableStateOf<List<VoceCoda>>(emptyList()) }
    var codaDisponibile by remember { mutableStateOf(true) }
    var codaTesto by remember { mutableStateOf("") }
    var codaGuasto by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(codaAperta) {
        val id = codaAperta ?: return@LaunchedEffect
        while (isActive) {
            try { val c = api.coda(id); codaVoci = c.voci; codaDisponibile = c.disponibile; codaGuasto = null } catch (e: Exception) {
                codaGuasto = "Non riesco a leggere la coda: ${e.message ?: "il computer non risponde"}. Riprovo ogni dieci secondi."
            }
            Davanti.pausa(10_000)
        }
    }
        // ─── Le code dei progetti ───
        // Un comando in fila per un progetto lo consegna il PC che ha il
        // testimone, appena una chat ha finito: da qui si vede, si aggiunge,
        // si toglie. Poco per volta: il telefono non e' il posto per scriverne
        // dieci.
        Sezione("Code dei progetti", aiuto = "Una fila di istruzioni per progetto, sul Drive: le consegna il PC che ha il progetto in mano, una per volta, alla prima chat del progetto che ha finito il turno. Serve a lasciare il lavoro dopo quello di adesso senza stare a guardare. Si rilegge ogni dieci secondi mentre è aperta.")
        Spacer(Modifier.height(8.dp))
        val progetti = stato?.progetti ?: emptyList()
        if (progetti.isEmpty()) Text("Nessun progetto sul Drive: le code esistono solo per i progetti portati sul Drive (sul computer: Account → Progetti).", color = Banco.testoQuieto, fontSize = 13.sp)
        else for (p in progetti) {
            val aperto = codaAperta == p.id
            Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.nome, color = Banco.testo, maxLines = 1)
                            Text(
                                "${p.inCoda} in coda · " + when (p.chi) {
                                    "io" -> "in lavoro qui"
                                    "altro" -> "in mano a ${p.pcNome ?: "un altro PC"}"
                                    else -> "libero: nessun PC lo sta usando"
                                },
                                color = Banco.testoQuieto, fontSize = 12.sp
                            )
                        }
                        OutlinedButton(onClick = { codaAperta = if (aperto) null else p.id; codaVoci = emptyList(); codaTesto = "" }) {
                            Text(if (aperto) "Chiudi" else "Coda")
                        }
                    }
                    if (aperto) {
                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider(color = Banco.incisione)
                        Spacer(Modifier.height(10.dp))
                        if (!codaDisponibile) {
                            Text("La coda sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato.", color = Banco.testoQuieto, fontSize = 12.sp)
                        }
                        codaGuasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
                        val attesa = codaVoci.filter { it.stato == "attesa" }
                        val consegnate = codaVoci.filter { it.stato == "consegnata" }
                        if (attesa.isEmpty()) Text("Nessun comando in attesa.", color = Banco.testoQuieto, fontSize = 13.sp)
                        attesa.forEachIndexed { i, v ->
                            Row(Modifier.padding(vertical = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text("${i + 1}. ${v.testo}", color = Banco.testo, fontSize = 13.sp)
                                    Text("da ${v.daNome}" + (if (v.sessione != null) " · per una chat precisa" else " · alla prima chat libera"), color = Banco.testoQuieto, fontSize = 12.sp)
                                }
                                TextButton(onClick = { scope.launch { tenta("togliere la voce dalla coda") { api.codaTogli(p.id, v.id).voci }?.let { codaVoci = it } } }) { Text("Togli") }
                            }
                        }
                        if (consegnate.isNotEmpty()) {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text("${consegnate.size} consegnate", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                TextButton(onClick = { scope.launch { tenta("pulire la coda") { api.codaPulisci(p.id).voci }?.let { codaVoci = it } } }) { Text("Pulisci") }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = codaTesto,
                            onValueChange = { codaTesto = it.take(4000) },
                            placeholder = { Text("Il comando da mettere in fila", color = Banco.testoQuieto, fontSize = 14.sp) },
                            textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                            minLines = 2,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Banco.accento,
                                unfocusedBorderColor = Banco.incisione,
                                focusedContainerColor = Banco.fondo,
                                unfocusedContainerColor = Banco.fondo
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            enabled = codaTesto.isNotBlank(),
                            shape = MaterialTheme.shapes.small,
                            onClick = {
                                val t = codaTesto.trim(); codaTesto = ""
                                scope.launch {
                                    // Se non parte, il comando torna nel campo: riscriverlo e' il modo peggiore di riaverlo.
                                    val voci = tenta("mettere in coda") { api.codaAggiungi(p.id, t).voci }
                                    if (voci != null) codaVoci = voci else if (codaTesto.isBlank()) codaTesto = t
                                }
                            }
                        ) { Text("Metti in coda") }
                    }
                }
            }
        }
}
