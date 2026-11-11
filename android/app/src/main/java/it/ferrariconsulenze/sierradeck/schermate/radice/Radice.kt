package it.ferrariconsulenze.sierradeck.schermate.radice

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.nucleo.ComponiWorkspace
import it.ferrariconsulenze.sierradeck.schermate.lavoro.SchermataLavoro
import it.ferrariconsulenze.sierradeck.schermate.altro.SchermataAltro
import it.ferrariconsulenze.sierradeck.sottofondo.ToccoAvviso
import it.ferrariconsulenze.sierradeck.schermate.workspace.FonteApi
import it.ferrariconsulenze.sierradeck.schermate.workspace.SchermataWorkspace
import it.ferrariconsulenze.sierradeck.schermate.workspace.chatDelWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.PcCorrente
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Indirizzi
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.rete.Scoperta
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.vecchie.AltriComputer
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Apertura
import it.ferrariconsulenze.sierradeck.schermate.vecchie.BandaAggiornamentoApp
import it.ferrariconsulenze.sierradeck.schermate.vecchie.DialogoAggiornamentoApp
import it.ferrariconsulenze.sierradeck.schermate.vecchie.NotaGlobale
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SchermataChat
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SchermoInstallazione
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SchermoMandaA
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneAggiornamenti
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneAvvisi
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneConsumi
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneDrive
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneErroriApp
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneFile
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneInfo
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneQuadernoPersonale
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneSalute
import it.ferrariconsulenze.sierradeck.sottofondo.ErroriApp
import it.ferrariconsulenze.sierradeck.sottofondo.Installazione
import it.ferrariconsulenze.sierradeck.sottofondo.Scaricamento
import kotlinx.coroutines.launch

/**
 * La radice dell'app nuova: una riga in alto (nome del PC e una parola
 * colorata), una banda sola quando serve, il guscio della voce, la barra con
 * tre voci. Le schermate stanno nei gusci e ricevono l'`Api` e lo stato.
 *
 * I gusci oggi ospitano le schermate di prima (`schermate/vecchie`): le
 * schermate nuove prendono il loro posto una alla volta, senza toccare la radice.
 */
@Composable
fun Radice(
    scansionaQr: ((String) -> Unit, (String) -> Unit) -> Unit,
    onEsci: () -> Unit,
    vm: RadiceViewModel = viewModel(factory = RadiceViewModel.Fabbrica)
) {
    val pronta by vm.pronta.collectAsStateWithLifecycle()
    val pc by vm.pc.collectAsStateWithLifecycle()
    if (!pronta) return
    val scelto = pc
    if (scelto == null) {
        Ingresso(vm, scansionaQr)
        return
    }
    Collegata(vm, scelto, onEsci)
}

@Composable
private fun Collegata(vm: RadiceViewModel, pc: PcNoto, onEsci: () -> Unit) {
    val contesto = LocalContext.current
    val posto by vm.posto.collectAsStateWithLifecycle()
    val contatto by vm.contatto.collectAsStateWithLifecycle()
    val elenco by vm.elenco.collectAsStateWithLifecycle()
    val api = remember(pc.id, pc.chiave) { vm.api(pc) }
    val deposito = remember(pc.id, pc.chiave) { Deposito.di(pc.id, pc.chiave, contesto.filesDir) }
    val copia by deposito.stato.collectAsStateWithLifecycle()
    val collegamento = remember { Collegamento(contesto) }

    LaunchedEffect(pc.nome, pc.versione) {
        PcCorrente.nome = pc.nome
        PcCorrente.versione = pc.versione.ifBlank { null }
    }
    LaunchedEffect(api) { try { ErroriApp.mandaCoda(contesto, api) } catch (_: Exception) { } }

    BackHandler(enabled = true) { if (!vm.indietro()) onEsci() }
    // Le notifiche e le schermate di prima chiedono ancora un posto con `Apertura`.
    LaunchedEffect(Apertura.richiesta) {
        Apertura.richiesta?.let { (r, suPc) ->
            if (suPc != null && suPc != pc.id && elenco.any { it.id == suPc }) vm.scegli(suPc)
            vm.verso(r); Apertura.richiesta = null
        }
    }
    // Il tocco su una notifica (ramo delle notifiche): dove porta.
    LaunchedEffect(ToccoAvviso.richiesta) { ToccoAvviso.prendi()?.let { vm.verso(it) } }
    LaunchedEffect(Apertura.schedaRichiesta) {
        Apertura.schedaRichiesta?.let { vm.verso(it); Apertura.schedaRichiesta = null }
    }

    // Sopra tutto: mentre il computer si sostituisce non c'è altro da guardare.
    Installazione.da?.let { da ->
        SchermoInstallazione(api = api, versionePrima = Installazione.versionePrima, da = da, onEsci = { Installazione.finita(contesto) })
        return
    }
    Apertura.condivisi?.let { uris ->
        SchermoMandaA(api, copia.stato, uris, fissa = null, onChiudi = { Apertura.condivisi = null })
        return
    }

    var dialogoApp by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = Banco.fondo,
        topBar = {
            Column {
                RigaInAlto(pc, Parola.di(contatto), elenco, onRiprova = vm::riprova, onScegli = vm::scegli, onAggiungi = { vm.scegli(null) })
                Apertura.aggiornamento?.let { (nome, _) ->
                    BandaAggiornamentoApp(nome = nome, onAggiorna = { dialogoApp = true }, onChiudi = { Apertura.aggiornamento = null })
                }
            }
        },
        bottomBar = {
            BarraTre(posto.voce, domande = copia.stato?.domandeInAttesa ?: 0, onTocca = vm::tocca)
        }
    ) { spazi ->
        Box(Modifier.padding(spazi).fillMaxSize()) {
            when (posto.voce) {
                VoceBarra.LAVORO -> GuscioLavoro(pc, api, posto.dettaglio, copia, collegamento, onApri = vm::apri, onIndietro = { vm.indietro() }, onVersione = { vm.apri(Dettaglio.Sezione(SezioneAltro.AGGIORNAMENTI)) })
                VoceBarra.FILE -> SezioneFile(api)
                VoceBarra.ALTRO -> SchermataAltro(
                    api = api, chat = copia.stato?.chat.orEmpty(),
                    aperta = (posto.dettaglio as? Dettaglio.Sezione)?.sezione,
                    onApri = { vm.apri(Dettaglio.Sezione(it)) }, onIndietro = { vm.indietro() },
                    onApriChat = { vm.apri(Dettaglio.Chat(it)) },
                    onScollega = { forza -> vm.scollega(pc, forza) }
                )
            }
            NotaGlobale()
        }
    }
    if (dialogoApp) Apertura.aggiornamento?.let { (nome, apk) ->
        DialogoAggiornamentoApp(
            nome = nome, apk = apk,
            avviaScarico = { indirizzoApk, onProgresso, onGuasto -> Scaricamento.apk(contesto, indirizzoApk, onProgresso, onGuasto) },
            onChiudi = { dialogoApp = false }
        )
    }
}

/** La riga in alto: il nome del PC (tocca per cambiarlo) e una parola colorata (tocca per riprovare). */
@Composable
private fun RigaInAlto(pc: PcNoto, parola: Parola, elenco: List<PcNoto>, onRiprova: () -> Unit, onScegli: (String) -> Unit, onAggiungi: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val colore = colorePer(parola.tono)
    Row(
        Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 16.dp, vertical = 10.dp).heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.weight(1f)) {
            Text(
                pc.nome, style = MaterialTheme.typography.titleMedium, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.tocco { menu = true }.padding(vertical = 8.dp).semantics { contentDescription = "Computer: ${pc.nome}. Tocca per cambiarlo" }
            )
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                for (p in elenco) DropdownMenuItem(text = { Text(p.nome) }, onClick = { menu = false; onScegli(p.id) })
                HorizontalDivider()
                DropdownMenuItem(text = { Text("Aggiungi un computer") }, onClick = { menu = false; onAggiungi() })
            }
        }
        Row(
            Modifier.clip(CircleShape).tocco(onClick = onRiprova).padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
            Spacer(Modifier.width(8.dp))
            Text(parola.testo, style = MaterialTheme.typography.labelLarge, color = colore)
        }
    }
}

internal fun colorePer(t: Parola.Tono): Color = when (t) {
    Parola.Tono.BENE -> Banco.verde
    Parola.Tono.ATTESA -> Banco.ambra
    Parola.Tono.MALE -> Banco.rosso
}

@Composable
private fun BarraTre(voce: VoceBarra, domande: Int, onTocca: (VoceBarra) -> Unit) {
    NavigationBar(containerColor = Banco.chassis) {
        for (v in VoceBarra.entries) {
            val pallino = v == VoceBarra.LAVORO && domande > 0
            NavigationBarItem(
                selected = v == voce,
                onClick = { onTocca(v) },
                icon = {
                    Box {
                        Icon(iconaDi(v), contentDescription = null)
                        if (pallino) Box(Modifier.align(Alignment.TopEnd).size(9.dp).clip(CircleShape).background(Banco.ambra))
                    }
                },
                label = { Text(v.nome, style = MaterialTheme.typography.labelLarge) },
                modifier = Modifier.semantics { contentDescription = if (pallino) "${v.nome}, $domande domande per te" else v.nome },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Banco.accento, selectedTextColor = Banco.accento, indicatorColor = Banco.accentoTenue,
                    unselectedIconColor = Banco.testoQuieto, unselectedTextColor = Banco.testoQuieto
                )
            )
        }
    }
}

private fun iconaDi(v: VoceBarra): ImageVector = when (v) {
    VoceBarra.LAVORO -> Icons.Filled.Work
    VoceBarra.FILE -> Icons.Filled.Folder
    VoceBarra.ALTRO -> Icons.Filled.MoreHoriz
}

/**
 * Lavoro (app 11/11): le domande e i workspace; un workspace apre la sua
 * pagina (Chat · Chi lavora); una chat apre ancora il dettaglio di prima.
 */
@Composable
private fun GuscioLavoro(pc: PcNoto, api: Api, dettaglio: Dettaglio?, copia: Deposito.Copia, collegamento: Collegamento, onApri: (Dettaglio) -> Unit, onIndietro: () -> Unit, onVersione: () -> Unit) {
    when (dettaglio) {
        is Dettaglio.Chat -> {
            LaunchedEffect(dettaglio) { Apertura.chatRichiesta = dettaglio.id }
            SchermataChat(api, copia.stato, collegamento)
        }
        is Dettaglio.Autopilota -> {
            val a = copia.stato?.autopiloti?.firstOrNull { it.id == dettaglio.id }
            val nomeWs = a?.workspace
            val fonte = remember(api, dettaglio.id) { FonteApi(api, dettaglio.id) { nomeWs } }
            SchermataWorkspace(
                pc = pc.id, id = dettaglio.id,
                testa = ComponiWorkspace.testa(a, dettaglio.id, null),
                battito = copia.quando, fonte = fonte,
                chats = chatDelWorkspace(copia.stato, nomeWs ?: ""),
                onApriChat = { onApri(Dettaglio.Chat(it)) }, onIndietro = onIndietro
            )
        }
        else -> SchermataLavoro(
            pc = pc.id, stato = copia.stato, quando = copia.quando, vecchia = copia.vecchia,
            leggiDomande = { try { api.domande().conversazioni } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { null } },
            onApriWorkspace = { onApri(Dettaglio.Autopilota(it)) },
            onVersione = onVersione,
            evidenzia = (dettaglio as? Dettaglio.Domanda)?.id
        )
    }
}

/** L'accoppiamento: il QR prima di tutto, poi i PC visti sulla WiFi, poi a mano. */
@Composable
private fun Ingresso(vm: RadiceViewModel, scansionaQr: ((String) -> Unit, (String) -> Unit) -> Unit) {
    val scope = rememberCoroutineScope()
    var indirizzo by rememberSaveable { mutableStateOf("") }
    var codice by rememberSaveable { mutableStateOf("") }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val nome = Build.MODEL ?: "telefono"
    val elenco by vm.elenco.collectAsStateWithLifecycle()

    fun collega() {
        if (inCorso) return
        inCorso = true; errore = null
        scope.launch { errore = vm.accoppia(indirizzo, codice.trim(), nome); inCorso = false }
    }

    Column(
        Modifier.fillMaxSize().background(Banco.fondo).verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Spacer(Modifier.height(24.dp))
        Text("SierraDeck", style = MaterialTheme.typography.headlineSmall, color = Banco.testo)
        Text("Collega questo telefono al tuo computer.", style = MaterialTheme.typography.bodyLarge, color = Banco.testoQuieto)
        Button(
            onClick = {
                scansionaQr({ letto ->
                    indirizzo = letto.substringBefore('#')
                    val c = letto.substringAfter("codice=", "").takeWhile { it.isDigit() }.take(6)
                    if (c.length == 6) { codice = c; collega() }
                }, { g -> errore = g })
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)
        ) { Text("Inquadra il codice sul computer") }

        val vicini = Scoperta.trovati
        if (vicini.isNotEmpty()) {
            Text("Sulla tua WiFi", style = MaterialTheme.typography.labelLarge, color = Banco.testoQuieto)
            for (t in vicini) OutlinedButton(onClick = { indirizzo = t.indirizzo }, modifier = Modifier.fillMaxWidth()) { Text(Indirizzi.hostDi(t.indirizzo)) }
        }
        OutlinedTextField(indirizzo, { indirizzo = it }, label = { Text("Indirizzo del computer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            codice, { n -> codice = n.filter { it.isDigit() }.take(6) }, label = { Text("Codice a sei cifre") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth()
        )
        errore?.let { Text(it, color = Banco.rosso, style = MaterialTheme.typography.bodyMedium) }
        Button(onClick = ::collega, enabled = !inCorso, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Text(if (inCorso) "Mi collego…" else "Collega")
        }
        if (elenco.isNotEmpty()) {
            HorizontalDivider()
            Text("Già accoppiati", style = MaterialTheme.typography.labelLarge, color = Banco.testoQuieto)
            for (p in elenco) TextButton(onClick = { vm.scegli(p.id) }, modifier = Modifier.fillMaxWidth()) { Text(p.nome) }
        }
    }
}
