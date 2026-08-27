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
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.text.style.TextAlign

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
 * Scorre in fondo da sé quando arriva qualcosa di nuovo — si guarda l’ultima
 * cosa che ha scritto, non la prima — ma **solo se ci stavi già**: se ti sei
 * fermato a leggere venti righe più su, un ridisegno non deve strapparti la
 * pagina di mano. È la differenza fra un terminale che ti segue e uno che ti
 * insegue.
 *
 * In cima, quando sopra c’è ancora conversazione, il gesto per risalire.
 */
@Composable
fun VistaTerminale(
    grezze: List<String>,
    modo: ModoTerminale,
    dimensione: Int,
    piuSopra: Boolean = false,
    caricando: Boolean = false,
    onPiuSopra: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val vscroll = rememberScrollState()
    val hscroll = rememberScrollState()
    val impronta = grezze.joinToString("\n").hashCode()

    LaunchedEffect(impronta, modo) {
        // «Ci stavi già» vuol dire: a meno di un dito dal fondo. Sopra quella
        // soglia stai leggendo, e chi legge non va spostato.
        val attaccato = vscroll.maxValue - vscroll.value < 160 || vscroll.maxValue == 0
        if (attaccato) vscroll.scrollTo(vscroll.maxValue)
    }

    Box(modifier) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(vscroll)
                .then(if (modo == ModoTerminale.GRIGLIA) Modifier.horizontalScroll(hscroll) else Modifier)
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            if (piuSopra) {
                TastoRisali(caricando = caricando, onClick = onPiuSopra)
                Box(Modifier.height(10.dp))
            }
            if (modo == ModoTerminale.ADATTA) {
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
                            lineHeight = (dimensione * 1.5f).sp,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            } else {
                if (grezze.isEmpty()) VuotoInAttesa()
                val stretto = (dimensione - 2).coerceAtLeast(8)
                for (grezza in grezze) {
                    Text(
                        ansiAnnotato(grezza),
                        fontFamily = FontFamily.Monospace,
                        // In griglia si sta due punti più stretti: lì conta
                        // quante colonne entrano, non quanto è comodo leggere.
                        fontSize = stretto.sp,
                        lineHeight = (stretto * 1.35f).sp,
                        softWrap = false,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

/** Il gesto per risalire: dice quanto prende, così non è un salto nel buio. */
@Composable
private fun TastoRisali(caricando: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        enabled = !caricando,
        color = Banco.chassis,
        contentColor = Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, Banco.incisione),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            if (caricando) "Risalgo…" else "↑  Mostra quello di prima",
            color = if (caricando) Banco.testoQuieto else Banco.accento,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp)
        )
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