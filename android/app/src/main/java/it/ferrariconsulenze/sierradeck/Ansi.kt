package it.ferrariconsulenze.sierradeck

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight

/**
 * I colori del terminale, interpretati sul telefono.
 *
 * Il computer manda le righe **grezze**, con dentro i codici ANSI (`ESC[..m`):
 * il verde di un test passato, il rosso di uno fallito, il grigio di un commento.
 * Sono metà di quello che dice come sta andando — spedirle sbiancate le
 * renderebbe illeggibili. Qui i codici diventano stile del testo; quelli che non
 * conosciamo si saltano, senza mai far cadere la riga.
 */

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

/**
 * Un colore della tavolozza xterm a 256, ricavato dal numero.
 *
 * Il numero si riporta prima in 0..255: fuori di lì non è un colore della
 * tavolozza, è spazzatura arrivata dalla rete. `n` negativo cercava una casella
 * prima dell'inizio dell'elenco, e `38;5;999` calcolava un grigio da 7678 — due
 * modi diversi di far cadere la stessa riga.
 */
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

private fun applica(stile: SpanStyle, codici: List<Int>): SpanStyle {
    var s = stile
    var i = 0
    while (i < codici.size) {
        when (val c = codici[i]) {
            0 -> s = SpanStyle(color = defaultTesto)
            1 -> s = s.copy(fontWeight = FontWeight.Bold)
            22 -> s = s.copy(fontWeight = FontWeight.Normal)
            in 30..37 -> s = s.copy(color = base16[c - 30])
            in 90..97 -> s = s.copy(color = base16[8 + (c - 90)])
            39 -> s = s.copy(color = defaultTesto)
            38 -> {
                // 38;5;n (256) oppure 38;2;r;g;b (truecolor).
                when (codici.getOrNull(i + 1)) {
                    5 -> { codici.getOrNull(i + 2)?.let { s = s.copy(color = colore256(it)) }; i += 2 }
                    2 -> {
                        val r = codici.getOrNull(i + 2); val g = codici.getOrNull(i + 3); val b = codici.getOrNull(i + 4)
                        if (r != null && g != null && b != null) {
                            s = s.copy(color = Color(canale(r), canale(g), canale(b)))
                        }
                        i += 4
                    }
                }
            }
            // Sfondo (40-47, 48, 100-107) e il resto: ignorati — lo sfondo è il banco.
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

/** Toglie i comandi e lascia il testo: si usa quando si rinuncia a vestire. */
private fun senzaSequenze(riga: String): String {
    val fuori = StringBuilder()
    var i = 0
    while (i < riga.length) {
        if (riga[i] == Char(27)) {
            // Si salta fino alla lettera che chiude il comando, compresa.
            var j = i + 1
            if (j < riga.length && riga[j] == Char(91)) j += 1
            while (j < riga.length && !riga[j].isLetter()) j += 1
            i = if (j < riga.length) j + 1 else riga.length
        } else {
            fuori.append(riga[i])
            i += 1
        }
    }
    return fuori.toString()
}

private fun vestiRiga(riga: String): AnnotatedString {
    val b = AnnotatedString.Builder()
    var stile = SpanStyle(color = defaultTesto)
    val esc = ''
    var i = 0
    while (i < riga.length) {
        if (riga[i] == esc && i + 1 < riga.length && riga[i + 1] == '[') {
            val fine = riga.indexOf('m', i + 2)
            if (fine == -1) break // sequenza troncata: si ferma qui
            val codici = riga.substring(i + 2, fine).split(';').mapNotNull { it.toIntOrNull() }
            stile = applica(stile, if (codici.isEmpty()) listOf(0) else codici)
            i = fine + 1
        } else {
            val prossimo = riga.indexOf(esc, i)
            val fine = if (prossimo == -1) riga.length else prossimo
            b.pushStyle(stile)
            b.append(riga.substring(i, fine))
            b.pop()
            i = fine
        }
    }
    return b.toAnnotatedString()
}
