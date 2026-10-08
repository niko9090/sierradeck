package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Le opzioni di una domanda della chat, come si mostrano e si toccano (app 2.52.5).
 *
 * Nicholas (08/10): «non riesco a rispondere alle domande». Le domande di
 * Claude Code (AskUserQuestion) hanno una spiegazione sotto ogni opzione, una
 * voce «Type something.» per rispondere con parole proprie e, nella scelta
 * multipla, caselle e «Submit». Il PC (0.52.5) ora le riconosce e le manda con
 * questi campi; qui si mostrano e si sa cosa fare al tocco:
 * - «Type something.» non si tocca: si scrive la risposta nel campo e la si
 *   manda, e il PC la porta lì;
 * - in una scelta multipla ogni tocco spunta o toglie, e la domanda resta
 *   (la firma conta le spunte, così non si nasconde come «già mandata»).
 */
object SceltaVista {
    /** Quello che si dice a chi tocca «Type something.». */
    const val SCRIVI = "Scrivi la risposta nel campo qui sotto e mandala: arriva a Claude come risposta libera."

    /** La stessa domanda: le stesse opzioni, nello stesso ordine, con le stesse spunte. */
    fun firma(s: Scelte?): String? =
        s?.opzioni?.joinToString("\n") { (if (it.spuntata == true) "[x] " else "") + it.testo }

    data class Etichetta(val numero: String, val testo: String, val sotto: String?)

    fun etichetta(o: Opzione): Etichetta {
        val casella = when (o.spuntata) { true -> "☑ "; false -> "☐ "; null -> "" }
        return when {
            o.invio -> Etichetta("↵", "Manda le scelte spuntate (Submit)", null)
            o.libera -> Etichetta("${o.numero}", "Rispondi con parole tue: scrivile nel campo qui sotto", "arriva a Claude come risposta libera («${o.testo}»)")
            else -> Etichetta("${o.numero}", casella + o.testo, o.descrizione.takeIf { it.isNotBlank() })
        }
    }

    /**
     * Un rifiuto del computer a una scelta o a un testo: «già mandata», «è
     * cambiata», oppure la sua frase (`errore`), che dalla 0.52.5 spiega anche
     * cosa fare (per esempio quali sono le opzioni di un permesso).
     */
    fun rifiuto(e: Throwable, cosa: String): String {
        if (e !is Api.Errore) return "Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}"
        val dalJson = try {
            Api.json.parseToJsonElement(e.corpo).jsonObject["errore"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) { null }
        if (e.codice == 409 && dalJson != null) {
            if (dalJson.contains("mandata")) return "Già mandata: aspetta che lo schermo cambi."
            if (dalJson.contains("cambiata")) return "La scelta è cambiata mentre toccavi: fra un attimo si aggiorna."
        }
        return dalJson?.takeIf { it.isNotBlank() } ?: "Non sono riuscito a $cosa: il computer ha risposto ${e.codice}."
    }
}

/** Il numero e il testo di un'opzione, con la spiegazione piccola sotto. */
@Composable
fun TestoOpzione(o: Opzione) {
    val e = SceltaVista.etichetta(o)
    Text(e.numero, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontTerminale, modifier = Modifier.padding(end = 10.dp))
    Column {
        Text(e.testo, color = Banco.testo, fontSize = 14.sp)
        e.sotto?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp) }
    }
}
