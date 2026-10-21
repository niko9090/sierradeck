package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * **Le chat in sottofondo** (PC 0.58.4, app 2.58.4, decisione di Nicholas).
 *
 * Una conversazione che vive su un altro PC ed è chiusa là si usa dal
 * telefono senza aprirla a schermo là: quel PC la avvia in sottofondo (niente
 * finestre, niente cambio di workspace), il messaggio aspetta in coda e parte
 * appena la chat è pronta. Poi la si trova fra le chat di quel PC.
 */
@Serializable
data class ChiUsa(val id: String = "", val nome: String = "")

/** La risposta di `/api/sottofondo/avvia` e `/api/sottofondo/stato` (src/shared/sottofondo.ts). */
@Serializable
data class StatoSottofondo(
    val sessione: String = "",
    val chat: String = "",
    val fase: String = "",
    val messaggio: String = "",
    val inCoda: Int = 0,
    val consegnati: List<String> = emptyList(),
    val perChi: ChiUsa = ChiUsa(),
    val titolo: String = "",
    val cwd: String = "",
    val dal: String = ""
)

object Sottofondo {
    /** Le stesse parole del PC e della pagina (`testoAvvio` in src/shared/sottofondo.ts). */
    fun testoAvvio(fase: String, pc: String, conTesto: Boolean): String {
        val dopo = if (conTesto) " Il tuo messaggio parte appena è pronta." else ""
        return when (fase) {
            "chiedo" -> "Chiedo a $pc di avviare questa chat in sottofondo…$dopo"
            "avvio" -> "La sto avviando su $pc, in sottofondo (là non si apre nessuna finestra)…$dopo"
            "lenta" -> "Su $pc Claude Code ci sta mettendo più del solito a partire: aspetto ancora.$dopo"
            "consegna" -> "Chat pronta su $pc: sto scrivendo il tuo messaggio."
            "pronta" -> if (conTesto) "Chat pronta su $pc: il tuo messaggio parte adesso." else "Chat pronta su $pc, in sottofondo: scrivile qui."
            "lavora" -> "Messaggio consegnato: la chat lavora su $pc."
            "aspetta" -> "La chat su $pc ha finito e aspetta."
            "scelta" -> "La chat su $pc aspetta una scelta: le opzioni sono qui sotto."
            "chiusa" -> "La chat su $pc si è chiusa."
            else -> "Non sono riuscito ad avviarla su $pc."
        }
    }

    /** Il testo è arrivato? */
    fun consegnato(s: StatoSottofondo?, id: String?): Boolean = s != null && id != null && id in s.consegnati

    /** Finito di aspettare: il testo consegnato, o (senza testo) la chat pronta. */
    fun finito(s: StatoSottofondo, id: String?): Boolean =
        if (id != null) consegnato(s, id) else s.fase in setOf("pronta", "aspetta", "lavora")

    /**
     * Il perché di un rifiuto, per esteso. Un PC vecchio non conosce la rotta:
     * 404 da lui, o 403 dal ponte di un PC accoppiato vecchio.
     */
    fun perche(codice: Int, corpo: String, pc: String): String {
        val errore = Regex("\"errore\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(corpo)?.groupValues?.get(1)?.replace("\\\"", "\"")
        return when {
            codice == 404 || (codice == 403 && corpo.contains("/api/sottofondo")) ->
                "$pc (o il PC a cui è collegato il telefono) ha una versione che non sa avviare le chat in sottofondo: va aggiornato alla 0.58.4."
            codice == 423 -> "La chat è protetta dal PIN: aprila prima con il PIN dal PC."
            errore != null && errore.isNotBlank() -> errore
            codice == 502 || codice == 504 -> "$pc non risponde adesso: riprova fra poco."
            else -> "$pc ha risposto $codice."
        }
    }

    fun nuovoId(): String = "a-" + java.lang.Long.toString(System.currentTimeMillis(), 36) + java.lang.Long.toString((Math.random() * 1e9).toLong(), 36)
}

/** Lo stato del dialogo: la fase, il messaggio di quel PC, il testo in attesa. */
private data class Avvio(val fase: String, val messaggio: String = "", val testo: String? = null, val id: String? = null)

/**
 * Scrivere a una conversazione chiusa su un altro PC: il dialogo con il campo,
 * lo stato mentre parte là, e se fallisce il perché con «Riprova».
 */
@Composable
fun DialogoSottofondo(api: Api, s: SessioneRipresa, onChiudi: () -> Unit) {
    val pc = s.altrove ?: "quel PC"
    val apiPc = remember(s.altrovePc) { api.suPc(s.altrovePc ?: "") }
    var testo by remember { mutableStateOf("") }
    var avvio by remember { mutableStateOf<Avvio?>(null) }
    val scope = rememberCoroutineScope()

    fun invia(t: String?, idPrima: String?) {
        val id = if (t != null) idPrima ?: Sottofondo.nuovoId() else null
        avvio = Avvio("chiedo", testo = t, id = id)
        scope.launch {
            avvio = try {
                val r = apiPc.avviaSottofondo(s.cwd, s.id, s.titolo, t, id)
                if (Sottofondo.finito(r, id)) Avvio("fatto", r.messaggio, t, id) else Avvio(r.fase, r.messaggio, t, id)
            } catch (e: Api.Errore) {
                Avvio("errore", Sottofondo.perche(e.codice, e.corpo, pc), t, id)
            } catch (e: Exception) {
                Avvio("errore", e.message ?: "$pc non risponde", t, id)
            }
        }
    }

    // Segue lo stato là finché il testo non è consegnato (al massimo quattro minuti).
    val inCorso = avvio?.fase?.let { it != "errore" && it != "fatto" } == true
    LaunchedEffect(inCorso) {
        if (!inCorso) return@LaunchedEffect
        val inizio = System.currentTimeMillis()
        while (true) {
            delay(2000)
            val a = avvio ?: break
            if (a.fase == "errore" || a.fase == "fatto") break
            try {
                val st = apiPc.statoSottofondo(s.id)
                avvio = when {
                    Sottofondo.finito(st, a.id) -> a.copy(fase = "fatto", messaggio = st.messaggio)
                    st.fase == "chiusa" -> a.copy(fase = "errore", messaggio = st.messaggio)
                    else -> a.copy(fase = st.fase, messaggio = st.messaggio)
                }
            } catch (_: Exception) { /* al giro dopo */ }
            if (System.currentTimeMillis() - inizio > 240_000 && avvio?.fase != "fatto") {
                avvio = avvio?.copy(fase = "errore", messaggio = "dopo quattro minuti il messaggio non risulta ancora consegnato")
                break
            }
        }
    }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { TitoloDialogo("Scrivi a «${s.titolo.ifBlank { s.cwd }}» su $pc", "Questa conversazione vive su $pc. Quel PC la avvia in sottofondo: claude --resume nella sua cartella, senza riquadro e senza finestre — là non si vede niente e non cambia il workspace. Il messaggio aspetta in coda e parte appena la chat è pronta; poi la trovi fra le chat di $pc e la segui da lì.") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                Spacer(Modifier.height(8.dp))
                val a = avvio
                if (a != null) {
                    val riga = if (a.fase == "fatto") (if (a.testo != null) "Messaggio consegnato: la chat gira su $pc in sottofondo." else "Chat pronta su $pc, in sottofondo.") else Sottofondo.testoAvvio(a.fase, pc, a.testo != null)
                    Text(riga, color = if (a.fase == "errore") Banco.ambra else Banco.testo, fontSize = 13.sp)
                    if (a.messaggio.isNotBlank()) Text(if (a.fase == "errore") "Perché: ${a.messaggio}" else "Da $pc: ${a.messaggio}", color = Banco.testoQuieto, fontSize = 12.sp)
                    if (a.testo != null && a.fase != "fatto") Text("Il tuo messaggio, in attesa: «${a.testo.take(160)}». Non si perde: Riprova lo rimanda una volta sola.", color = Banco.testoQuieto, fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                }
                OutlinedTextField(
                    value = testo,
                    onValueChange = { testo = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Il messaggio: parte appena è pronta là") },
                    minLines = 3
                )
                if (a?.fase == "errore") TextButton(onClick = { invia(a.testo, a.id) }) { Text("Riprova") }
                TextButton(onClick = { invia(null, null) }, enabled = !inCorso) { Text("Avvia senza scrivere") }
            }
        },
        confirmButton = {
            TextButton(onClick = { val t = testo.trim(); if (t.isNotEmpty()) { testo = ""; invia(t, null) } }, enabled = testo.isNotBlank()) { Text("Manda") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
}
