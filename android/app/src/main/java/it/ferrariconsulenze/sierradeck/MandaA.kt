package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/**
 * «Manda a…» (PC 0.50.0, app 2.50.0): i file condivisi con SierraDeck da
 * un'altra app (Condividi → SierraDeck), o scelti con «📎 Allega» in una chat
 * o in un autopilota.
 *
 * Le destinazioni: prima quelle usate di recente, poi le chat di questo PC,
 * i suoi autopiloti, e le chat degli altri PC accesi (attraverso il ponte,
 * con il viola «SU <PC>»). Un campo per la nota, facoltativo. Ogni file va a
 * pezzi con la sua barra; se la rete cade riparte da dove era, e alla fine il
 * PC dice «arrivato» con il percorso nel progetto.
 */
data class FileScelto(val uri: Uri, val nome: String, val byte: Long)

/**
 * I file che un'altra app condivide con SierraDeck. Solo `content://` di
 * altre app: un `file://`, o un `content://` di SierraDeck stessa, potrebbe
 * indicare i file privati dell'app (le chiavi): non si mandano mai.
 */
object Condivisione {
    fun uriDa(intent: android.content.Intent): List<Uri> {
        val fuori = mutableListOf<Uri>()
        if (intent.action == android.content.Intent.ACTION_SEND) {
            androidx.core.content.IntentCompat.getParcelableExtra(intent, android.content.Intent.EXTRA_STREAM, Uri::class.java)?.let { fuori += it }
        } else {
            androidx.core.content.IntentCompat.getParcelableArrayListExtra(intent, android.content.Intent.EXTRA_STREAM, Uri::class.java)?.let { fuori += it }
        }
        intent.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { if (it !in fuori) fuori += it } }
        return fuori.filter { ammessa(it.scheme, it.authority) }.take(20)
    }

    /** Pura, per i test: solo `content://` di un'altra app. */
    fun ammessa(schema: String?, autorita: String?): Boolean =
        schema == "content" && autorita != null && !autorita.startsWith("it.ferrariconsulenze.sierradeck")
}

/** Le destinazioni usate di recente, sul telefono: chiave → quando. */
class RecentiAllegati(contesto: Context) {
    private val p = contesto.getSharedPreferences("sierradeck-allegati", Context.MODE_PRIVATE)
    fun leggi(): Map<String, Long> = try {
        val o = JSONObject(p.getString("recenti", "{}") ?: "{}")
        o.keys().asSequence().associateWith { o.getLong(it) }
    } catch (_: Exception) { emptyMap() }
    fun usata(chiave: String) {
        val tenute = (leggi() + (chiave to System.currentTimeMillis())).entries.sortedByDescending { it.value }.take(12)
        p.edit().putString("recenti", JSONObject().apply { tenute.forEach { put(it.key, it.value) } }.toString()).apply()
    }
}

/** Nome e grandezza di un `content://` (la grandezza può mancare: allora -1, e la conta l'impronta). */
fun leggiFileScelto(contesto: Context, uri: Uri): FileScelto {
    var nome = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
    var byte = -1L
    try {
        contesto.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val s = c.getColumnIndex(OpenableColumns.SIZE)
                if (n >= 0 && !c.isNull(n)) nome = c.getString(n)
                if (s >= 0 && !c.isNull(s)) byte = c.getLong(s)
            }
        }
    } catch (_: Exception) { }
    return FileScelto(uri, nome, byte)
}

private class StatoFile(val f: FileScelto) {
    var percento by mutableStateOf<Int?>(null)
    var esito by mutableStateOf<String?>(null)
    var ok by mutableStateOf(false)
    var codice by mutableStateOf<Int?>(null)
    /** Lo stesso fra un «Riprova» e l'altro: il PC riparte da dove era. */
    val id = Allegati.nuovoId()
}

@Composable
fun SchermoMandaA(api: Api, stato: Stato?, uris: List<Uri>, fissa: DestinazioneFile? = null, onChiudi: () -> Unit) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    val file = remember(uris) { mutableStateListOf<StatoFile>() }
    LaunchedEffect(uris) {
        val letti = withContext(Dispatchers.IO) { uris.map { leggiFileScelto(contesto, it) } }
        file.clear(); file.addAll(letti.map { StatoFile(it) })
    }
    var nota by remember { mutableStateOf("") }
    var destinazioni by remember { mutableStateOf<List<DestinazioneFile>?>(if (fissa != null) listOf(fissa) else null) }
    var scelta by remember { mutableStateOf(fissa) }
    var mandando by remember { mutableStateOf(false) }
    var pin by remember { mutableStateOf("") }
    var notaPin by remember { mutableStateOf<String?>(null) }
    val recenti = remember { RecentiAllegati(contesto) }

    // Le destinazioni: questo PC subito, gli altri PC accesi attraverso il ponte.
    LaunchedEffect(Unit) {
        if (fissa != null) return@LaunchedEffect
        destinazioni = Allegati.ordina(Allegati.destinazioni(stato, emptyList()), recenti.leggi())
        if (FunzioniPc.disponibile(FunzionePc.PONTE, PcCorrente.versione) == false) return@LaunchedEffect
        val altri = try {
            val e = api.pc()
            coroutineScope {
                e.pc.filter { it.vivo && it.pcId != e.io }.map { p ->
                    async { PcPonte(p.pcId, p.nome) to withTimeoutOrNull(8_000) { try { api.suPc(p.pcId).stato() } catch (_: Exception) { null } } }
                }.awaitAll()
            }
        } catch (_: Exception) { emptyList() }
        destinazioni = Allegati.ordina(Allegati.destinazioni(stato, altri), recenti.leggi())
    }

    fun apiPer(d: DestinazioneFile): Api = d.pcId?.let { api.suPc(it) } ?: api

    fun manda(d: DestinazioneFile) {
        scelta = d
        mandando = true
        notaPin = null
        recenti.usata(d.chiave)
        scope.launch {
            for (s in file.toList()) {
                if (s.ok) continue
                val no = Allegati.controlla(s.f.nome, s.f.byte)
                if (no != null) { s.esito = no; continue }
                s.esito = null; s.codice = null; s.percento = 0
                val esito = withContext(Dispatchers.IO) {
                    try {
                        val (sha, byte) = Allegati.impronta(contesto.contentResolver.openInputStream(s.f.uri) ?: throw java.io.IOException("il file non si apre"))
                        val sorgente = SorgenteFile(s.f.nome, byte, sha) { contesto.contentResolver.openInputStream(s.f.uri) ?: throw java.io.IOException("il file non si apre") }
                        Invio.manda(apiPer(d).trasporto(), sorgente, d, nota, s.id, onAvanzamento = { r, b -> s.percento = Allegati.percento(r, b) })
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e
                    } catch (e: Exception) { EsitoInvio.Rifiutato(-1, "Non riesco a leggere il file sul telefono: ${e.message ?: "errore"}") }
                }
                when (esito) {
                    is EsitoInvio.Arrivato -> { s.ok = true; s.percento = 100; s.esito = Allegati.testoArrivato(esito) }
                    is EsitoInvio.Rifiutato -> {
                        s.codice = esito.codice
                        s.esito = if (esito.codice == 404 && esito.messaggio == "non trovato" || esito.codice == 409 && esito.messaggio.contains("0.50.0")) FunzioniPc.testoMancante(FunzionePc.ALLEGATI)
                        else esito.messaggio
                    }
                }
            }
            mandando = false
        }
    }

    Dialog(onDismissRequest = { if (!mandando) onChiudi() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Banco.fondo).padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (fissa != null) "Manda a «${fissa.titolo}»" else "Manda a…", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                TextButton(enabled = !mandando, onClick = onChiudi) { Text(if (file.isNotEmpty() && file.all { it.ok }) "Fatto" else "Chiudi") }
            }
            Text(
                "Il file finisce nella cartella del progetto di quella chat (o dell'autopilota), in .sierradeck/allegati/ con la data di oggi, fuori da git: SierraDeck non lo apre e non lo esegue. La chat riceve una riga corta che glielo dice; l'autopilota lo trova nel suo dialogo. Fino a 100 MB per file; i programmi (.exe, .bat…) no. Tieni l'app aperta finché non vedi «Arrivato»: se la rete cade riparte da dove era.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
            Spacer(Modifier.height(8.dp))
            for (s in file) {
                Column(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text("${s.f.nome}" + (if (s.f.byte >= 0) " · ${Allegati.inMb(s.f.byte)}" else ""), color = Banco.testo, fontSize = 13.sp, maxLines = 1)
                    s.percento?.let { p ->
                        if (!s.ok && s.esito == null) LinearProgressIndicator(progress = { p / 100f }, color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().height(5.dp))
                    }
                    s.esito?.let { Text(it, color = if (s.ok) Banco.verde else Banco.rosso, fontSize = 12.sp) }
                }
            }
            if (file.isEmpty()) Text("Leggo i file…", color = Banco.testoQuieto, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = nota, onValueChange = { nota = it.take(500) },
                label = { Text("Nota per la chat (facoltativa)") },
                maxLines = 3, enabled = !mandando, modifier = Modifier.fillMaxWidth()
            )
            // Una chat protetta dal PIN e chiusa per questo telefono: il PIN qui, poi si rimanda.
            val d = scelta
            if (d != null && file.any { it.codice == 423 }) {
                Spacer(Modifier.height(6.dp))
                Text("Chat protetta: inserisci il PIN. Lo controlla il computer di quella chat.", color = Banco.ambra, fontSize = 12.sp)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = pin, onValueChange = { pin = PinChat.pulisci(it) }, placeholder = { Text("PIN") }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.width(140.dp)
                    )
                    Button(enabled = PinChat.pinValido(pin) && !mandando, onClick = {
                        scope.launch {
                            try { apiPer(d).sbloccaPin(d.id, pin); pin = ""; manda(d) } catch (e: Exception) { notaPin = PinChat.messaggio(e); pin = "" }
                        }
                    }) { Text("Apri e rimanda") }
                }
                notaPin?.let { Text(it, color = Banco.rosso, fontSize = 12.sp) }
            }
            Spacer(Modifier.height(8.dp))
            if (fissa != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = !mandando && file.isNotEmpty() && !file.all { it.ok }, onClick = { manda(fissa) }) {
                        Text(if (mandando) "Mando…" else if (file.any { it.esito != null && !it.ok }) "Riprova" else "Manda")
                    }
                }
            } else {
                val lista = destinazioni
                when {
                    lista == null -> Text("Cerco le chat…", color = Banco.testoQuieto)
                    lista.isEmpty() -> Text("Nessuna chat aperta e nessun autopilota sul computer: aprine una e riprova.", color = Banco.testoQuieto)
                    else -> {
                        if (scelta != null && file.any { it.esito != null && !it.ok } && !mandando) {
                            OutlinedButton(onClick = { scelta?.let { manda(it) } }) { Text("Riprova verso «${scelta?.titolo}»") }
                            Spacer(Modifier.height(6.dp))
                        }
                        val recentiOra = recenti.leggi()
                        LazyColumn(Modifier.weight(1f)) {
                            items(lista, key = { it.chiave + it.id }) { x ->
                                val recente = recentiOra.containsKey(x.chiave)
                                Tessera(Modifier.fillMaxWidth().padding(vertical = 3.dp), onClick = { if (!mandando && !file.all { it.ok }) manda(x) }) {
                                    Column(Modifier.padding(10.dp)) {
                                        if (x.pcId != null) Text("SU ${(x.pcNome ?: x.pcId).uppercase()}", color = VIOLA_ALTRO_PC, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                        Text(
                                            (if (x.tipo == "autopilota") "🤖 " else "") + x.titolo + (if (x.protetta) " 🔒" else ""),
                                            color = if (scelta == x) Banco.accento else Banco.testo, fontSize = 14.sp, maxLines = 1
                                        )
                                        Text(
                                            listOfNotNull(
                                                if (recente) "recente" else null,
                                                if (x.tipo == "autopilota") "autopilota: lo trova nel dialogo" else if (x.pcId != null) "chat di un altro PC, attraverso il PC accoppiato" else "chat di questo PC",
                                                if (x.aspetta) "aspetta te" else null
                                            ).joinToString(" · "),
                                            color = Banco.testoQuieto, fontSize = 11.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
