package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

/**
 * La sezione «File» (PC 0.54.0, app 2.54.0).
 *
 * Nicholas (08/10): «tutta la parte file qui sul cellulare non c'è come nel
 * pc». Da qui:
 * - si sfogliano i progetti del PC accoppiato e, attraverso il ponte, degli
 *   altri PC accesi — solo dentro le cartelle dei progetti, in sola lettura;
 * - un testo o un codice si legge con il carattere a larghezza fissa, che
 *   scorre in tutte e due le direzioni; un'immagine e un PDF si guardano;
 * - si scarica (in Download/SierraDeck), si condivide con un'altra app, e si
 *   carica un file del telefono nella cartella aperta;
 * - in «Ricevuti» ci sono i file che i PC hanno mandato a questo telefono.
 * Un progetto con una chat protetta dal PIN chiede il PIN, come la chat.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SezioneFile(api: Api) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    var parte by remember { mutableStateOf(ParteFile.PROGETTI) }
    var altri by remember { mutableStateOf<List<PcRemoto>>(emptyList()) }
    var pcScelto by remember { mutableStateOf<PcRemoto?>(null) }
    LaunchedEffect(api) {
        try { val e = api.pc(); altri = e.pc.filter { it.pcId != e.io } } catch (e: CancellationException) { throw e } catch (_: Exception) { }
    }
    val apiPc = remember(api, pcScelto) { pcScelto?.let { api.suPc(it.pcId) } ?: api }
    val nomePc = pcScelto?.mostra ?: PcCorrente.nome ?: "questo PC"
    val versionePc = pcScelto?.versione ?: PcCorrente.versione

    var progetti by remember(apiPc) { mutableStateOf<List<ProgettoFile>?>(null) }
    var progetto by remember(apiPc) { mutableStateOf<ProgettoFile?>(null) }
    var elenco by remember(apiPc) { mutableStateOf<ElencoFile?>(null) }
    var errore by remember(apiPc) { mutableStateOf<String?>(null) }
    var pin by remember(apiPc) { mutableStateOf<Triple<RifiutoPin, ProgettoFile, String>?>(null) }
    var guarda by remember(apiPc) { mutableStateOf<Anteprima?>(null) }
    var nota by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf<Pair<String, Int>?>(null) }

    suspend fun carica() {
        errore = null
        progetti = try { apiPc.fileProgetti().progetti } catch (e: CancellationException) { throw e } catch (e: Exception) {
            errore = if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.FILE, nomePc) else "Non riesco a leggere i progetti di $nomePc: ${FileVista.motivo(e)}"
            emptyList()
        }
    }
    suspend fun vai(p: ProgettoFile, percorso: String) {
        errore = null; pin = null
        try {
            elenco = apiPc.fileElenco(p.percorso, percorso)
            progetto = p
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            val r = FileVista.rifiutoPin(e)
            if (r != null) pin = Triple(r, p, percorso) else errore = FileVista.motivo(e)
        }
    }
    LaunchedEffect(apiPc) { if (FunzioniPc.disponibile(FunzionePc.FILE, versionePc) != false) carica() else errore = FunzioniPc.testoMancante(FunzionePc.FILE, nomePc) }

    /** Lo scaricamento nella cache dell'app, con l'avanzamento: per guardare, salvare e condividere. */
    suspend fun inCache(v: VoceFile, massimo: Long = Long.MAX_VALUE): File? {
        val p = progetto ?: return null
        val f = cacheDi(contesto, pcScelto?.pcId, p.percorso, v)
        if (f.exists() && f.length() == v.byte) return f
        val parteF = File(f.parentFile, f.name + ".part")
        lavoro = v.nome to 0
        try {
            val e = Scaricatore.scarica(parteF, { da -> val x = apiPc.fileLeggi(p.percorso, v.percorso, da); Scaricatore.decodifica(x.dati) to x.byte }, massimo = massimo) { fatti, tot ->
                lavoro = v.nome to Allegati.percento(fatti, tot)
            }
            return when (e) {
                is Scaricatore.Esito.Fatto -> if (e.file.length() >= e.byte) { f.delete(); e.file.renameTo(f); f } else e.file
                is Scaricatore.Esito.Fallito -> { nota = "Non riesco a prendere ${v.nome}: ${e.messaggio}"; null }
            }
        } finally { lavoro = null }
    }

    val sceltaFile = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        val p = progetto ?: return@rememberLauncherForActivityResult
        val cartella = elenco?.percorso ?: ""
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val fatti = mutableListOf<String>()
            for (u in uris.take(20)) {
                val f = leggiFileScelto(contesto, u)
                try {
                    val (sha, byte) = withContext(Dispatchers.IO) { Allegati.impronta(contesto.contentResolver.openInputStream(u) ?: throw java.io.IOException("il file non si apre")) }
                    val s = SorgenteFile(f.nome, byte, sha) { contesto.contentResolver.openInputStream(u) ?: throw java.io.IOException("il file non si apre") }
                    lavoro = f.nome to 0
                    val e = Invio.manda(apiPc.trasporto(), s, DestinazioneFile("cartella", p.percorso, p.nome, cartella = cartella), "", Allegati.nuovoId()) { r, t ->
                        lavoro = f.nome to Allegati.percento(r, t)
                    }
                    fatti += when (e) {
                        is EsitoInvio.Arrivato -> "✓ ${e.nome} caricato in ${e.percorso}"
                        is EsitoInvio.Rifiutato -> "Non è arrivato ${f.nome}: ${e.messaggio}"
                    }
                } catch (e: CancellationException) { throw e } catch (e: Exception) {
                    fatti += "Non è arrivato ${f.nome}: ${e.message ?: "errore"}"
                } finally { lavoro = null }
                nota = fatti.joinToString("\n")
            }
            vai(p, cartella)
        }
    }

    BackHandler(enabled = guarda != null || pin != null || progetto != null) {
        when {
            guarda != null -> guarda = null
            pin != null -> pin = null
            elenco?.su != null -> { val p = progetto; val su = elenco?.su; if (p != null && su != null) scope.launch { vai(p, su) } }
            else -> { progetto = null; elenco = null }
        }
    }

    guarda?.let { a ->
        SchermataAnteprima(a, onChiudi = { guarda = null })
        return
    }

    Column(Modifier.fillMaxSize()) {
        // Quale parte, e quale PC.
        FlowRow(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Voce("Progetti", attiva = parte == ParteFile.PROGETTI) { parte = ParteFile.PROGETTI }
            val n = remember(Ricevuti.versione) { Ricevuti.elenca(contesto).size }
            Voce(if (n > 0) "Ricevuti · $n" else "Ricevuti", attiva = parte == ParteFile.RICEVUTI) { parte = ParteFile.RICEVUTI }
        }
        if (parte == ParteFile.RICEVUTI) {
            ParteRicevuti(onNota = { nota = it }, nota = nota)
            return@Column
        }
        if (altri.isNotEmpty()) {
            FlowRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Voce(PcCorrente.nome ?: "Questo PC", attiva = pcScelto == null) { pcScelto = null }
                for (p in altri) {
                    Voce(p.mostra + if (!p.vivo) " (spento)" else "", attiva = pcScelto?.pcId == p.pcId) {
                        if (p.vivo) pcScelto = p else nota = "${p.mostra} sembra spento: i suoi file si vedono quando è acceso."
                    }
                }
            }
            if (pcScelto != null) Text("Attraverso il ponte: il PC accoppiato chiede a ${pcScelto?.mostra} con la chiave di casa.", color = VIOLA_ALTRO_PC, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp))
        }
        lavoro?.let { (nome, pc) ->
            Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                Text("$nome: $pc%", color = Banco.testoQuieto, fontSize = 12.sp)
                LinearProgressIndicator(progress = { pc / 100f }, color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().height(3.dp))
            }
        }
        nota?.let { Text(it, color = if (it.startsWith("✓")) Banco.verde else Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) }
        errore?.let { Text(it, color = Banco.ambra, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) }

        val chiusa = pin
        if (chiusa != null) {
            var testoPin by remember(chiusa) { mutableStateOf("") }
            var erPin by remember(chiusa) { mutableStateOf<String?>(null) }
            Tessera(Modifier.fillMaxWidth().padding(12.dp)) {
                Column(Modifier.padding(14.dp)) {
                    Text("🔒 ${chiusa.first.errore}", color = Banco.testo, fontSize = 14.sp)
                    if (chiusa.first.chat != null) {
                        OutlinedTextField(
                            value = testoPin, onValueChange = { testoPin = it.filter { c -> c.isDigit() }.take(12) }, label = { Text("PIN") },
                            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                        )
                        erPin?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
                        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Voce("Sblocca", attiva = true) {
                                scope.launch {
                                    try { apiPc.sbloccaPin(chiusa.first.chat ?: "", testoPin); vai(chiusa.second, chiusa.third) } catch (e: CancellationException) { throw e } catch (e: Exception) { erPin = FileVista.motivo(e) }
                                }
                            }
                            Voce("Indietro", attiva = false) { pin = null }
                        }
                    } else Voce("Indietro", attiva = false) { pin = null }
                }
            }
            return@Column
        }

        val p = progetto
        val el = elenco
        if (p == null || el == null) {
            // I progetti di questo PC.
            val tutti = progetti
            LazyColumn(Modifier.fillMaxSize()) {
                item("spiega") {
                    Text(
                        "I progetti di $nomePc: le cartelle dove hai lavorato con Claude Code, delle chat aperte e degli autopiloti. Si vede solo quello che c'è dentro; " +
                            "un testo, un'immagine o un PDF si guardano qui, il resto si scarica o si condivide. I file che il PC ti manda sono in «Ricevuti».",
                        color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                    )
                }
                if (tutti == null) item("leggo") { Text("Leggo i progetti…", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp)) }
                else if (tutti.isEmpty() && errore == null) item("vuoto") { Text("Nessun progetto su $nomePc: compaiono le cartelle dove hai aperto almeno una chat.", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp)) }
                items(tutti ?: emptyList(), key = { it.percorso }) { x ->
                    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), onClick = { scope.launch { vai(x, "") } }) {
                        Column(Modifier.padding(12.dp)) {
                            Text((if (x.chiuso) "🔒 " else "📁 ") + x.nome, fontWeight = FontWeight.Bold, color = Banco.testo)
                            if (x.doppio || x.chiuso) Text(x.percorso + if (x.chiuso) " · protetto dal PIN di una sua chat" else "", color = Banco.testoQuieto, fontSize = 11.sp)
                        }
                    }
                }
                item("ricarica") { Row(Modifier.padding(12.dp)) { Voce("Ricarica", attiva = false) { scope.launch { progetti = null; carica() } } } }
            }
            return@Column
        }

        // Dentro una cartella.
        FlowRow(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Voce("‹ Progetti", attiva = false) { progetto = null; elenco = null }
            for ((nome, percorso) in FileVista.briciole(p.nome, el.percorso)) {
                Voce(nome, attiva = percorso == el.percorso) { scope.launch { vai(p, percorso) } }
            }
        }
        Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Voce("⬆ Carica qui", attiva = true) { sceltaFile.launch("*/*") }
            Voce("Ricarica", attiva = false) { scope.launch { vai(p, el.percorso) } }
        }
        LazyColumn(Modifier.fillMaxSize()) {
            if (el.voci.isEmpty()) item("vuota") { Text("Cartella vuota.", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp)) }
            items(el.voci, key = { it.percorso }) { v ->
                if (v.cartella) {
                    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp), onClick = { scope.launch { vai(p, v.percorso) } }) {
                        Text("📁 ${v.nome}", color = Banco.testo, modifier = Modifier.padding(12.dp))
                    }
                } else {
                    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(v.nome, color = Banco.testo, fontWeight = FontWeight.Bold)
                            Text(FileVista.misura(v.byte) + if (v.quando > 0) " · " + java.text.SimpleDateFormat("d MMM yyyy HH:mm", java.util.Locale.ITALIAN).format(java.util.Date(v.quando)) else "", color = Banco.testoQuieto, fontSize = 11.sp)
                            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                val tipo = FileVista.tipo(v.nome)
                                if (tipo != "altro") Voce("Guarda", attiva = true) {
                                    scope.launch {
                                        if (tipo != "testo" && v.byte > FileVista.ANTEPRIMA_MAX_BYTE) { nota = "${v.nome} è troppo grande per guardarlo qui (${FileVista.misura(v.byte)}): scaricalo."; return@launch }
                                        val f = inCache(v, if (tipo == "testo") FileVista.ANTEPRIMA_TESTO_BYTE else Long.MAX_VALUE) ?: return@launch
                                        guarda = Anteprima(v.nome, tipo, f, tagliato = tipo == "testo" && f.length() < v.byte)
                                    }
                                }
                                Voce("Scarica", attiva = false) {
                                    scope.launch {
                                        if (v.byte > FileVista.MAX_BYTE) { nota = "${v.nome} è di ${FileVista.misura(v.byte)}: oltre 100 MB si passa dal Drive o da un cavo."; return@launch }
                                        val f = inCache(v) ?: return@launch
                                        nota = try { "✓ ${v.nome}: salvato in " + withContext(Dispatchers.IO) { SalvaFuori.inDownload(contesto, f, v.nome) } } catch (e: Exception) { "Non sono riuscito a salvarlo: ${e.message}" }
                                    }
                                }
                                Voce("Condividi", attiva = false) {
                                    scope.launch {
                                        if (v.byte > FileVista.MAX_BYTE) { nota = "${v.nome} è di ${FileVista.misura(v.byte)}: oltre 100 MB si passa dal Drive o da un cavo."; return@launch }
                                        val f = inCache(v) ?: return@launch
                                        condividi(contesto, f, v.nome)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (el.tagliato) item("tagliato") { Text("Ci sono più di 2000 voci: qui le prime.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(14.dp)) }
            item("fondo") { Spacer(Modifier.height(24.dp)) }
        }
    }
}

private enum class ParteFile { PROGETTI, RICEVUTI }

/** Quello che si sta guardando: il file nella cache dell'app. */
data class Anteprima(val nome: String, val tipo: String, val file: File, val tagliato: Boolean = false)

/** Dove sta nella cache un file di un progetto: per PC, progetto e percorso, e per versione (grandezza e data). */
private fun cacheDi(c: Context, pcId: String?, progetto: String, v: VoceFile): File {
    val h = MessageDigest.getInstance("SHA-256").digest("${pcId ?: ""}|$progetto|${v.percorso}|${v.byte}|${v.quando}".toByteArray()).joinToString("") { "%02x".format(it) }.take(24)
    return File(File(c.cacheDir, "file/$h").apply { mkdirs() }, FileVista.nomeSicuro(v.nome))
}

private fun condividi(c: Context, f: File, nome: String) {
    val uri = FileProvider.getUriForFile(c, "${c.packageName}.file", f)
    c.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
        type = FileVista.mime(nome)
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }, "Condividi $nome").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun apriCon(c: Context, f: File, nome: String) {
    val uri = FileProvider.getUriForFile(c, "${c.packageName}.file", f)
    try {
        c.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, FileVista.mime(nome)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: android.content.ActivityNotFoundException) { }
}

/** L'anteprima a tutto schermo: testo a larghezza fissa che scorre, immagine, PDF pagina per pagina. */
@Composable
private fun SchermataAnteprima(a: Anteprima, onChiudi: () -> Unit) {
    val contesto = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(a.nome, fontWeight = FontWeight.Bold, color = Banco.testo, modifier = Modifier.weight(1f))
            Voce("Condividi", attiva = false) { if (!a.tagliato) condividi(contesto, a.file, a.nome) }
            Spacer(Modifier.width(6.dp))
            Voce("Chiudi", attiva = true) { onChiudi() }
        }
        when (a.tipo) {
            "testo" -> {
                val testo by produceState<String?>(null, a.file) {
                    value = withContext(Dispatchers.IO) { String(a.file.readBytes(), Charsets.UTF_8) }
                }
                if (a.tagliato) Text("Qui ci sono i primi ${FileVista.misura(FileVista.ANTEPRIMA_TESTO_BYTE)}: per il resto scaricalo.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp))
                SelectionContainer {
                    Text(
                        testo ?: "Apro…",
                        fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Banco.testo, softWrap = false,
                        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()).padding(12.dp)
                    )
                }
            }
            "immagine" -> {
                val bmp by produceState<Bitmap?>(null, a.file) { value = withContext(Dispatchers.IO) { leggiImmagine(a.file) } }
                Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
                    bmp?.let { Image(it.asImageBitmap(), a.nome, contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth()) }
                        ?: Text("Non riesco a mostrare questa immagine.", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp))
                }
            }
            "pdf" -> AnteprimaPdf(a.file, onApriFuori = { apriCon(contesto, a.file, a.nome) })
            else -> Text("Questo tipo di file non si guarda qui: scaricalo o condividilo.", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp))
        }
    }
}

/** Un'immagine ridotta a una misura da telefono: una foto da 50 megapixel non deve esaurire la memoria. */
private fun leggiImmagine(f: File): Bitmap? {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(f.absolutePath, o)
    var campione = 1
    while (o.outWidth / campione > 2048 || o.outHeight / campione > 4096) campione *= 2
    return BitmapFactory.decodeFile(f.absolutePath, BitmapFactory.Options().apply { inSampleSize = campione })
}

/** Il PDF pagina per pagina, con il PdfRenderer di Android (niente librerie in più). */
@Composable
private fun AnteprimaPdf(f: File, onApriFuori: () -> Unit) {
    val stato = remember(f) {
        try {
            val pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
            pfd to PdfRenderer(pfd)
        } catch (_: Exception) { null }
    }
    DisposableEffect(stato) { onDispose { try { stato?.second?.close(); stato?.first?.close() } catch (_: Exception) { } } }
    if (stato == null) {
        Column(Modifier.padding(14.dp)) {
            Text("Questo PDF non si apre qui (forse è protetto da una password).", color = Banco.testoQuieto)
            Voce("Apri con un'altra app", attiva = true) { onApriFuori() }
        }
        return
    }
    val r = stato.second
    LazyColumn(Modifier.fillMaxSize()) {
        item("conta") { Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${r.pageCount} pagine", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Voce("Apri con un'altra app", attiva = false) { onApriFuori() }
        } }
        items((0 until r.pageCount).toList(), key = { it }) { i ->
            val bmp = remember(i) {
                synchronized(r) {
                    r.openPage(i).use { pg ->
                        val scala = 1080f / pg.width
                        val b = Bitmap.createBitmap(1080, (pg.height * scala).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                        b.eraseColor(android.graphics.Color.WHITE)
                        pg.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        b
                    }
                }
            }
            Image(bmp.asImageBitmap(), "pagina ${i + 1}", contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp))
        }
    }
}

/** «Ricevuti»: i file che i PC hanno mandato a questo telefono, con Apri, Salva, Condividi e Togli. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ParteRicevuti(onNota: (String?) -> Unit, nota: String?) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    val elenco = remember(Ricevuti.versione) { Ricevuti.elenca(contesto) }
    var controllo by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize()) {
        item("spiega") {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                Text(
                    "I file che un PC ti ha mandato con «📱 Manda al telefono» o da una chat. Arrivano da soli quando l'app si collega (aperta, o ogni quindici minuti in sottofondo con la rete), " +
                        "anche se erano partiti a telefono spento; se la rete cade, riprendono da dov'erano. Stanno nell'app finché non li togli; «Salva» ne mette una copia in Download/SierraDeck.",
                    color = Banco.testoQuieto, fontSize = 12.sp
                )
                Row(Modifier.padding(top = 8.dp)) {
                    Voce(if (controllo) "Controllo…" else "Controlla adesso", attiva = true) {
                        if (controllo) return@Voce
                        controllo = true
                        scope.launch {
                            try {
                                val (n, problemi) = RicevitoreConsegne.giro(contesto)
                                onNota(when {
                                    problemi.isNotEmpty() -> problemi.joinToString("\n")
                                    n == 0 -> "Nessun file nuovo dai PC."
                                    else -> "✓ Arrivati $n file."
                                })
                            } catch (e: CancellationException) { throw e } catch (e: Exception) { onNota("Il controllo non è riuscito: ${e.message}") } finally { controllo = false }
                        }
                    }
                }
                nota?.let { Text(it, color = if (it.startsWith("✓")) Banco.verde else Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        }
        if (elenco.isEmpty()) item("vuoto") { Text("Nessun file ricevuto.", color = Banco.testoQuieto, modifier = Modifier.padding(14.dp)) }
        items(elenco, key = { it.id + it.file }) { r ->
            Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(r.nome, fontWeight = FontWeight.Bold, color = Banco.testo)
                    Text(
                        "${FileVista.misura(r.byte)} · da ${r.daPc.ifBlank { "un PC" }}" + (r.daChat?.let { " (chat «$it»)" } ?: "") + " · " +
                            java.text.SimpleDateFormat("d MMM HH:mm", java.util.Locale.ITALIAN).format(java.util.Date(r.quando)),
                        color = Banco.testoQuieto, fontSize = 11.sp
                    )
                    r.nota?.let { Text("Nota: $it", color = Banco.testo, fontSize = 12.sp) }
                    r.salvatoIn?.let { Text("Salvato in $it", color = Banco.verde, fontSize = 11.sp) }
                    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Voce("Apri", attiva = true) { try { contesto.startActivity(Ricevuti.intentApri(contesto, r)) } catch (_: Exception) { onNota("Nessuna app sa aprire ${r.nome}: prova Condividi.") } }
                        Voce("Salva", attiva = false) { scope.launch { onNota(withContext(Dispatchers.IO) { RicevitoreConsegne.salva(contesto, r.id) }) } }
                        Voce("Condividi", attiva = false) { contesto.startActivity(Ricevuti.intentCondividi(contesto, r)) }
                        Voce("Togli", attiva = false) { Ricevuti.togli(contesto, r.id) }
                    }
                }
            }
        }
        item("fondo") { Spacer(Modifier.height(24.dp)) }
    }
}
