package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.Switch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions

// La voce Impostazioni (dalla scheda di una volta «Computer»): le preferenze con la ricerca, e l'account.
// Spostata da Computer.kt nella 0.83.0, quando ogni parte è diventata una funzione sua.

/** Impostazioni: solo le preferenze, con la ricerca in cima (app 2.56.0). */
@Composable
fun ComputerImpostazioni(api: Api) {
    val scope = rememberCoroutineScope()
    var account by remember { mutableStateOf<Account?>(null) }
    var versionePc by remember { mutableStateOf<String?>(null) }
    val contesto = androidx.compose.ui.platform.LocalContext.current
    val deposito = remember(contesto) { Collegamento(contesto) }
    var continuo by remember { mutableStateOf(deposito.controlloContinuo) }
    var pref by remember { mutableStateOf<Preferenze?>(null) }
    var aggiornamento by remember { mutableStateOf<Aggiornamento?>(null) }
    LaunchedEffect(Unit) {
        account = try { api.account() } catch (_: Exception) { null }
        versionePc = try { api.ciao().versione } catch (_: Exception) { null }
        pref = try { api.preferenze().preferenze } catch (_: Exception) { null }
    }
    // Lo stato dell'aggiornamento cambia mentre scarica: si rinfresca.
    LaunchedEffect(Unit) {
        while (isActive) {
            aggiornamento = try { api.aggiornamento() } catch (_: Exception) { aggiornamento }
            Davanti.pausa(2000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // ─── Le impostazioni rifatte (app 2.56.0) ───
        // Nicholas (09/10): «Nelle impostazioni l'aggiornamento lo puoi mettere
        // in alto all'inizio? E sistemare tutto il menu impostazioni». Le
        // sezioni e le spiegazioni sono quelle del PC (assets/impostazioni.json),
        // «Aggiornamenti» in cima, e la ricerca in alto.
        val struttura = remember { ImpostazioniVoci.carica(contesto) }
        var cercaImp by remember { mutableStateOf("") }
        val visibili = ImpostazioniVoci.sezioniVisibili(struttura, cercaImp)
        OutlinedTextField(
            value = cercaImp, onValueChange = { cercaImp = it.take(60) }, singleLine = true,
            placeholder = { Text("Cerca nelle impostazioni (per esempio: aggiornamento, PIN, notifiche)", fontSize = 13.sp) },
            modifier = Modifier.fillMaxWidth()
        )
        if (cercaImp.isNotBlank()) {
            val trovate = ImpostazioniVoci.cerca(struttura, cercaImp)
            if (trovate.isEmpty()) Text("Niente con «${cercaImp.trim()}». Prova con un’altra parola.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
            for (v in trovate) {
                Row(Modifier.padding(vertical = 2.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text(v.titolo, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Aiuto(v.spiega, di = v.titolo)
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        if ("aggiornamenti" in visibili) {
            GruppoImpostazioni(struttura, "aggiornamenti")

        // ─── Aggiornamenti ───
        // Due programmi, due aggiornamenti, e prima ce n'era uno solo: si
        // vedeva quello del computer e dell'app non si sapeva niente —
        // nemmeno quale versione si avesse in mano.
        Sezione("Aggiornamenti")
        AggiornamentoApp(api)
        Spacer(Modifier.height(10.dp))
        AggiornamentoPc(api, aggiornamento, versionePc)
            Divisore()
        }

        if ("computer" in visibili) {
            GruppoImpostazioni(struttura, "computer")
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text("Gli altri computer stanno in Salute.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Aiuto("Gli altri computer, con le loro chat aperte e la cassetta, stanno in Salute. Per cambiare il computer a cui è collegata l’app tocca il suo nome in alto.", di = "Altri computer")
        }
        }

        if ("chat" in visibili) {
            GruppoImpostazioni(struttura, "chat")

        // ─── I workspace a elenco (PC 0.74.1): com'è andata e «Torna come prima» ───
        SezioneMigrazione(api)

        // ─── Il quaderno personale (app 2.57.0, PC 0.57.0) ───
        Sezione("Quaderno personale")
        SezioneQuadernoPersonale(api)
        Spacer(Modifier.height(10.dp))
        }

        if ("drive" in visibili) {
            GruppoImpostazioni(struttura, "drive")

        // ─── Account ───
        // Era in sola lettura, e il ragionamento era che una password scritta
        // su un telefono la può leggere chi ti sta accanto. Regge per l'inizio
        // e non per il seguito: un account da cui **non si può uscire** non è
        // prudenza, è una trappola, e chi ne ha due non aveva nessun modo di
        // passare dall'uno all'altro senza andare al computer. La prudenza
        // vera è chiedere conferma prima di uscire, non togliere il comando.
        Sezione("Account")
        Account(
            account = account,
            onCambiato = { scope.launch { account = try { api.account() } catch (_: Exception) { account } } },
            api = api
        )
            Divisore()
        }

        if ("aspetto" in visibili) {
            GruppoImpostazioni(struttura, "aspetto")

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
            Divisore()
        }

        if ("notifiche" in visibili) {
            GruppoImpostazioni(struttura, "notifiche")

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
            Divisore()
        }

        if ("info" in visibili) {
            GruppoImpostazioni(struttura, "info")

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
            Divisore()
        }

        Spacer(Modifier.height(24.dp))
    }
}

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
internal fun Account(account: Account?, api: Api, onCambiato: () -> Unit) {
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
                            Text(t.titolo, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
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
