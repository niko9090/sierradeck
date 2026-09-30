package it.ferrariconsulenze.sierradeck

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Quello che non può aspettare, dove stai già guardando.
 *
 * Prima c'era una scheda apposta, «Adesso». Era vuota quasi sempre, e quando
 * non lo era diceva cose urgenti in una stanza in fondo al corridoio: dovevi
 * andarci tu, e proprio nel momento in cui contava. Le urgenze si portano a chi
 * guarda.
 *
 * Quindi: niente, il 90% del tempo. E quando c'è qualcosa, una banda in cima a
 * qualunque schermata, del colore di ciò che sta succedendo — ambra per una
 * domanda che aspetta, rosso per un autopilota fermo, rosso per il computer che
 * non risponde. Un tocco e si fa la cosa, senza cambiare pagina.
 */
/**
 * Che cosa va in banda, deciso senza Compose (cosi' si prova).
 *
 * Fino alla 2.37 la banda guardava solo le domande degli autopiloti: una chat
 * ferma su un permesso («posso scrivere questo file?») accendeva il pallino di
 * «Domande» ma **non** la banda — cioe' la cosa che blocca di piu' era l'unica
 * che non si portava a chi guarda. Adesso le scelte delle chat contano come
 * le domande.
 */
enum class TipoUrgenza { SCOLLEGATO, DOMANDE, FERMI, PRONTI }

data class Urgenza(
    val tipo: TipoUrgenza,
    val titolo: String,
    val sotto: String,
    /** Il testo del tasto, o `null` se non c'e' niente da premere. */
    val azione: String?
)

fun urgenzaDi(stato: Stato?, connesso: Boolean): Urgenza? {
    if (!connesso) {
        // Prima di aver mai parlato con il computer non si grida: c'e' gia' la
        // pillola in cima che dice «non collegato».
        if (stato == null) return null
        return Urgenza(
            TipoUrgenza.SCOLLEGATO,
            "Non parlo con il computer",
            "Da qualche secondo non risponde. Controlla che SierraDeck sia acceso e che il telefono sia sulla stessa rete (o su Tailscale). Quello che vedi sotto è l'ultima cosa che ha detto.",
            null
        )
    }
    val s = stato ?: return null
    val domande = s.domande
    val scelte = s.chat.filter { it.chiede }
    val quante = domande.size + scelte.size
    if (quante > 0) {
        val titolo = when {
            quante > 1 -> "$quante cose aspettano una tua risposta"
            domande.isNotEmpty() -> "Un autopilota ti sta chiedendo una cosa"
            else -> "«${scelte.first().titolo.ifBlank { scelte.first().cwd }}» aspetta che tu scelga"
        }
        val sotto = domande.firstOrNull()?.testo?.takeIf { it.isNotBlank() }
            ?: "Sullo schermo c'è un elenco di scelte (un permesso, «vuoi procedere?»): la chat è ferma finché non tocchi un'opzione."
        return Urgenza(TipoUrgenza.DOMANDE, titolo, sotto, "Vedi")
    }
    val fermi = s.autopiloti.filter { it.stato == "sospeso" || it.stato == "fallito" }
    if (fermi.isNotEmpty()) {
        return Urgenza(
            TipoUrgenza.FERMI,
            if (fermi.size == 1) "«${fermi.first().nome}» si è fermato" else "${fermi.size} autopiloti fermi",
            fermi.first().motivo.ifBlank { "Aspetta che tu lo rimetta in moto." },
            "Riprendi"
        )
    }
    val pronti = s.autopiloti.filter { it.stato == "pronto" }
    if (pronti.isNotEmpty()) {
        return Urgenza(
            TipoUrgenza.PRONTI,
            if (pronti.size == 1) "«${pronti.first().nome}» si è preparato e aspetta il tuo via"
            else "${pronti.size} autopiloti si sono preparati e aspettano il tuo via",
            "Ha letto il progetto e ha capito l'obiettivo. Non comincia finché non glielo dici: «Vai» lo fa partire.",
            "Vai"
        )
    }
    return null
}

@Composable
fun BandaUrgenze(api: Api, stato: Stato?, connesso: Boolean, onApriDomande: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val urgenza = urgenzaDi(stato, connesso)
    val colore: Color = when (urgenza?.tipo) {
        TipoUrgenza.SCOLLEGATO, TipoUrgenza.FERMI -> Banco.rosso
        else -> Banco.ambra
    }
    val onAzione: () -> Unit = when (urgenza?.tipo) {
        // Niente piu' finestra che blocca: la domanda si legge e si risponde
        // nella scheda «Domande», insieme a tutte le altre.
        TipoUrgenza.DOMANDE -> onApriDomande
        TipoUrgenza.FERMI -> {
            {
                val fermi = stato?.autopiloti?.filter { it.stato == "sospeso" || it.stato == "fallito" } ?: emptyList()
                scope.launch { for (ap in fermi) tenta("riprendere «${ap.nome}»") { api.riprendiAutopilota(ap.id) } }
            }
        }
        TipoUrgenza.PRONTI -> {
            {
                val pronti = stato?.autopiloti?.filter { it.stato == "pronto" } ?: emptyList()
                scope.launch { for (ap in pronti) tenta("far partire «${ap.nome}»") { api.vaiAutopilota(ap.id) } }
            }
        }
        else -> { {} }
    }

    AnimatedVisibility(
        visible = urgenza != null,
        enter = expandVertically(),
        exit = shrinkVertically()
    ) {
        urgenza?.let { u ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(colore.copy(alpha = 0.14f))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Il filetto di colore a sinistra: si riconosce con la coda
                // dell'occhio, prima ancora di leggere.
                Column(
                    Modifier.width(3.dp).height(38.dp).background(colore)
                ) {}
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(u.titolo, color = colore, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(u.sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 3)
                }
                if (u.azione != null) {
                    Spacer(Modifier.width(10.dp))
                    Button(onClick = onAzione) { Text(u.azione) }
                }
            }
        }
    }

}

/** Le voci di una fila, con lo spazio giusto in mezzo. */
@Composable
fun FilaSpaziata(spazio: Int = 8, contenuto: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(spazio.dp)) { contenuto() }
}
