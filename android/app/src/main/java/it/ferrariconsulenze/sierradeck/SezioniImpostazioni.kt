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

@Composable
fun SezioneDrive(api: Api) {
    var account by remember { mutableStateOf<Account?>(null) }
    LaunchedEffect(Unit) { account = try { api.account() } catch (_: Exception) { null } }
        // ─── Drive ───
        // L'account di SierraDeck non c'è più (PC 0.88.0): restano il Drive e
        // la cassaforte, da guardare; si collegano sul computer.
        Sezione("Drive")
        CatenaDrive(account)
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
