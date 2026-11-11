package it.ferrariconsulenze.sierradeck.sottofondo

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
import it.ferrariconsulenze.sierradeck.BuildConfig
import it.ferrariconsulenze.sierradeck.rete.Api

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
data class StoricoErroriPc(val voci: List<VoceErroreApp> = emptyList(), val testo: String = "", val pcSviluppo: String? = null, val arrivi: String? = null)

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
