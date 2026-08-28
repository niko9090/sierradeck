package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * I trenta secondi in cui il computer non c'è.
 *
 * Premuto «Installa», SierraDeck si chiude, l'installer lavora, e il programma
 * riparte da solo. Dal telefono, prima, non si vedeva **niente** fino alla
 * fine: la stessa schermata di un computer scollegato. Un aggiornamento che sta
 * andando bene e un cavo staccato erano indistinguibili, e l'unica cosa da fare
 * era aspettare senza sapere cosa.
 *
 * Qui quei secondi si raccontano. Non con una percentuale — quella la sa solo
 * l'installer, che non parla con nessuno — ma con l'unica cosa che si può
 * sapere davvero da fuori, e che è anche quella che conta: **a che punto del
 * viaggio siamo**. Il computer risponde ancora? Si è chiuso? È tornato? E con
 * che versione?
 *
 * La prova finale è la sola che non si può fingere: `/api/ciao` che risponde con
 * un numero di versione **diverso** da quello di prima.
 */
@Composable
fun SchermoInstallazione(
    api: Api,
    versionePrima: String,
    da: Long,
    onEsci: () -> Unit
) {
    /** Il computer ha smesso di rispondere almeno una volta: si sta chiudendo. */
    var sparito by remember { mutableStateOf(false) }
    var versioneOra by remember { mutableStateOf<String?>(null) }
    var secondi by remember { mutableIntStateOf(0) }
    var fatto by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        while (isActive) {
            secondi = ((System.currentTimeMillis() - da) / 1000L).toInt()
            try {
                val v = api.ciao().versione
                versioneOra = v
                // La versione cambiata è la prova. Se il computer non se n'è
                // mai andato e la versione è ancora quella, non è finito: è che
                // non è ancora cominciato.
                if (v != null && v.isNotBlank() && v != versionePrima) {
                    fatto = v
                    break
                }
            } catch (e: Exception) {
                // Il silenzio qui è la cosa giusta, non un guasto: il programma
                // si è chiuso per farsi sostituire.
                sparito = true
            }
            delay(1500)
        }
    }

    val troppo = secondi * 1000L > Installazione.TROPPO_MS

    val titolo = when {
        fatto != null -> "Fatto"
        troppo -> "Ci sta mettendo troppo"
        !sparito -> "Sto per installare"
        else -> "Installazione in corso"
    }

    val racconto = when {
        fatto != null -> "Il computer è ripartito con la $fatto."
        troppo ->
            "Sono passati più di dieci minuti e il computer non è ancora tornato. " +
                "Può essere che l'installer stia aspettando qualcosa sullo schermo del computer: vai a vedere."
        !sparito ->
            "Il computer risponde ancora: sta chiudendo le chat e si prepara a sostituirsi. " +
                "Fra pochi secondi sparirà, ed è quello che deve fare."
        else ->
            "Il computer si è chiuso e l'installer sta lavorando. Riparte da solo: " +
                "non c'è niente da fare, né qui né lì."
    }

    Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                titolo,
                color = if (fatto != null) Banco.verde else if (troppo) Banco.ambra else Banco.testo,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(14.dp))
            Text(
                racconto,
                color = Banco.testoQuieto,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(22.dp))

            if (fatto == null && !troppo) {
                // Indeterminata, e non una percentuale inventata: quanto manca
                // lo sa solo l'installer, e mostrare una barra che avanza da
                // sola sarebbe una bugia detta bene.
                LinearProgressIndicator(
                    color = Banco.accento,
                    trackColor = Banco.incisione,
                    modifier = Modifier.fillMaxWidth().height(6.dp)
                )
                Spacer(Modifier.height(14.dp))
            }

            Text(
                riga(secondi, versionePrima, versioneOra, sparito),
                color = Banco.testoQuieto,
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(26.dp))
            if (fatto != null) {
                Button(shape = MaterialTheme.shapes.small, onClick = onEsci) { Text("Torna alle chat") }
            } else {
                // Una schermata a tutto schermo deve sempre avere una porta:
                // se l'aggiornamento e' partito dal computer e tu volevi solo
                // leggere una chat, restare chiusi qui dentro sarebbe assurdo.
                TextButton(onClick = onEsci) { Text("Lascia perdere e torna indietro") }
            }
        }
    }
}

/** La riga dei fatti nudi: da quanto, da che versione, a che punto. */
private fun riga(secondi: Int, prima: String, ora: String?, sparito: Boolean): String {
    val tempo = if (secondi < 60) "${secondi}s" else "${secondi / 60}m ${secondi % 60}s"
    val versioni = if (prima.isBlank()) "" else " · partito dalla $prima"
    val stato = when {
        ora != null && ora == prima -> " · risponde ancora"
        sparito -> " · non risponde"
        else -> ""
    }
    return tempo + versioni + stato
}
