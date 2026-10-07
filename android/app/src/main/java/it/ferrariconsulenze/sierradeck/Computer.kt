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

/** Numeri di token leggibili: 12.4k, 3.1M. */
private fun tokenBrevi(n: Long): String = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

/**
 * «Computer»: ciò che si governa del banco da lontano — i workspace, gli
 * avvisi, l'account, i consumi e i limiti del piano, le code dei progetti, gli
 * altri computer, l'aspetto, il Drive e gli aggiornamenti.
 */
@Composable
fun Computer(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    var consumi by remember { mutableStateOf<Consumi?>(null) }
    var account by remember { mutableStateOf<Account?>(null) }
    var versionePc by remember { mutableStateOf<String?>(null) }
    val contesto = androidx.compose.ui.platform.LocalContext.current
    val deposito = remember(contesto) { Collegamento(contesto) }
    var continuo by remember { mutableStateOf(deposito.controlloContinuo) }
    var pref by remember { mutableStateOf<Preferenze?>(null) }
    var aggiornamento by remember { mutableStateOf<Aggiornamento?>(null) }
    var nuovoWs by remember { mutableStateOf("") }
    // La coda condivisa: quale progetto e' aperto, le sue voci, il comando da mettere in fila.
    var codaAperta by remember { mutableStateOf<String?>(null) }
    var codaVoci by remember { mutableStateOf<List<VoceCoda>>(emptyList()) }
    var codaDisponibile by remember { mutableStateOf(true) }
    var codaTesto by remember { mutableStateOf("") }
    var codaGuasto by remember { mutableStateOf<String?>(null) }
    // La posta per un PC: gli altri computer, la cassetta di quello aperto.
    var pcVisti by remember { mutableStateOf<List<PcRemoto>?>(null) }
    var pcDisponibile by remember { mutableStateOf(true) }
    var pcAperto by remember { mutableStateOf<String?>(null) }
    var postaVoci by remember { mutableStateOf<List<VocePosta>>(emptyList()) }
    var postaCwd by remember { mutableStateOf("") }
    var postaTesto by remember { mutableStateOf("") }
    var postaNota by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (isActive) {
            try { val e = api.pc(); pcVisti = e.pc; pcDisponibile = e.disponibile } catch (_: Exception) { if (pcVisti == null) pcVisti = emptyList() }
            delay(15_000)
        }
    }
    LaunchedEffect(pcAperto) {
        val id = pcAperto ?: return@LaunchedEffect
        while (isActive) {
            try { postaVoci = api.posta(id).voci; postaNota = null } catch (e: Exception) { postaNota = "Non riesco a leggere la cassetta." }
            delay(10_000)
        }
    }
    LaunchedEffect(codaAperta) {
        val id = codaAperta ?: return@LaunchedEffect
        while (isActive) {
            try { val c = api.coda(id); codaVoci = c.voci; codaDisponibile = c.disponibile; codaGuasto = null } catch (e: Exception) {
                codaGuasto = "Non riesco a leggere la coda: ${e.message ?: "il computer non risponde"}. Riprovo ogni dieci secondi."
            }
            delay(10_000)
        }
    }

    // I consumi si rileggono ogni mezzo minuto, come fa il computer: letti una
    // volta sola all'apertura della scheda, i limiti del piano restavano quelli
    // di quando l'avevi aperta — e una finestra di 5 ore che sale all'80%
    // mentre guardi e' proprio la notizia che serve.
    LaunchedEffect(Unit) {
        while (isActive) {
            consumi = try { api.consumi() } catch (_: Exception) { consumi }
            delay(30_000)
        }
    }
    LaunchedEffect(Unit) {
        account = try { api.account() } catch (_: Exception) { null }
        versionePc = try { api.ciao().versione } catch (_: Exception) { null }
        pref = try { api.preferenze().preferenze } catch (_: Exception) { null }
    }
    // Lo stato dell'aggiornamento cambia mentre scarica: si rinfresca.
    LaunchedEffect(Unit) {
        while (isActive) {
            aggiornamento = try { api.aggiornamento() } catch (_: Exception) { aggiornamento }
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {

        // ─── Workspace ───
        // Tutto dentro una tessera sola: prima i workspace erano chip sospesi e
        // sotto, staccato, un campo con una scritta di fianco — tre cose che non
        // sembravano la stessa cosa. Qui si vede subito dove sei e dove puoi
        // andare, e il campo per crearne uno sta nello stesso pannello.
        Sezione("Workspace")
        val ws = stato?.workspace
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                if ((ws?.nomi ?: emptyList()).isEmpty()) {
                    Text("Nessun workspace.", color = Banco.testoQuieto, fontSize = 13.sp)
                } else {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        for (nome in ws?.nomi ?: emptyList()) {
                            VoceWorkspace(
                                nome = nome,
                                attivo = nome == ws?.attivo,
                                onClick = { scope.launch { tenta("cambiare workspace") { api.cambiaWorkspace(nome) } } }
                            )
                        }
                    }
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
                            val n = nuovoWs.trim(); nuovoWs = ""
                            scope.launch { tenta("creare il workspace «$n»") { api.creaWorkspace(n) } }
                        }
                    ) { Text("Crea") }
                }
            }
        }

        Divisore()

        // ─── Avvisi ───
        Sezione("Avvisi")
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Controllo continuo", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            if (continuo) "Guardo ogni cinque secondi. Android in cambio mostra una riga fissa nelle notifiche."
                            else "Guardo ogni paio di minuti, senza lasciare niente nelle notifiche.",
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
                    Text(
                        "Android limita l’app in sottofondo: a telefono fermo un avviso può arrivare con minuti di ritardo. Se vuoi gli avvisi puntuali, escludi SierraDeck dal risparmio batteria.",
                        color = Banco.testoQuieto, fontSize = 12.sp
                    )
                    TextButton(onClick = {
                        try {
                            contesto.startActivity(
                                android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                        } catch (e: Exception) { /* idem */ }
                    }) { Text("Apri il risparmio batteria") }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Accendilo quando stai aspettando qualcosa adesso: un avviso arriva in cinque secondi invece che in qualche minuto. Spegnendolo la riga fissa sparisce.",
                    color = Banco.testoQuieto,
                    fontSize = 11.sp
                )
            }
        }

        Divisore()

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

        // ─── Consumi ───
        Sezione("Consumi (token)")
        val c = consumi
        if (c == null) Text("Carico…", color = Banco.testoQuieto)
        else {
            Text(
                "↑ token mandati a Claude, ↓ token ricevuti, ⟳ letti dalla cache (costano molto meno); «chat» è quante conversazioni hanno lavorato nel periodo.",
                color = Banco.testoQuieto, fontSize = 11.sp
            )
            QuotaRiga("Oggi", c.oggi)
            QuotaRiga("7 giorni", c.settimana)
            QuotaRiga("Totale", c.totale)
            Spacer(Modifier.height(8.dp))
            Text("LIMITI DEL PIANO", color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp)
            val l = c.limiti
            FinestraRiga("Finestra di 5 ore", l?.cinqueOre, "Al 100% le chat si fermano fino all’azzeramento.")
            FinestraRiga("Settimana", l?.settimana, "Il tetto settimanale su tutti i modelli.")
            Text(
                if (l == null) "Non ancora letti: arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta dal computer (solo con abbonamento Pro o Max)."
                else "Letti " + quandoLetti(l.letti, System.currentTimeMillis()) + ": gli stessi numeri di /usage in Claude Code. Fra tutte le chat aperte dal computer vale la lettura più recente; si aggiornano a ogni risposta, e qui ogni mezzo minuto. Una lettura di più di 20 minuti è segnata vecchia: il valore vero può essere più alto.",
                color = Banco.testoQuieto, fontSize = 11.sp
            )
            // Il contesto di ogni chat aperta, con la frase del computer
            // (0.37): uguale alla console e alla pagina.
            if (c.chatAperte.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("CONTESTO DELLE CHAT APERTE", color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp)
                for (ch in c.chatAperte) {
                    Spacer(Modifier.height(4.dp))
                    Text(rigaContesto(ch), color = Banco.testo, fontSize = 12.sp)
                }
                Text(
                    "Il contesto è la memoria di lavoro della chat: si conta come Claude Code, solo con i token in ingresso. Al 90% conviene farle riassumere dove è arrivata, prima che lo compatti da sola.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
            }
            c.freno?.let { fr ->
                Spacer(Modifier.height(8.dp))
                Text("FRENO DEGLI AUTOPILOTI", color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp)
                Text("${fr.titolo}: ${fr.spiegazione.ifEmpty { fr.motivo }}", color = Banco.testoQuieto, fontSize = 12.sp)
            }
            c.costo?.let { k ->
                Spacer(Modifier.height(6.dp))
                Text(
                    "Spesa stimata da Claude Code: oggi ${"%.2f".format(k.oggi)} $, 7 giorni ${"%.2f".format(k.settimana)} $. Con un abbonamento è un’indicazione, non una fattura.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
            }
        }

        Divisore()

        // ─── Le code dei progetti ───
        // Un comando in fila per un progetto lo consegna il PC che ha il
        // testimone, appena una chat ha finito: da qui si vede, si aggiunge,
        // si toglie. Poco per volta: il telefono non e' il posto per scriverne
        // dieci.
        Sezione("Code dei progetti")
        Text(
            "Una fila di istruzioni per progetto, sul Drive: le consegna il PC che ha il progetto in mano, una per volta, alla prima chat del progetto che ha finito il turno. Serve a lasciare il lavoro dopo quello di adesso senza stare a guardare. Si rilegge ogni dieci secondi mentre è aperta.",
            color = Banco.testoQuieto, fontSize = 12.sp
        )
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
                                    Text("da ${v.daNome}" + (if (v.sessione != null) " · per una chat precisa" else " · alla prima chat libera"), color = Banco.testoQuieto, fontSize = 11.sp)
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

        Divisore()

        // Gli altri computer, e le azioni da eseguire solo la'. Nicholas
        // (2026-09-14): «se sto operando su una chat su una cartella in rete
        // gli altri come fanno a operare li'?». Si scrive nella cassetta di
        // quel PC; consegna il suo postino, quando e' acceso.
        Sezione("Altri computer")
        Text(
            "Gli altri PC che usano lo stesso Drive, con le chat che hanno aperte (dal loro battito, ogni pochi minuti): pallino ambra = aspetta te. «Chat … dal vivo» apre le chat di quel PC da qui, attraverso il PC a cui il telefono è accoppiato (serve la 0.48.0 su questo PC): le vedi e le comandi come dal PC, con la fascia viola «SU …» in cima. Si raggiungono con le stesse strade del PC (rete di casa, Tailscale, collegamento diretto) e solo con la chiave della stessa cassaforte. «Azioni» lascia un'istruzione nella cassetta di quel PC: si esegue solo là, in una sua chat, quando è acceso — serve per una cartella che sta su quel PC (un disco di rete, un progetto che non viaggia). Se la cartella là non esiste, la voce fallisce e lo leggi qui.",
            color = Banco.testoQuieto, fontSize = 12.sp
        )
        Spacer(Modifier.height(8.dp))
        val pcs = pcVisti
        when {
            !pcDisponibile -> Text("Questo computer non sa ancora mandare azioni a un altro PC: aggiornalo.", color = Banco.testoQuieto)
            pcs == null -> Text("Leggo il Drive…", color = Banco.testoQuieto)
            pcs.isEmpty() -> Text("Nessun altro PC ha ancora lasciato un segno sul Drive: serve SierraDeck 0.27.0 o più nuovo su quel PC, con la cassaforte sbloccata e il Drive collegato.", color = Banco.testoQuieto)
            else -> for (p in pcs) {
                val aperto = pcAperto == p.pcId
                Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(p.nome, color = Banco.testo, maxLines = 1)
                                Text(
                                    (if (p.vivo) "acceso" else "spento, ultimo segno ${p.battito.take(16).replace('T', ' ')}") +
                                        " · ${p.chat.size} chat aperte · ${p.cartelle.size} cartelle",
                                    color = if (p.vivo) Banco.verde else Banco.testoQuieto, fontSize = 12.sp
                                )
                            }
                            OutlinedButton(onClick = {
                                pcAperto = if (aperto) null else p.pcId
                                postaVoci = emptyList(); postaTesto = ""; postaNota = null
                                postaCwd = p.cartelle.firstOrNull() ?: ""
                            }) { Text(if (aperto) "Chiudi" else "Azioni") }
                        }
                        // Il ponte (PC 0.48.0): le chat di quel PC dal vivo, da qui,
                        // passando dal PC a cui il telefono è accoppiato.
                        val ponte = FunzioniPc.disponibile(FunzionePc.PONTE, PcCorrente.versione)
                        Spacer(Modifier.height(6.dp))
                        if (ponte == false) {
                            Text(FunzioniPc.testoMancante(FunzionePc.PONTE) + " Si aggiorna il PC accoppiato, non quello da guardare.", color = Banco.testoQuieto, fontSize = 11.sp)
                        } else {
                            OutlinedButton(onClick = {
                                SuPc.corrente = PcPonte(p.pcId, p.nome)
                                Apertura.schedaRichiesta = Scheda.CHAT
                            }) { Text("Chat di ${p.nome} dal vivo", fontSize = 12.sp, color = VIOLA_ALTRO_PC) }
                        }
                        // Le chat aperte su quel PC, con chi aspetta: il battito le
                        // porta da sempre e il telefono ne mostrava solo il numero.
                        // Da qui si vede chi si e' fermato anche su un computer con
                        // cui il telefono non e' accoppiato.
                        if (p.chat.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            for (ch in p.chat.take(8)) {
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                                    LedChat(if (!p.vivo) null else if (ch.aspetta) TonoChat.ASPETTA else TonoChat.LAVORA)
                                    Spacer(Modifier.width(8.dp))
                                    Text(ch.titolo.ifBlank { ch.cwd }, color = Banco.testo, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
                                    Text(
                                        if (!p.vivo) "ultimo stato noto" else if (ch.aspetta) "aspetta te" else "al lavoro",
                                        color = if (p.vivo && ch.aspetta) Banco.ambra else Banco.testoQuieto, fontSize = 11.sp
                                    )
                                }
                            }
                            if (p.chat.size > 8) Text("e altre ${p.chat.size - 8}", color = Banco.testoQuieto, fontSize = 11.sp)
                        }
                        if (aperto) {
                            Spacer(Modifier.height(8.dp))
                            val attesa = postaVoci.filter { it.stato == "attesa" }
                            val chiuse = postaVoci.filter { it.stato != "attesa" }
                            val nota = postaNota
                            if (nota != null) Text(nota, color = Banco.rosso, fontSize = 12.sp)
                            if (attesa.isEmpty()) Text("Nessuna azione in attesa.", color = Banco.testoQuieto, fontSize = 12.sp)
                            for ((i, v) in attesa.withIndex()) {
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("${i + 1}. ${v.testo}", color = Banco.testo, fontSize = 13.sp)
                                        Text("in ${v.cwd} · da ${v.daNome}" + (if (v.apertaIl != null) " · chat aperta, aspetto che sia pronta" else ""), color = Banco.testoQuieto, fontSize = 11.sp)
                                    }
                                    TextButton(onClick = { scope.launch { try { postaVoci = api.postaTogli(p.pcId, v.id).voci } catch (e: Exception) { postaNota = "Non sono riuscito a togliere la voce." } } }) { Text("Togli") }
                                }
                            }
                            if (chiuse.isNotEmpty()) {
                                for (v in chiuse.takeLast(5)) {
                                    Text((if (v.stato == "fallita") "✗ " else "✓ ") + v.testo.take(60) + " — " + (v.esito ?: v.stato), color = if (v.stato == "fallita") Banco.ambra else Banco.testoQuieto, fontSize = 11.sp)
                                }
                                TextButton(onClick = { scope.launch { try { postaVoci = api.postaPulisci(p.pcId).voci } catch (e: Exception) { postaNota = "Non sono riuscito a pulire." } } }) { Text("Pulisci le chiuse") }
                            }
                            Spacer(Modifier.height(8.dp))
                            if (p.cartelle.isNotEmpty()) {
                                Text("In quale cartella di ${p.nome}:", color = Banco.testoQuieto, fontSize = 12.sp)
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    for (c in p.cartelle) {
                                        FilterChip(selected = postaCwd == c, onClick = { postaCwd = c }, label = { Text(c.substringAfterLast('\\').substringAfterLast('/'), fontSize = 12.sp) })
                                    }
                                }
                            }
                            OutlinedTextField(
                                value = postaCwd,
                                onValueChange = { postaCwd = it },
                                label = { Text("La cartella com'è su quel PC") },
                                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(6.dp))
                            OutlinedTextField(
                                value = postaTesto,
                                onValueChange = { postaTesto = it.take(4000) },
                                placeholder = { Text("L'azione, come la scriveresti nella chat di quel PC", color = Banco.testoQuieto, fontSize = 14.sp) },
                                textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                                minLines = 2,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                enabled = postaTesto.isNotBlank() && postaCwd.isNotBlank(),
                                shape = MaterialTheme.shapes.small,
                                onClick = {
                                    val t = postaTesto.trim(); val c = postaCwd.trim()
                                    scope.launch {
                                        try { postaVoci = api.postaAggiungi(p.pcId, c, t).voci; postaTesto = ""; postaNota = null }
                                        catch (e: Api.Errore) { postaNota = if (e.codice == 409) "La posta sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato." else "Non sono riuscito a mandare (HTTP ${e.codice})." }
                                        catch (e: Exception) { postaNota = "Non sono riuscito a mandare: ${e.message ?: "il computer non risponde"}" }
                                    }
                                }
                            ) { Text("Manda a ${p.nome}") }
                        }
                    }
                }
            }
        }

        // I salvataggi con nome non esistono piu' (0.34.0 / app 2.37.0): il
        // computer riapre da solo l'ultima composizione all'avvio.
        Divisore()

        // ─── Impostazioni ───
        Sezione("Aspetto")
        val p = pref
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((chiave, etichetta) in listOf("banco" to "Banco", "foglio" to "Foglio")) {
                FilterChip(
                    selected = (p?.stile ?: "banco") == chiave,
                    onClick = {
                        pref = p?.copy(stile = chiave) ?: Preferenze(stile = chiave)
                        scope.launch { tenta("cambiare lo stile") { api.impostaStile(chiave) } }
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
                scope.launch { tenta("cambiare il chiarore del fondo") { api.impostaChiarore(chiarore.toInt()) } }
            }
        )

        Divisore()

        // ─── La salute del sistema (0.44.0) ───
        Sezione("Salute del sistema")
        SezioneSalute(api)
        Spacer(Modifier.height(10.dp))
        Divisore()

        // ─── Il Drive ───
        // Il magazzino comune dei PC, da sfogliare e da cui far portare
        // qualcosa al computer: la stessa scheda «Drive» del computer.
        Sezione("Drive")
        SezioneDrive(api)
        Spacer(Modifier.height(10.dp))
        Divisore()

        // ─── Aggiornamenti ───
        // Due programmi, due aggiornamenti, e prima ce n'era uno solo: si
        // vedeva quello del computer e dell'app non si sapeva niente —
        // nemmeno quale versione si avesse in mano.
        Sezione("Aggiornamenti")
        AggiornamentoApp(api)
        Spacer(Modifier.height(10.dp))
        AggiornamentoPc(api, aggiornamento, versionePc)
        Divisore()

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
                "L'app e il programma sul computer si aggiornano ognuno per conto suo (qui sopra, «Aggiornamenti»). " +
                "SierraDeck è di Nicholas Ferrari / Ferrari Consulenze.",
            color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
        )

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AggiornamentoPc(api: Api, a: Aggiornamento?, versionePc: String?) {
    val scope = rememberCoroutineScope()
    val contesto = LocalContext.current
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf<String?>(null) }
    /**
     * L'ora dell'ultima ricerca chiesta da qui.
     *
     * Se il computer è già all'ultima versione, premere «Cerca» non cambia
     * niente sullo schermo: la ricerca dura meno del giro di due secondi con
     * cui il telefono rilegge lo stato, e chi ha premuto vede esattamente lo
     * stesso riquadro di prima. Sembra un tasto rotto, ed era invece un tasto
     * che aveva già finito. Una riga con l'ora è la prova che è successo.
     */
    var cercatoAlle by remember { mutableStateOf<String?>(null) }
    // Com'e' andato l'ultimo «Installa»: prima, se la richiesta falliva, lo
    // schermo «sto installando» compariva e spariva senza una parola.
    var esitoInstalla by remember { mutableStateOf<String?>(null) }
    // La finestra delle note (0.39.0): «Installa» la apre, e solo il suo
    // «Installa e riavvia» chiede davvero l'installazione al computer.
    var finestraNote by remember { mutableStateOf(false) }
    var noteLette by remember { mutableStateOf<NoteAggiornamento?>(null) }

    val descrizione = when (a?.fase) {
        "cerco" -> "Sto guardando se c’è qualcosa di nuovo…"
        "disponibile" -> "C'è la ${a.versione ?: "versione nuova"}, da scaricare." + (a.errore?.let { "\n$it" } ?: "")
        "scarico" -> "Sto scaricando la ${a.versione ?: ""}."
        // Con il motivo del computer, se l'ultima installazione non e' partita:
        // il PC lo manda da sempre in questo campo, e qui nessuno lo leggeva.
        "pronto" -> "La ${a.versione ?: ""} è già scaricata e aspetta solo di essere installata." + (a.errore?.let { "\n$it" } ?: "")
        "attendo" -> when {
            a.attesa != null -> "Aspetto che finisca ${a.attesa}, poi installo."
            (a.chatOccupate ?: 0) == 1 -> "Aspetto che una chat finisca quello che ha in mano, poi installo."
            else -> "Aspetto che ${a.chatOccupate ?: 0} chat finiscano quello che hanno in mano, poi installo."
        }
        "installo" -> "Sto installando: il computer si chiude e riparte da solo."
        "aggiornato" -> "È all’ultima versione."
        "errore" -> "Non ci sono riuscito: ${a.errore ?: "errore sconosciuto"}"
        else -> nota ?: "Controlla da sé ogni sei ore. Puoi anche chiederglielo adesso."
    }
    val colore = when (a?.fase) {
        "disponibile", "pronto" -> Banco.accento
        "scarico", "cerco", "installo", "attendo" -> Banco.ambra
        "errore" -> Banco.rosso
        "aggiornato" -> Banco.verde
        else -> Banco.testoQuieto
    }

    fun cerca() {
        cercando = true; nota = "Sto cercando…"; cercatoAlle = null
        scope.launch {
            nota = try {
                api.cercaAggiornamentoPc()
                cercatoAlle = oraDiAdesso()
                null
            } catch (e: Exception) {
                "Questo computer non sa ancora cercare a comando: aggiornalo dal suo schermo."
            }
            // Un attimo di «Cerco…» anche quando la risposta è immediata: sotto
            // il mezzo secondo il tasto cambia e torna prima che l'occhio se ne
            // accorga, e il gesto sembra non essere arrivato.
            delay(900)
            cercando = false
        }
    }

    RiquadroAggiornamento(
        titolo = "SierraDeck sul computer",
        versione = if (versionePc == null) "il programma sul PC" else "adesso ha la $versionePc",
        stato = descrizione,
        colore = colore,
        percento = if (a?.fase == "scarico") (a.percento ?: 0) else null,
        poscritto = esitoInstalla ?: cercatoAlle?.let { "Ho cercato alle $it." }
    ) {
        when (a?.fase) {
            "disponibile" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = { scope.launch { tenta("far scaricare l'aggiornamento al computer") { api.scaricaAggiornamento() } } }
            ) { Text("Scarica") }
            "scarico" -> Text("${a.percento ?: 0}%", color = Banco.ambra, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            "cerco" -> Text("cerco…", color = Banco.ambra, fontSize = 13.sp)
            // Nessun tasto: premere di nuovo non anticipa niente, e un tasto
            // che non fa niente e' peggio di nessun tasto.
            "attendo" -> Text("aspetto…", color = Banco.ambra, fontSize = 13.sp)
            "pronto" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = {
                    // Prima le note, poi la conferma: lo stesso «Installa» del PC.
                    finestraNote = true
                    noteLette = null
                    scope.launch {
                        noteLette = try {
                            // Un tentativo andato male si dice anche qui, prima di riprovare (0.39.2).
                            conTentativoFallito(api.noteAggiornamento(), a.tentativoFallito)
                        } catch (e: Api.Errore) {
                            noteMancanti(if (e.codice == 409 || e.codice == 404) "il computer ha una versione che non le sa ancora dare" else "HTTP ${e.codice}")
                        } catch (e: Exception) {
                            noteMancanti(e.message)
                        }
                    }
                }
            ) { Text("Installa") }
            else -> OutlinedButton(
                enabled = !cercando,
                shape = MaterialTheme.shapes.small,
                onClick = { cerca() }
            ) { Text(if (cercando) "Cerco…" else "Cerca ora") }
        }
    }

    if (finestraNote) {
        DialogoNoteAggiornamento(
            versione = a?.versione ?: "versione nuova",
            note = noteLette,
            onPiuTardi = { finestraNote = false },
            onInstalla = {
                finestraNote = false
                    scope.launch {
                        // Prima si segna, poi si chiede: fra la richiesta e la
                        // chiusura del computer possono passare pochi
                        // millisecondi, e segnare dopo vorrebbe dire non
                        // segnare affatto.
                        Installazione.iniziata(contesto, versionePc)
                        esitoInstalla = null
                        // Se la richiesta non parte, lo schermo «sto installando»
                        // restava davanti a un computer che non lo stava facendo,
                        // per dieci minuti. E si dice: un tasto che torna com'era
                        // senza una parola sembra rotto.
                        try {
                            api.installaAggiornamento()
                            esitoInstalla = "Chiesto alle ${oraDiAdesso()}. Se il computer resta su «pronto» senza aspettare le chat, il perché è nel suo registro (sul PC: Account → Apri i log, righe «aggiornamenti»); chiudere e riaprire SierraDeck là sblocca un «Installa» rimasto appeso."
                        } catch (e: Api.Errore) {
                            Installazione.finita(contesto)
                            esitoInstalla = "Il computer ha rifiutato la richiesta (HTTP ${e.codice}). Riprova; se continua, aggiorna SierraDeck dal suo schermo."
                        } catch (e: Exception) {
                            Installazione.finita(contesto)
                            esitoInstalla = "Non sono riuscito a chiedere l’installazione: ${e.message ?: "il computer non risponde"}."
                        }
                    }
            }
        )
    }

    // L'ultima installazione non è riuscita (0.39.2): il perché e le strade,
    // con la pagina della versione per scaricarla a mano.
    val fallito = a?.tentativoFallito
    if (fallito != null && a.fase != "installo" && a.fase != "attendo") {
        val uri = LocalUriHandler.current
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, Banco.ambra, MaterialTheme.shapes.small).padding(12.dp)) {
            Text("L’ULTIMA INSTALLAZIONE NON È RIUSCITA", color = Banco.ambra, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(testoTentativoFallito(fallito), color = Banco.testo, fontSize = 13.sp)
            linkAmmessoApp(fallito.pagina)?.let { link ->
                TextButton(onClick = { runCatching { uri.openUri(link) } }) { Text("Pagina della versione") }
            }
        }
    }

    // «Cerca» **sempre**, anche quando una versione è già pronta.
    //
    // Prima il tasto spariva appena qualcosa era stato scaricato: se nel
    // frattempo ne usciva una più nuova, l’unica cosa che potevi fare era
    // installare quella vecchia. Cercare non cancella ciò che è già
    // scaricato — se non c’è niente di più nuovo, il tasto «Installa» torna.
    if (a?.fase == "pronto" || a?.fase == "disponibile" || a?.fase == "errore") {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            OutlinedButton(
                enabled = !cercando,
                shape = MaterialTheme.shapes.small,
                onClick = { cerca() }
            ) { Text(if (cercando) "Cerco…" else "Cerca se ce n’è una più nuova") }
        }
    }
}

/**
 * L'aggiornamento **dell'app**.
 *
 * Prima esisteva solo all'avvio, e in silenzio: se non compariva niente non
 * si sapeva se fosse aggiornata o se il controllo non avesse funzionato — e la
 * versione che si ha in mano non era scritta da nessuna parte.
 */
@Composable
private fun AggiornamentoApp(api: Api) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf("Controlla da sé a ogni apertura, e ti avvisa in alto.") }
    var trovata by remember { mutableStateOf<Pair<String, String>?>(null) }
    var colore by remember { mutableStateOf(Banco.testoQuieto) }

    RiquadroAggiornamento(
        titolo = "L'app su questo telefono",
        versione = "versione ${BuildConfig.VERSION_NAME}",
        stato = nota,
        colore = colore
    ) {
        OutlinedButton(
            enabled = !cercando,
            shape = MaterialTheme.shapes.small,
            onClick = {
                cercando = true
                nota = "Sto cercando…"
                colore = Banco.testoQuieto
                scope.launch {
                    val esito = try {
                        Aggiornamenti.cerca(BuildConfig.VERSION_NAME, api)
                    } catch (e: Exception) {
                        Aggiornamenti.Esito.NonRiuscita(e.message ?: "non so perché")
                    }
                    when (esito) {
                        is Aggiornamenti.Esito.Trovata -> {
                            nota = "C'è la ${esito.nome}."
                            colore = Banco.accento
                            trovata = esito.nome to esito.apk
                        }
                        is Aggiornamenti.Esito.GiaAggiornata -> {
                            nota = "È l'ultima. Non c'è niente di nuovo."
                            colore = Banco.verde
                        }
                        is Aggiornamenti.Esito.NonRiuscita -> {
                            nota = "Non ci sono riuscito (${esito.motivo})."
                            colore = Banco.ambra
                        }
                    }
                    cercando = false
                }
            }
        ) { Text(if (cercando) "Cerco…" else "Cerca ora") }
    }

    trovata?.let { (nome, apk) ->
        DialogoAggiornamentoApp(
            nome = nome,
            apk = apk,
            avviaScarico = { indirizzo, onProgresso, onGuasto ->
                Scaricamento.apk(contesto, indirizzo, onProgresso, onGuasto)
            },
            onChiudi = { trovata = null }
        )
    }
}

/**
 * Il riquadro di un aggiornamento: chi è, che versione ha, come sta, e il gesto.
 *
 * Uno solo per tutti e due, perché sono la stessa cosa detta di due programmi —
 * e quando due riquadri hanno la stessa forma il secondo si legge senza doverlo
 * rileggere.
 */
@Composable
private fun RiquadroAggiornamento(
    titolo: String,
    versione: String,
    stato: String,
    colore: androidx.compose.ui.graphics.Color,
    /** Da 0 a 100 mentre scarica; assente quando non sta scaricando. */
    percento: Int? = null,
    /** Una riga in coda, per dire che una cosa che non si vede è comunque successa. */
    poscritto: String? = null,
    azione: @Composable () -> Unit
) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(titolo, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(versione, color = Banco.testoQuieto, fontSize = 12.sp)
                }
                azione()
            }
            Spacer(Modifier.height(10.dp))
            Text(stato, color = colore, fontSize = 13.sp)
            // La barra c’è solo mentre scarica. Prima si vedeva la sola
            // percentuale dentro una frase, e da un telefono — dove guardi
            // per due secondi — non sembrava che stesse succedendo niente.
            if (percento != null) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { percento / 100f },
                    color = colore,
                    trackColor = Banco.incisione,
                    modifier = Modifier.fillMaxWidth().height(6.dp)
                )
            }
            if (poscritto != null) {
                Spacer(Modifier.height(6.dp))
                Text(poscritto, color = Banco.testoQuieto, fontSize = 11.sp)
            }
        }
    }
}

/** L'ora di adesso, ore e minuti. Serve solo a dire «è successo, ed è successo ora». */
private fun oraDiAdesso(): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())

/** Una finestra dei limiti del piano: nome, percentuale, azzeramento, e la barra colorata. */
@Composable
private fun FinestraRiga(nome: String, f: Finestra?, spiega: String) {
    val p = if (f == null) 0 else f.percento.toInt().coerceIn(0, 100)
    val colore = if (p >= 95) Banco.rosso else if (p >= 80) Banco.ambra else Banco.accento
    val quando = f?.resettaIl?.let { " · si azzera " + java.text.SimpleDateFormat("EEE HH:mm", java.util.Locale.ITALY).format(java.util.Date(it)) } ?: ""
    Spacer(Modifier.height(6.dp))
    Row(Modifier.fillMaxWidth()) {
        Text(nome, color = Banco.testo, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(fraseFinestra(f, quando), color = Banco.testoQuieto, fontSize = 12.sp)
    }
    Spacer(Modifier.height(4.dp))
    Box(Modifier.fillMaxWidth().height(8.dp).background(Banco.chassisAlto, RoundedCornerShape(4.dp))) {
        Box(Modifier.fillMaxWidth(p / 100f).height(8.dp).background(colore, RoundedCornerShape(4.dp)))
    }
    Text(spiega, color = Banco.testoQuieto, fontSize = 11.sp)
}

@Composable
private fun QuotaRiga(nome: String, q: Quota) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(nome, color = Banco.testo, modifier = Modifier.width(90.dp))
        Text(
            "↑${tokenBrevi(q.ingresso)}  ↓${tokenBrevi(q.uscita)}  ⟳${tokenBrevi(q.cache)}  · ${q.chat} chat",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun Sezione(titolo: String) {
    Serigrafia(titolo)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Divisore() {
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
private fun VoceWorkspace(nome: String, attivo: Boolean, onClick: () -> Unit) {
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
private fun Account(account: Account?, api: Api, onCambiato: () -> Unit) {
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

/**
 * Quando sono stati letti i limiti: «alle 14:20» se è oggi, «ieri alle 14:20»,
 * altrimenti con la data. Prima era sempre «alle HH:mm», e un numero di tre
 * giorni fa sembrava di adesso.
 */
/**
 * La frase di una finestra del piano: quella del computer quando c'e' (dalla
 * 0.37, con «letto N minuti fa», «azzerata, in attesa…», «lettura vecchia»),
 * altrimenti come prima.
 */
fun fraseFinestra(f: Finestra?, quando: String = ""): String = when {
    f == null -> "non ancora letta"
    !f.etichetta.isNullOrBlank() -> f.etichetta
    else -> "${f.percento.toInt().coerceIn(0, 100)}% usato$quando"
}

/** «Portfolio · Opus 5: 42% · 84k di 200k token», con la frase del computer. */
fun rigaContesto(c: ChatConsumo): String {
    val nome = c.titolo?.ifBlank { null } ?: c.sessione.take(8)
    val modello = c.modello?.let { " · $it" } ?: ""
    return "$nome$modello: ${c.contestoEtichetta ?: c.contesto?.let { "${it.percento}%" } ?: "contesto non ancora letto"}"
}

fun quandoLetti(letti: Long, adesso: Long, zona: java.util.TimeZone = java.util.TimeZone.getDefault()): String {
    val cal = { t: Long -> java.util.Calendar.getInstance(zona).apply { timeInMillis = t } }
    val l = cal(letti); val a = cal(adesso)
    val ora = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    val stessoGiorno = { x: java.util.Calendar, y: java.util.Calendar -> x.get(java.util.Calendar.YEAR) == y.get(java.util.Calendar.YEAR) && x.get(java.util.Calendar.DAY_OF_YEAR) == y.get(java.util.Calendar.DAY_OF_YEAR) }
    if (stessoGiorno(l, a)) return "alle $ora"
    val ieri = cal(adesso).apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    if (stessoGiorno(l, ieri)) return "ieri alle $ora"
    val data = java.text.SimpleDateFormat("d MMM", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    return "il $data alle $ora (da allora nessuna chat aperta dal computer ha risposto)"
}
