package it.ferrariconsulenze.sierradeck

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Una voce dello storico degli errori del PC (PC 0.81.0, `src/shared/storico-errori.ts`). */
@Serializable
data class VoceErroreApp(
    val quando: String = "",
    val ultima: String = "",
    val dove: String = "pc",
    val volte: Int = 1,
    val cosa: String? = null,
    val messaggio: String = "",
    val punto: String? = null,
    val versione: String? = null
)

/** Quello che `POST /api/errori` risponde: le voci, il testo di «Copia», il PC di sviluppo scelto sul PC. */
@Serializable
data class StoricoErroriPc(val voci: List<VoceErroreApp> = emptyList(), val testo: String = "", val pcSviluppo: String? = null)

@Serializable
data class EsitoInvioErrori(val ok: Boolean = false, val messaggio: String = "")

/** Un errore dell'app che aspetta di andare al PC. */
@Serializable
data class ErroreDaMandare(val testo: String, val cosa: String? = null)

/**
 * Lo storico degli errori dall'app (app 2.81.0).
 *
 * L'app non tiene uno storico suo: gli errori che vede (per ora quelli che la
 * chiuderebbero, presi da [Guasti]) aspettano in una coda corta e vanno al PC
 * accoppiato, che li mette nel suo storico con «app» come posto e toglie i
 * segreti. La voce «Errori» mostra lo storico del PC, con «Copia» e «Manda al
 * PC di sviluppo», come sulla pagina.
 */
object ErroriApp {
    private const val FILE = "errori-da-mandare.json"
    /** Quanti ne aspettano al massimo: il PC ne accetta venti per richiesta. */
    const val MASSIMO = 20

    private val json = Json { ignoreUnknownKeys = true }

    /** La coda dopo un errore nuovo: in fondo, mai oltre [MASSIMO] (gli ultimi arrivati si perdono, i primi restano). */
    fun conNuovo(coda: List<ErroreDaMandare>, nuovo: ErroreDaMandare): List<ErroreDaMandare> =
        if (coda.size >= MASSIMO) coda else coda + nuovo.copy(testo = nuovo.testo.take(2600), cosa = nuovo.cosa?.take(240))

    fun leggi(contesto: Context): List<ErroreDaMandare> = try {
        val f = File(contesto.filesDir, FILE)
        if (f.exists()) json.decodeFromString<List<ErroreDaMandare>>(f.readText()) else emptyList()
    } catch (e: Exception) {
        emptyList()
    }

    private fun scrivi(contesto: Context, coda: List<ErroreDaMandare>) {
        try {
            File(contesto.filesDir, FILE).writeText(json.encodeToString(coda))
        } catch (e: Exception) {
            // Una coda che non si scrive perde un errore: meno grave che fermare l'app.
        }
    }

    fun annota(contesto: Context, testo: String, cosa: String? = null) {
        scrivi(contesto, conNuovo(leggi(contesto), ErroreDaMandare(testo, cosa)))
    }

    /** Manda la coda al PC; se il PC non risponde resta per il prossimo giro. */
    suspend fun mandaCoda(contesto: Context, api: Api) {
        val coda = leggi(contesto)
        if (coda.isEmpty()) return
        try {
            api.aggiungiErrori(BuildConfig.VERSION_NAME, coda)
            scrivi(contesto, leggi(contesto).drop(coda.size))
        } catch (e: Exception) {
            // Il PC non risponde, o è di prima della 0.81.0: si riprova.
        }
    }

    /** «3 errori diversi, 7 volte», come sul PC e sulla pagina. */
    fun conto(voci: List<VoceErroreApp>): String {
        if (voci.isEmpty()) return "Nessun errore registrato"
        val volte = voci.sumOf { it.volte }
        return "${voci.size} ${if (voci.size == 1) "errore" else "errori diversi"}, $volte ${if (volte == 1) "volta" else "volte"}"
    }

    private val ora = DateTimeFormatter.ofPattern("dd/MM HH:mm")
    fun oraBreve(iso: String, zona: ZoneId = ZoneId.systemDefault()): String =
        try { ora.format(Instant.parse(iso).atZone(zona)) } catch (e: Exception) { iso }
}

/** La voce «Errori» delle Impostazioni dell'app. */
@Composable
fun SezioneErroriApp(api: Api) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    var storico by remember { mutableStateOf<StoricoErroriPc?>(null) }
    var nota by remember { mutableStateOf<String?>(null) }
    var mando by remember { mutableStateOf(false) }
    val leggi: () -> Unit = {
        scope.launch {
            ErroriApp.mandaCoda(contesto, api)
            try { storico = api.storicoErrori(); nota = null } catch (e: Exception) { nota = "Lo storico non si legge adesso: ${e.message ?: "riprova"}" }
        }
    }
    Column(Modifier.padding(horizontal = 16.dp)) {
        RigaConAiuto(
            storico?.let { ErroriApp.conto(it.voci) } ?: "Errori",
            "Gli errori del computer, del servizio degli autopiloti, della pagina e di quest’app: quando, dove, cosa si stava facendo, il messaggio e il punto del codice. Gli stessi errori ripetuti sono una riga sola. Password, chiavi e gettoni sono tolti prima di salvare.",
            "Errori"
        )
        val s = storico
        if (s == null) {
            TextButton(onClick = leggi) { Text("Vedi gli errori") }
        } else {
            for (v in s.voci.take(5)) {
                Text(
                    ErroriApp.oraBreve(v.ultima) + (if (v.volte > 1) " · ${v.volte} volte" else "") + " · " + v.messaggio,
                    color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(vertical = 2.dp)
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = leggi) { Text("Aggiorna") }
                TextButton(enabled = s.voci.isNotEmpty(), onClick = {
                    val cm = contesto.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("SierraDeck", s.testo))
                    nota = "Copiato: incollalo nella chat che deve correggerli."
                }) { Text("Copia") }
                TextButton(enabled = !mando && s.voci.isNotEmpty() && s.pcSviluppo != null, onClick = {
                    mando = true
                    scope.launch {
                        nota = try { api.mandaErrori().messaggio } catch (e: Exception) { "Non mandati: ${e.message ?: "il computer non ha risposto"}" }
                        mando = false
                    }
                }) { Text(if (mando) "Mando…" else "Manda al PC di sviluppo") }
                Aiuto("Il computer manda lo storico al PC di sviluppo, firmato con la chiave di casa. Là arriva nella cartella di SierraDeck, in .sierradeck/errori-arrivati, che non va mai su GitHub.", "Manda al PC di sviluppo")
            }
            Text(
                s.pcSviluppo?.let { "PC di sviluppo: $it" } ?: "Il PC di sviluppo si sceglie sul computer, in Impostazioni → Errori.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
        }
        nota?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)) }
    }
}
