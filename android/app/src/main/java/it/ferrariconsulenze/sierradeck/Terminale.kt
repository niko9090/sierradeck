package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Il terminale di una chat, su uno schermo che è largo un terzo.
 *
 * Il computer manda lo schermo **così com'è disegnato**: cento colonne di
 * larghezza, cornice compresa. Su un telefono quella griglia esce dai bordi, e
 * leggerla vuol dire trascinarla avanti e indietro per ogni riga. Ma tagliarla
 * non si può: a volte serve **proprio quella**, allineata come sul computer.
 *
 * Quindi due letture della stessa cosa, e si passa dall'una all'altra con un
 * tocco:
 * - **Adatta** — il testo va a capo e sta nella larghezza. La cornice si toglie:
 *   quelle stanghette servono a disegnare un riquadro largo cento colonne, e su
 *   un telefono sono solo rumore che manda a capo il resto.
 * - **Griglia** — la fotografia esatta, carattere per carattere, che scorre di
 *   lato. È quella da usare quando conta l'allineamento: una tabella, un diff,
 *   una barra di avanzamento.
 */
enum class ModoTerminale { ADATTA, GRIGLIA }

/**
 * I caratteri con cui si disegnano le cornici.
 *
 * Non sono testo: sono grafica fatta con le lettere. In «Adatta» se ne va, e con
 * lei mezzo schermo di stanghette.
 */
private const val CORNICE = "─│┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬┄┈╌╍▏▕▁▔"

/** Se quella riga è **soltanto** cornice: da leggere non ha niente. */
fun soloCornice(testo: String): Boolean =
    testo.isNotBlank() && testo.all { it.isWhitespace() || CORNICE.indexOf(it) >= 0 }

/** Dove comincia e dove finisce il testo vero, tolte cornice e spazi ai bordi. */
fun estremiDelTesto(testo: String): Pair<Int, Int> {
    var inizio = 0
    var fine = testo.length
    fun daTogliere(c: Char): Boolean = c.isWhitespace() || CORNICE.indexOf(c) >= 0
    while (inizio < fine && daTogliere(testo[inizio])) inizio += 1
    while (fine > inizio && daTogliere(testo[fine - 1])) fine -= 1
    return inizio to fine
}

/**
 * La riga senza la sua cornice, colori compresi.
 *
 * Si taglia il testo **già vestito** invece di rifare l'interpretazione su una
 * stringa ripulita: `subSequence` porta con sé gli stili, quindi il verde di un
 * test passato resta verde anche dopo aver tolto la stanghetta che lo precedeva.
 */
fun senzaCornice(riga: AnnotatedString): AnnotatedString {
    val (inizio, fine) = estremiDelTesto(riga.text)
    if (inizio >= fine) return AnnotatedString("")
    return riga.subSequence(inizio, fine)
}

/**
 * Le righe pronte da mostrare in «Adatta».
 *
 * Si tolgono le righe di sola cornice, si tolgono le cornici dalle altre, e non
 * si lasciano mai due righe vuote di fila: sul computer lo spazio verticale è
 * composizione, su un telefono alto la metà è spreco.
 */
fun righeAdattate(grezze: List<String>): List<AnnotatedString> {
    val fuori = mutableListOf<AnnotatedString>()
    for (grezza in grezze) {
        val vestita = ansiAnnotato(grezza)
        if (soloCornice(vestita.text)) continue
        val pulita = senzaCornice(vestita)
        if (pulita.text.isEmpty() && (fuori.isEmpty() || fuori.last().text.isEmpty())) continue
        fuori.add(pulita)
    }
    while (fuori.isNotEmpty() && fuori.last().text.isEmpty()) fuori.removeAt(fuori.size - 1)
    return fuori
}

/**
 * Lo schermo della chat.
 *
 * Scorre in fondo da sé quando arriva qualcosa di nuovo — si guarda l'ultima
 * cosa che ha scritto, non la prima — e **solo** quando cambia davvero: la
 * chiave è il contenuto, non il giro di lettura, altrimenti ogni due secondi
 * l'elenco tornerebbe in fondo strappandolo di mano a chi sta leggendo più su.
 */
@Composable
fun VistaTerminale(
    grezze: List<String>,
    modo: ModoTerminale,
    dimensione: Int,
    modifier: Modifier = Modifier
) {
    val vscroll = rememberScrollState()
    val hscroll = rememberScrollState()
    val impronta = grezze.joinToString("\n").hashCode()

    LaunchedEffect(impronta, modo) { vscroll.scrollTo(vscroll.maxValue) }

    Box(modifier) {
        if (modo == ModoTerminale.ADATTA) {
            Column(
                Modifier.fillMaxSize().verticalScroll(vscroll).padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                val righe = righeAdattate(grezze)
                if (righe.isEmpty()) VuotoInAttesa()
                for (riga in righe) {
                    if (riga.text.isEmpty()) {
                        Box(Modifier.height(8.dp))
                    } else {
                        Text(
                            riga,
                            fontFamily = FontFamily.Monospace,
                            fontSize = dimensione.sp,
                            lineHeight = (dimensione * 1.45f).sp,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(vscroll)
                    .horizontalScroll(hscroll)
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                if (grezze.isEmpty()) VuotoInAttesa()
                for (grezza in grezze) {
                    Text(
                        ansiAnnotato(grezza),
                        fontFamily = FontFamily.Monospace,
                        // In griglia si sta due punti piu' stretti: li' conta
                        // quante colonne entrano, non quanto e' comodo leggere.
                        fontSize = (dimensione - 2).coerceAtLeast(8).sp,
                        lineHeight = ((dimensione - 2).coerceAtLeast(8) * 1.35f).sp,
                        softWrap = false,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
private fun VuotoInAttesa() {
    Text(
        "Sto leggendo il terminale…",
        color = Banco.testoQuieto,
        fontSize = 13.sp
    )
}
