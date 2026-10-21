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

/** Aggiornamenti: l'app e il computer. Lo stato del computer si rilegge ogni 2 secondi, solo qui. */
@Composable
fun SezioneAggiornamenti(api: Api) {
    var versionePc by remember { mutableStateOf<String?>(null) }
    var aggiornamento by remember { mutableStateOf<Aggiornamento?>(null) }
    LaunchedEffect(Unit) { versionePc = try { api.ciao().versione } catch (_: Exception) { null } }
    // Lo stato dell'aggiornamento cambia mentre scarica: si rinfresca.
    LaunchedEffect(Unit) {
        while (isActive) {
            aggiornamento = try { api.aggiornamento() } catch (_: Exception) { aggiornamento }
            Davanti.pausa(2000)
        }
    }
        // ─── Aggiornamenti ───
        // Due programmi, due aggiornamenti, e prima ce n'era uno solo: si
        // vedeva quello del computer e dell'app non si sapeva niente —
        // nemmeno quale versione si avesse in mano.
        Sezione("Aggiornamenti")
        AggiornamentoApp(api)
        Spacer(Modifier.height(10.dp))
        AggiornamentoPc(api, aggiornamento, versionePc)
}

/** I workspace della linguetta «Workspace» di Chat: dove sei, dove puoi andare, crearne uno. */
@Composable
fun SezioneWorkspaceChat(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    var nuovoWs by remember { mutableStateOf("") }
        // ─── Workspace ───
        // Tutto dentro una tessera sola: prima i workspace erano chip sospesi e
        // sotto, staccato, un campo con una scritta di fianco — tre cose che non
        // sembravano la stessa cosa. Qui si vede subito dove sei e dove puoi
        // andare, e il campo per crearne uno sta nello stesso pannello.
        Sezione("Workspace")
        val ws = stato?.workspace
        // Rinominare ed eliminare (app 2.55.0): prima la funzione c'era ma
        // nessun tasto la chiamava, e un workspace dal telefono non si toglieva.
        var gestisci by remember { mutableStateOf(false) }
        if (gestisci) GestioneWorkspace(api, ws ?: Workspace(), PcCorrente.nome, onChiudi = { gestisci = false })
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                if ((ws?.nomi ?: emptyList()).isEmpty()) {
                    Text("Nessun workspace.", color = Banco.testoQuieto, fontSize = 13.sp)
                } else {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        for (nome in (ws?.nomi ?: emptyList()).filter { it.isNotBlank() }) {
                            VoceWorkspace(
                                nome = nome,
                                attivo = nome == ws?.attivo,
                                onClick = { scope.launch { tenta("cambiare workspace") { api.cambiaWorkspace(nome) } } }
                            )
                        }
                    }
                }
                // «Su altri PC» (PC 0.65.1): a parte, sotto quelli di questo PC.
                val altrove = ws?.altrove ?: emptyList()
                if (altrove.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("SU ALTRI PC", color = Banco.testoQuieto, fontSize = 11.sp)
                        Aiuto("Workspace che vivono su altri PC e qui non ci sono. La lista di questo PC resta sua: qui si vedono a parte.", di = "SU ALTRI PC")
                    }
                    for (p in altrove) Text("${p.nome}: ${p.workspace.joinToString(", ")}", color = Banco.testo, fontSize = 13.sp)
                }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Banco.incisione)
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = nuovoWs,
                        onValueChange = { nuovoWs = it.take(40) },
                        placeholder = { Text("Nome del nuovo", color = Banco.testoQuieto, fontSize = 14.sp) },
                        textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Banco.accento,
                            unfocusedBorderColor = Banco.incisione,
                            focusedContainerColor = Banco.fondo,
                            unfocusedContainerColor = Banco.fondo
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(10.dp))
                    Button(
                        enabled = nuovoWs.isNotBlank(),
                        shape = MaterialTheme.shapes.small,
                        onClick = {
                            val e = AzioniTelefono.erroreNomeWorkspace(nuovoWs, ws?.nomi ?: emptyList())
                            if (e != null) { Nota.mostra(e); return@Button }
                            val n = nuovoWs.trim(); nuovoWs = ""
                            scope.launch { tentaGestione("creare il workspace «$n»", PcCorrente.nome) { api.creaWorkspace(n) } }
                        }
                    ) { Text("Crea") }
                }
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = { gestisci = true }) { Text("Rinomina o elimina un workspace…") }
            }
        }
}

@Composable
fun SezioneAccount(api: Api) {
    val scope = rememberCoroutineScope()
    var account by remember { mutableStateOf<Account?>(null) }
    LaunchedEffect(Unit) { account = try { api.account() } catch (_: Exception) { null } }
        // ─── Account ───
        // Era in sola lettura, e il ragionamento era che una password scritta
        // su un telefono la può leggere chi ti sta accanto. Regge per l'inizio
        // e non per il seguito: un account da cui **non si può uscire** non è
        // prudenza, è una trappola, e chi ne ha due non aveva nessun modo di
        // passare dall'uno all'altro senza andare al computer. La prudenza
        // vera è chiedere conferma prima di uscire, non togliere il comando.
        Sezione("Account")
        AccountVista(
            account = account,
            onCambiato = { scope.launch { account = try { api.account() } catch (_: Exception) { account } } },
            api = api
        )
}

@Composable
fun SezioneAspetto(api: Api) {
    val scope = rememberCoroutineScope()
    var pref by remember { mutableStateOf<Preferenze?>(null) }
    LaunchedEffect(Unit) { pref = try { api.preferenze().preferenze } catch (_: Exception) { null } }
        // ─── Impostazioni ───
        Sezione("Aspetto")
        val p = pref
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((chiave, etichetta) in listOf("banco" to "Banco", "foglio" to "Foglio")) {
                FilterChip(
                    selected = (p?.stile ?: "banco") == chiave,
                    onClick = {
                        pref = p?.copy(stile = chiave) ?: Preferenze(stile = chiave)
                        scope.launch { if (tenta("cambiare lo stile") { api.impostaStile(chiave) } != null) try { Banco.applica(api.stile()) } catch (_: Exception) { } }
                    },
                    label = { Text(etichetta) }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Chiarore del fondo", color = Banco.testoQuieto, fontSize = 12.sp)
        var chiarore by remember(p?.chiarore) { mutableStateOf((p?.chiarore ?: 20).toFloat()) }
        Slider(
            value = chiarore,
            onValueChange = { chiarore = it },
            valueRange = 0f..100f,
            onValueChangeFinished = {
                scope.launch { if (tenta("cambiare il chiarore del fondo") { api.impostaChiarore(chiarore.toInt()) } != null) try { Banco.applica(api.stile()) } catch (_: Exception) { } }
            }
        )
}

@Composable
fun SezioneAvvisi() {
    val contesto = LocalContext.current
    val deposito = remember(contesto) { Collegamento(contesto) }
    var continuo by remember { mutableStateOf(deposito.controlloContinuo) }
        // ─── Avvisi ───
        Sezione("Avvisi")
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Text("Controllo continuo", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Aiuto("Accendilo quando stai aspettando qualcosa adesso: un avviso arriva in cinque secondi invece che in qualche minuto. Android in cambio mostra una riga fissa nelle notifiche; spegnendolo la riga fissa sparisce e l’app guarda ogni paio di minuti.", di = "Controllo continuo")
                        }
                        Text(
                            if (continuo) "Guardo ogni cinque secondi."
                            else "Guardo ogni paio di minuti.",
                            color = Banco.testoQuieto,
                            fontSize = 12.sp
                        )
                    }
                    Switch(
                        checked = continuo,
                        onCheckedChange = { acceso ->
                            continuo = acceso
                            deposito.controlloContinuo = acceso
                            if (acceso) {
                                Sentinella.ferma(contesto)
                                GuardiaService.avvia(contesto)
                            } else {
                                GuardiaService.ferma(contesto)
                                Sentinella.programma(contesto)
                            }
                        }
                    )
                }
                val notificheAttive = androidx.core.app.NotificationManagerCompat.from(contesto).areNotificationsEnabled()
                if (!notificheAttive) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Le notifiche di SierraDeck sono spente in Android: gli avvisi non possono arrivare, qualunque cosa faccia l’app.",
                        color = Banco.ambra, fontSize = 12.sp
                    )
                    TextButton(onClick = {
                        try {
                            contesto.startActivity(
                                android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, contesto.packageName)
                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                        } catch (e: Exception) { /* senza la schermata di sistema resta il testo */ }
                    }) { Text("Accendile nelle impostazioni di Android") }
                }
                val energia = contesto.getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
                if (energia != null && !energia.isIgnoringBatteryOptimizations(contesto.packageName)) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("Gli avvisi possono arrivare in ritardo.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Aiuto("Android limita l’app in sottofondo: a telefono fermo un avviso può arrivare con minuti di ritardo. Se vuoi gli avvisi puntuali, escludi SierraDeck dal risparmio batteria.", di = "Risparmio batteria")
                    }
                    TextButton(onClick = {
                        try {
                            contesto.startActivity(
                                android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                        } catch (e: Exception) { /* idem */ }
                    }) { Text("Apri il risparmio batteria") }
                }
            }
        }
        // Quali notifiche (app 2.74.0): Nicholas, 15/10, «devi ricevere solo notifiche utili».
        Spacer(Modifier.height(10.dp))
        InterruttoriNotifiche()
}

@Composable
fun SezioneInfo(api: Api) {
    val contesto = LocalContext.current
    var versionePc by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { versionePc = try { api.ciao().versione } catch (_: Exception) { null } }
        // ─── Info (0.52.1) ───
        // Quale app hai in mano, scritto per intero: per controllare che sia
        // la 2.51 o successiva senza aprire le impostazioni di Android.
        Sezione("Info")
        Text(
            "App installata: SierraDeck ${BuildConfig.VERSION_NAME} (codice di versione ${BuildConfig.VERSION_CODE}).",
            color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp)
        )
        Text(
            "Computer collegato: " + (versionePc?.let { "SierraDeck $it" } ?: "versione non ancora letta") + ". " +
                "SierraDeck è di Nicholas Ferrari / Ferrari Consulenze.",
            color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
        )
        // «Copia i dettagli» (app 2.56.0): versioni e collegamento in un testo solo, per chiedere aiuto. Niente chiavi.
        TextButton(onClick = {
            val l = Collegamenti.di(Collegamenti.ACCOPPIATO)
            val testo = Dettagli.testo(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE, PcCorrente.nome, versionePc, l, System.currentTimeMillis())
            val cm = contesto.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("SierraDeck", testo))
            Nota.mostra("Dettagli copiati: incollali dove chiedi aiuto. Non ci sono chiavi né password.")
        }) { Text("Copia i dettagli") }
        // Lo storico degli errori (app 2.81.0): quello del PC, con «Copia» e «Manda al PC di sviluppo».
        SezioneErroriApp(api)
}

@Composable
internal fun Sezione(titolo: String, aiuto: String? = null) {
    TitoloConAiuto(titolo, aiuto)
    Spacer(Modifier.height(8.dp))
}

@Composable
internal fun Divisore() {
    Spacer(Modifier.height(16.dp))
    HorizontalDivider(color = Banco.incisione)
    Spacer(Modifier.height(16.dp))
}

/**
 * Un workspace nell'elenco.
 *
 * Quello in cui sei ha il pieno dell'accento, gli altri il contorno inciso: si
 * capisce dove sei senza leggere, che e' il punto di guardarli tutti insieme.
 * Il chip di Material non lo diceva abbastanza — due grigi appena diversi.
 */
@Composable
internal fun VoceWorkspace(nome: String, attivo: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = if (attivo) Banco.accento else Banco.fondo,
        contentColor = if (attivo) Banco.fondo else Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, if (attivo) Banco.accento else Banco.incisione)
    ) {
        Text(
            nome,
            fontSize = 13.sp,
            fontWeight = if (attivo) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

/** La testata di una sezione delle impostazioni: il titolo e cosa c'è dentro (app 2.56.0). */
@Composable
internal fun GruppoImpostazioni(s: StrutturaImp, id: String) {
    val sez = s.sezioni.firstOrNull { it.id == id } ?: return
    Spacer(Modifier.height(10.dp))
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
        Text(sez.titolo.uppercase(), color = Banco.accento, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = 1.2.sp)
        Aiuto(sez.spiega, di = sez.titolo)
    }
}
