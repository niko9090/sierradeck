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
import androidx.compose.animation.core.animateFloatAsState
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
 * ## La percentuale, e perché non è una finta
 *
 * Sul computer la finestra dell'aggiornamento mostra una percentuale, e non la
 * inventa sul tempo: segue **tre cose che succedono davvero**, una dopo
 * l'altra, con un tetto per ciascuna — 30, 80, 99 — così la barra sale mentre
 * si aspetta ma non entra mai nel territorio della fase successiva finché
 * quella non è cominciata sul serio.
 *
 * Da qui quelle tre cose si vedono tutte, solo da un'altra angolazione:
 *
 * | fase | il computer | tetto |
 * |---|---|---|
 * | 1 · chiusura | risponde ancora | 30 |
 * | 2 · installazione | non risponde | 80 |
 * | 3 · avvio | risponde di nuovo, versione vecchia | 99 |
 * | 4 · pronto | risponde con la versione **nuova** | 100 |
 *
 * Quindi non è una seconda percentuale scritta per far contento l'occhio: è la
 * **stessa**, calcolata dalla stessa regola su osservazioni equivalenti. Le due
 * schermate raccontano la stessa storia con gli stessi numeri, ed è l'unico
 * modo perché guardare il telefono invece del computer non sia una rinuncia.
 *
 * La prova finale resta la sola che non si può fingere: `/api/ciao` che risponde
 * con un numero di versione **diverso** da quello di prima.
 */
@Composable
fun SchermoInstallazione(
    api: Api,
    versionePrima: String,
    da: Long,
    onEsci: () -> Unit
) {
    /** 1 chiusura · 2 installazione · 3 avvio · 4 pronto. Come sul computer. */
    var fase by remember { mutableIntStateOf(1) }
    var percento by remember { mutableIntStateOf(0) }
    var versioneOra by remember { mutableStateOf<String?>(null) }
    var secondi by remember { mutableIntStateOf(0) }
    var fatto by remember { mutableStateOf<String?>(null) }
    /** Ha smesso di rispondere almeno una volta: l'installer ha preso il campo. */
    var sparito by remember { mutableStateOf(false) }

    // ─── che fase è: lo dice il computer, rispondendo o tacendo ───
    LaunchedEffect(Unit) {
        while (isActive) {
            secondi = ((System.currentTimeMillis() - da) / 1000L).toInt()
            try {
                val v = api.ciao().versione
                versioneOra = v
                when {
                    v.isNotBlank() && v != versionePrima -> { fatto = v; fase = 4 }
                    // Risponde di nuovo dopo essere sparito, ma con la versione
                    // di prima: l'eseguibile e' stato sostituito e sta partendo.
                    sparito -> fase = 3
                    // Non se n'e' ancora andato: sta chiudendo le chat.
                    else -> fase = 1
                }
            } catch (e: Exception) {
                // Il silenzio qui è la cosa giusta, non un guasto: il programma
                // si è chiuso per farsi sostituire.
                sparito = true
                fase = 2
            }
            if (fase == 4) break
            delay(1500)
        }
    }

    // ─── la percentuale sale da sola fino al tetto della sua fase ───
    //
    // Un timer suo, piu' fitto della rete: la barra deve muoversi anche mentre
    // si aspetta la prossima risposta, o sembrerebbe piantata. Due punti per
    // volta e mai un salto — una barra che va da 0 a 100 in un fotogramma non
    // dice niente a chi guarda, e sembra un difetto. E' la stessa regola della
    // finestra sul computer, numeri compresi.
    LaunchedEffect(Unit) {
        while (isActive) {
            val tetto = when (fase) {
                1 -> 30
                2 -> 80
                3 -> 99
                else -> 100
            }
            if (percento < tetto) percento = minOf(tetto, percento + 2)
            if (percento >= 100) break
            delay(200)
        }
    }

    val larghezza by animateFloatAsState(percento / 100f, label = "avanzamento")
    val troppo = secondi * 1000L > Installazione.TROPPO_MS

    val titolo = when {
        fatto != null -> "Pronto"
        troppo -> "Ci sta mettendo troppo"
        fase == 1 -> "Chiusura di SierraDeck"
        fase == 3 -> "Avvio della nuova versione"
        else -> "Installazione in corso"
    }

    val racconto = when {
        fatto != null -> "Il computer è ripartito con la $fatto."
        troppo ->
            "Sono passati più di dieci minuti e il computer non è ancora tornato. " +
                "Può essere che l'installer stia aspettando qualcosa sullo schermo del computer: vai a vedere."
        fase == 1 ->
            "Il computer risponde ancora: sta chiudendo le chat e si prepara a sostituirsi. " +
                "Fra pochi secondi sparirà, ed è quello che deve fare."
        fase == 3 ->
            "L'installazione è finita e il programma nuovo sta partendo. Ci siamo."
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
                fontSize = 20.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(18.dp))

            // Il numero grande, come sul computer: è la cosa che si guarda per
            // prima, e da un telefono tenuto in mano dev'essere leggibile
            // dall'altra parte della stanza.
            Text(
                "$percento%",
                color = if (fatto != null) Banco.verde else Banco.accento,
                fontWeight = FontWeight.Bold,
                fontSize = 44.sp
            )
            Spacer(Modifier.height(12.dp))

            LinearProgressIndicator(
                progress = { larghezza },
                color = if (fatto != null) Banco.verde else Banco.accento,
                trackColor = Banco.incisione,
                modifier = Modifier.fillMaxWidth().height(8.dp)
            )
            Spacer(Modifier.height(18.dp))

            Text(
                racconto,
                color = Banco.testoQuieto,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(14.dp))

            Text(
                riga(secondi, versionePrima, versioneOra, fase),
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

/** La riga dei fatti nudi: da quanto, da che versione, a che punto del viaggio. */
private fun riga(secondi: Int, prima: String, ora: String?, fase: Int): String {
    val tempo = if (secondi < 60) "${secondi}s" else "${secondi / 60}m ${secondi % 60}s"
    val versioni = if (prima.isBlank()) "" else " · partito dalla $prima"
    val passo = when (fase) {
        1 -> " · risponde ancora"
        2 -> " · non risponde"
        3 -> " · è tornato"
        else -> ""
    }
    // `ora` serve a distinguere «tornato con la stessa versione» da «tornato
    // con quella nuova», che e' l'unica differenza che conta davvero.
    val quale = if (fase == 3 && ora != null && ora == prima) " (ancora la $prima)" else ""
    return tempo + versioni + passo + quale
}
