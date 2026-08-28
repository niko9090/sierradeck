package it.ferrariconsulenze.sierradeck

import androidx.compose.animation.core.animateFloatAsState
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
 * riparte da solo. Dal telefono, prima, non si vedeva **niente** fino alla fine:
 * la stessa schermata di un computer scollegato.
 *
 * ## Chi racconta
 *
 * Il primo tentativo era un racconto **parallelo**: dedurre a che punto fosse
 * l'installazione dal silenzio, e disegnare una percentuale con la stessa regola
 * della finestra sul computer. Sembrava ragionevole, e non lo era: le due
 * schermate dicevano parole diverse e numeri che non coincidevano, perché la
 * finestra vera ha cinque passi — c'è anche l'aggiornamento di Claude Code — e
 * una curva sua. Due indicatori della stessa cosa che non concordano tolgono
 * fiducia a **entrambi**.
 *
 * La soluzione è che a raccontare sia **uno solo**, e che sia quello che sa. Il
 * programma che lavora in quei trenta secondi esiste — è l'installer — ed è vivo
 * proprio mentre SierraDeck è morto. Quindi la porta del Client, rimasta libera
 * perché SierraDeck l'ha lasciata, se la prende lui: stessa porta, stesso
 * indirizzo, stessa rotta `/api/aggiornamento`. Il telefono continua a chiedere
 * le stesse cose allo stesso posto, e per quei trenta secondi gli risponde
 * l'installer con le sue parole e la sua percentuale.
 *
 * Qui dentro quindi non si deduce più niente: si mostra quello che arriva.
 *
 * ## E quando la spia non c'è
 *
 * Un installer più vecchio, o la porta che non si libera in tempo: allora si
 * torna a raccontare dal silenzio — risponde ancora, non risponde, è tornato —
 * con una percentuale prudente. È un ripiego dichiarato, non la strada
 * principale, e si vede: senza spia i numeri sono pochi e tondi.
 */
@Composable
fun SchermoInstallazione(
    api: Api,
    versionePrima: String,
    da: Long,
    onEsci: () -> Unit
) {
    /** Quello che dice l'installer, quando c'è. È la verità, non una stima. */
    var testoVero by remember { mutableStateOf<String?>(null) }
    var percentoVero by remember { mutableStateOf<Int?>(null) }
    /** Il ripiego, per quando non risponde nessuno: 0 chiusura · 1 lavoro · 2 avvio. */
    var passo by remember { mutableIntStateOf(0) }
    var stima by remember { mutableIntStateOf(0) }
    var versioneOra by remember { mutableStateOf<String?>(null) }
    var secondi by remember { mutableIntStateOf(0) }
    var finito by remember { mutableStateOf(false) }
    var sparito by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        while (isActive) {
            secondi = ((System.currentTimeMillis() - da) / 1000L).toInt()

            // 1. Chi sta lavorando adesso? Se c'è la spia dell'installer, è lei
            //    a dire tutto — parole comprese.
            try {
                val a = api.aggiornamento()
                val suo = a.testo
                if (!suo.isNullOrBlank()) {
                    testoVero = suo
                    percentoVero = a.percento
                    sparito = true
                }
            } catch (e: Exception) {
                // Nessuno risponde: si continua col ripiego.
            }

            // 2. È tornato? La prova è una sola e non si può fingere: la
            //    versione nuova che risponde a `/api/ciao`.
            try {
                val v = api.ciao().versione
                versioneOra = v
                when {
                    v.isNotBlank() && v != versionePrima -> { finito = true; passo = 3 }
                    v.isNotBlank() -> if (!sparito) passo = 0
                }
            } catch (e: Exception) {
                sparito = true
                if (passo < 1) passo = 1
            }

            if (finito) break
            delay(1200)
        }
    }

    // Il ripiego sale piano verso il tetto del suo passo, e non oltre: una barra
    // che entra nel territorio di una fase non ancora cominciata è una bugia.
    LaunchedEffect(Unit) {
        while (isActive) {
            val tetto = when (passo) {
                0 -> 15
                1 -> 90
                2 -> 99
                else -> 100
            }
            if (stima < tetto) stima = minOf(tetto, stima + 1)
            if (stima >= 100) break
            delay(400)
        }
    }

    val percento = if (finito) 100 else (percentoVero ?: stima)
    val larghezza by animateFloatAsState(percento / 100f, label = "avanzamento")
    val troppo = secondi * 1000L > Installazione.TROPPO_MS
    val pronto = finito || percento >= 100

    // La riga grande è **letteralmente** quella dell'installer, quando parla.
    val titolo = when {
        pronto -> "Pronto."
        troppo -> "Ci sta mettendo troppo"
        testoVero != null -> testoVero ?: ""
        passo == 0 -> "Chiusura di SierraDeck..."
        else -> "Installazione in corso..."
    }

    val racconto = when {
        pronto -> "Il computer è ripartito con la ${versioneOra ?: ""}."
        troppo ->
            "Sono passati più di dieci minuti e il computer non è ancora tornato. " +
                "Può essere che l'installer stia aspettando qualcosa sullo schermo del computer: vai a vedere."
        testoVero != null ->
            "Te lo sta dicendo l'installer stesso: quello che leggi qui è la stessa riga che compare sul computer."
        passo == 0 ->
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
                color = if (pronto) Banco.verde else if (troppo) Banco.ambra else Banco.testo,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(18.dp))

            Text(
                "$percento%",
                color = if (pronto) Banco.verde else Banco.accento,
                fontWeight = FontWeight.Bold,
                fontSize = 44.sp
            )
            Spacer(Modifier.height(12.dp))

            LinearProgressIndicator(
                progress = { larghezza },
                color = if (pronto) Banco.verde else Banco.accento,
                trackColor = Banco.incisione,
                modifier = Modifier.fillMaxWidth().height(8.dp)
            )
            Spacer(Modifier.height(18.dp))

            Text(racconto, color = Banco.testoQuieto, fontSize = 14.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(14.dp))

            Text(
                riga(secondi, versionePrima, testoVero != null, sparito),
                color = Banco.testoQuieto,
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(26.dp))
            if (pronto) {
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

/** La riga dei fatti nudi: da quanto, da che versione, chi sta parlando. */
private fun riga(secondi: Int, prima: String, conSpia: Boolean, sparito: Boolean): String {
    val tempo = if (secondi < 60) "${secondi}s" else "${secondi / 60}m ${secondi % 60}s"
    val versioni = if (prima.isBlank()) "" else " · partito dalla $prima"
    val chi = when {
        conSpia -> " · lo dice l'installer"
        sparito -> " · non risponde"
        else -> " · risponde ancora"
    }
    return tempo + versioni + chi
}
