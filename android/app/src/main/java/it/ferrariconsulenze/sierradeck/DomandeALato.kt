package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Le domande brevi a lato (PC 0.76.0). Nicholas, 16/10: se sei nella chat e
 * la domanda è breve — al massimo 200 caratteri e 4 scelte — compare lì, con i
 * tasti e «Scrivi tu»; le lunghe restano solo nella sezione Domande. La stessa
 * regola del PC e della pagina (`domandaBreve` in src/shared/domande-conversazioni.ts).
 */
object RegolaDomande {
    const val BREVE_CARATTERI = 200
    const val BREVE_SCELTE = 4
    /** I dettagli stanno dietro il «?»: contano solo oltre questo tetto largo. */
    const val DETTAGLI_MAX = 1500

    fun breve(c: Conversazione?): Boolean {
        val s = c?.scheda ?: return false
        if (!c.chiede || s.risposta != null) return false
        val scelte = s.scelte.count { !it.libera }
        val dettagli = s.dettagli.sumOf { it.testo.length }
        return s.domanda.length <= BREVE_CARATTERI && !s.domanda.endsWith("…") && scelte <= BREVE_SCELTE && dettagli <= DETTAGLI_MAX
    }

    /** La domanda breve di quella chat, se c'è. */
    fun diChat(conversazioni: List<Conversazione>, chat: String): Conversazione? =
        conversazioni.firstOrNull { it.chiave == "chat:$chat" }?.takeIf { breve(it) }
}

/** In cima alla chat aperta, quando ti chiede qualcosa di breve. Legge le Domande solo mentre la chat chiede. */
@Composable
fun DomandaBreveInCima(api: Api, chat: Chat) {
    var conv by remember(chat.id) { mutableStateOf<Conversazione?>(null) }
    var inCorso by remember(chat.id) { mutableStateOf(false) }
    var nota by remember(chat.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(chat.id, chat.chiede || chat.aspetta) {
        if (!(chat.chiede || chat.aspetta)) { conv = null; return@LaunchedEffect }
        while (isActive) {
            conv = try { RegolaDomande.diChat(api.domande().conversazioni, chat.id) } catch (e: Exception) { conv }
            delay(2500)
        }
    }
    val c = conv ?: return
    val s = c.scheda ?: return
    val manda: (suspend () -> Unit) -> Unit = { azione ->
        if (!inCorso) {
            inCorso = true
            nota = null
            scope.launch {
                try { azione(); conv = null } catch (e: Exception) { nota = "Non è andata: ${e.message ?: "il computer non risponde"}" } finally { inCorso = false }
            }
        }
    }
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 6.dp)) {
        SchedaDomandaVista(
            s, inCorso,
            if (c.risposta.via == "rispondi") "Rispondi" else "Manda",
            onScelta = { o ->
                val scelte = c.scelte
                if (o.libera) nota = "Scrivi la risposta nel campo qui sopra e premi Manda."
                else if (scelte != null) manda { api.scegli(scelte.chat, o.testo) }
                else manda { api.rispondiConversazione(c.risposta, o.testo) }
            },
            onScrivi = { t -> manda { api.rispondiConversazione(c.risposta, t) } }
        )
        nota?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    }
}
