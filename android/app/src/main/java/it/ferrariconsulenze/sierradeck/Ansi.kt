package it.ferrariconsulenze.sierradeck

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration

/**
 * I colori del terminale, interpretati sul telefono.
 *
 * Il computer manda le righe **grezze**, con dentro i codici ANSI (`ESC[..m`):
 * il verde di un test passato, il rosso di uno fallito, il grigio di un commento.
 * Sono metà di quello che dice come sta andando — spedirle sbiancate le
 * renderebbe illeggibili. Qui i codici diventano stile del testo; quelli che non
 * conosciamo si saltano, senza mai far cadere la riga.
 *
 * Due strati, di proposito:
 * - [spezzaAnsi] è Kotlin puro: taglia la riga in testo e sequenze SGR e
 *   **butta via tutto il resto** (cursore, cancellazioni, OSC, modi privati).
 *   Si prova con dei test senza un telefono.
 * - [ansiAnnotato] veste i pezzi con Compose.
 *
 * Fino alla 2.30 il taglio cercava la prima `m` dopo `ESC[`: un `ESC[2K` o un
 * `ESC[?25l` mangiava il testo fino alla prima «m» di una parola qualunque, un
 * `ESC]633;…` (la shell) mandava il ciclo in loop, lo sfondo `48;2;r;g;b`
 * veniva letto come colore del testo, e il video inverso (l'opzione scelta in
 * un elenco) era ignorato: testo che sparisce, colori a caso, righe invisibili.
 * Cioè «i caratteri che si vedono male» (Nicholas, 20/09/2026).
 */

/** Un pezzo di riga: del testo, oppure i numeri di una sequenza SGR (`ESC[…m`). */
sealed class PezzoAnsi {
    data class Testo(val testo: String) : PezzoAnsi()
    data class Sgr(val codici: List<Int>) : PezzoAnsi()
}

private val ESC = Char(27)
private val BEL = Char(7)

/**
 * La riga tagliata in testo e SGR. Ogni altra sequenza si scarta per intero:
 * - `ESC[` … finale: CSI (parametri `0-9;:<=>?`, intermedi ` -/`, finale `@-~`);
 *   si tiene solo se il finale è `m`;
 * - `ESC]` … `BEL` oppure `ESC \`: OSC (titolo, shell integration `633;…`);
 * - `ESC P`, `ESC X`, `ESC ^`, `ESC _` … `ESC \`: DCS e simili;
 * - `ESC (`, `ESC )`, `ESC *`, `ESC +`, `ESC #`, `ESC %` + un carattere: set di caratteri;
 * - `ESC` + un carattere: `ESC =`, `ESC >`, `ESC 7`, `ESC 8`, `ESC M`, `ESC c`.
 * I caratteri di controllo (BEL, backspace, CR) non si mostrano; il tab sì.
 * Una sequenza troncata alla fine della riga si scarta e basta. In nessun caso
 * l'indice resta fermo: il ciclo avanza sempre.
 */
fun spezzaAnsi(riga: String): List<PezzoAnsi> {
    val fuori = mutableListOf<PezzoAnsi>()
    val testo = StringBuilder()
    fun chiudiTesto() {
        if (testo.isNotEmpty()) { fuori.add(PezzoAnsi.Testo(testo.toString())); testo.setLength(0) }
    }
    val n = riga.length
    var i = 0
    while (i < n) {
        val c = riga[i]
        if (c != ESC) {
            if (c.code >= 32 || c == '\t') testo.append(c)
            i += 1
            continue
        }
        if (i + 1 >= n) { i = n; continue }
        when (riga[i + 1]) {
            '[' -> {
                var j = i + 2
                while (j < n && riga[j].code in 0x30..0x3F) j += 1
                while (j < n && riga[j].code in 0x20..0x2F) j += 1
                if (j >= n) { i = n; continue }
                if (riga[j] == 'm') {
                    val parametri = riga.substring(i + 2, j)
                    chiudiTesto()
                    val codici = if (parametri.isEmpty()) listOf(0)
                    else parametri.split(';', ':').map { it.toIntOrNull() ?: 0 }
                    fuori.add(PezzoAnsi.Sgr(codici))
                }
                i = j + 1
            }
            ']' -> {
                var j = i + 2
                var chiusa = false
                while (j < n && !chiusa) {
                    if (riga[j] == BEL) { j += 1; chiusa = true }
                    else if (riga[j] == ESC && j + 1 < n && riga[j + 1] == '\\') { j += 2; chiusa = true }
                    else j += 1
                }
                i = j
            }
            'P', 'X', '^', '_' -> {
                var j = i + 2
                while (j < n && !(riga[j] == ESC && j + 1 < n && riga[j + 1] == '\\')) j += 1
                i = if (j < n) j + 2 else n
            }
            '(', ')', '*', '+', '#', '%' -> i += 3
            else -> i += 2
        }
    }
    chiudiTesto()
    return fuori
}

/** Solo il testo: si usa quando si rinuncia a vestire, e nelle prove. */
fun senzaSequenze(riga: String): String =
    spezzaAnsi(riga).filterIsInstance<PezzoAnsi.Testo>().joinToString("") { it.testo }

/**
 * Il colore del testo senza vestito.
 *
 * Con `get()` e non un valore fisso: `Banco.testo` cambia quando arriva lo
 * stile dal computer, e un valore letto una volta sola all avvio avrebbe
 * tenuto il grigio di partenza per sempre — con tutto il resto dell app
 * rivestito intorno.
 */
private val defaultTesto: Color get() = Banco.testo

/** La tavolozza a 16 colori del terminale, in tinte che stanno sul fondo scuro. */
private val base16 = arrayOf(
    Color(0xFF3B4048), // 0 nero (alzato: il nero pieno sparirebbe sul fondo)
    Color(0xFFE0554A), // 1 rosso
    Color(0xFF57D38C), // 2 verde
    Color(0xFFE0A33C), // 3 giallo
    Color(0xFF4A90D9), // 4 blu
    Color(0xFFC678DD), // 5 magenta
    Color(0xFF56B6C2), // 6 ciano
    Color(0xFFDFE3E7), // 7 bianco
    Color(0xFF6B7079), // 8 nero acceso (grigio)
    Color(0xFFFF6E63), // 9 rosso acceso
    Color(0xFF7BE0A6), // 10 verde acceso
    Color(0xFFF2BC5E), // 11 giallo acceso
    Color(0xFF6AA9E9), // 12 blu acceso
    Color(0xFFD79BEA), // 13 magenta acceso
    Color(0xFF74CEDA), // 14 ciano acceso
    Color(0xFFFFFFFF)  // 15 bianco acceso
)

/**
 * Un canale di colore, riportato dentro i suoi argini.
 *
 * `Color(r, g, b)` accetta 0..255 e **solleva** su tutto il resto. I numeri qui
 * dentro non li scriviamo noi: arrivano dal flusso di un terminale, dove una
 * sequenza troncata o malformata produce numeri qualunque. Un `38;2;300;10;10`
 * bastava a chiudere l'app mentre si guardava una chat.
 */
private fun canale(x: Int): Int = x.coerceIn(0, 255)

/** Un colore della tavolozza xterm a 256, ricavato dal numero (riportato in 0..255). */
private fun colore256(grezzo: Int): Color {
    val n = grezzo.coerceIn(0, 255)
    return when {
        n < 16 -> base16[n]
        n in 16..231 -> {
            val c = n - 16
            val r = c / 36; val g = (c % 36) / 6; val b = c % 6
            fun v(x: Int) = if (x == 0) 0 else 55 + x * 40
            Color(v(r), v(g), v(b))
        }
        else -> {
            val g = 8 + (n - 232) * 10
            Color(canale(g), canale(g), canale(g))
        }
    }
}

/**
 * Lo stato dello stile mentre si legge la riga: primo piano, sfondo e i
 * quattro attributi che contano su un telefono. Il video inverso si applica al
 * momento di vestire, scambiando i due colori: è così che si vede l'opzione
 * scelta in un elenco, che Claude Code disegna proprio invertendola.
 */
private data class StatoStile(
    val fg: Color? = null,
    val bg: Color? = null,
    val grassetto: Boolean = false,
    val tenue: Boolean = false,
    val corsivo: Boolean = false,
    val sottolineato: Boolean = false,
    val inverso: Boolean = false
) {
    fun span(): SpanStyle {
        var f = fg ?: defaultTesto
        var b = bg
        if (inverso) { val t = f; f = b ?: Banco.fondo; b = t }
        if (tenue) f = f.copy(alpha = 0.65f)
        return SpanStyle(
            color = f,
            background = b ?: Color.Unspecified,
            fontWeight = if (grassetto) FontWeight.Bold else null,
            fontStyle = if (corsivo) FontStyle.Italic else null,
            textDecoration = if (sottolineato) TextDecoration.Underline else null
        )
    }
}

/**
 * Un colore esteso, `5;n` o `2;r;g;b`, letto dai codici dopo un 38 o un 48.
 * Torna il colore (o niente) e quanti numeri ha consumato.
 */
private fun coloreEsteso(codici: List<Int>, i: Int): Pair<Color?, Int> =
    when (codici.getOrNull(i + 1)) {
        5 -> (codici.getOrNull(i + 2)?.let { colore256(it) }) to 2
        2 -> {
            val r = codici.getOrNull(i + 2); val g = codici.getOrNull(i + 3); val b = codici.getOrNull(i + 4)
            (if (r != null && g != null && b != null) Color(canale(r), canale(g), canale(b)) else null) to 4
        }
        else -> null to 0
    }

private fun applica(stato: StatoStile, codici: List<Int>): StatoStile {
    var s = stato
    var i = 0
    while (i < codici.size) {
        when (val c = codici[i]) {
            0 -> s = StatoStile()
            1 -> s = s.copy(grassetto = true)
            2 -> s = s.copy(tenue = true)
            3 -> s = s.copy(corsivo = true)
            4 -> s = s.copy(sottolineato = true)
            7 -> s = s.copy(inverso = true)
            22 -> s = s.copy(grassetto = false, tenue = false)
            23 -> s = s.copy(corsivo = false)
            24 -> s = s.copy(sottolineato = false)
            27 -> s = s.copy(inverso = false)
            in 30..37 -> s = s.copy(fg = base16[c - 30])
            in 90..97 -> s = s.copy(fg = base16[8 + (c - 90)])
            39 -> s = s.copy(fg = null)
            38 -> { val (col, salta) = coloreEsteso(codici, i); if (col != null) s = s.copy(fg = col); i += salta }
            in 40..47 -> s = s.copy(bg = base16[c - 40])
            in 100..107 -> s = s.copy(bg = base16[8 + (c - 100)])
            49 -> s = s.copy(bg = null)
            48 -> { val (col, salta) = coloreEsteso(codici, i); if (col != null) s = s.copy(bg = col); i += salta }
            // Il resto (lampeggio, nascosto, barrato, font alternativi): non conta qui.
        }
        i += 1
    }
    return s
}

/**
 * La riga vestita, e in nessun caso un'app che si chiude.
 *
 * L'interpretazione dei codici lavora su testo che arriva dalla rete: qualunque
 * cosa le sfugga qui dentro diventerebbe un'app che sparisce mentre stai
 * leggendo una chat, senza una parola. Una riga che non si sa vestire si mostra
 * nuda — si perde il colore di una riga, non la conversazione.
 */
fun ansiAnnotato(riga: String): AnnotatedString =
    try {
        vestiRiga(riga)
    } catch (e: Exception) {
        AnnotatedString(senzaSequenze(riga))
    }

private fun vestiRiga(riga: String): AnnotatedString {
    val b = AnnotatedString.Builder()
    var stato = StatoStile()
    for (pezzo in spezzaAnsi(riga)) {
        when (pezzo) {
            is PezzoAnsi.Sgr -> stato = applica(stato, pezzo.codici)
            is PezzoAnsi.Testo -> {
                b.pushStyle(stato.span())
                b.append(pezzo.testo)
                b.pop()
            }
        }
    }
    return b.toAnnotatedString()
}
