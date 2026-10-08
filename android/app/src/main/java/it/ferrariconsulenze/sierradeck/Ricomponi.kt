package it.ferrariconsulenze.sierradeck

/**
 * Lo schermo di una chat ricomposto per la larghezza del telefono (app 2.52.6).
 *
 * Nicholas (08/10): «con certi PC nel cell si vede male la chat». Claude Code
 * va a capo da solo alla larghezza del terminale del PC: un PC a 200 colonne
 * mandava righe da 200 caratteri, e qui ognuna andava a capo per conto suo,
 * con un buco dove il PC aveva spezzato; le tabelle andavano a capo e si
 * disallineavano. Ora:
 * - le righe che xterm segna come continuazione (`continua`) si attaccano;
 * - due righe di testo si uniscono se la prima è stata spezzata da Claude per
 *   la larghezza del PC (la prima parola della seconda non ci stava più);
 * - tabelle, riquadri e colonne allineate restano una griglia che scorre di lato.
 * Un PC più vecchio non manda `continua` né `colonne`: non si unisce niente.
 *
 * Copia di `src/shared/ricomponi-schermo.ts`: `RicomponiTest` confronta i
 * risultati con `tests/fixtures/schermi-larghezze/ricomposti.json`.
 */
object Ricomponi {
    data class Riga(val tipo: String, val vestita: String, val testo: String)

    private const val ESC = '\u001b'
    private val COLORI = Regex("$ESC\\[[0-9;]*m")
    private val COLORI_IN_TESTA = Regex("^((?:$ESC\\[[0-9;]*m)*) +")
    private const val CORNICE = "─│┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬┄┈╌╍▏▕▁▔"
    private const val INCROCI = "┌┐└┘├┤┬┴┼┏┓┗┛┣┫┳┻╋╔╗╚╝╠╣╦╩╬"
    private const val DENTRO_TABELLA = "│┃┌┐└┘├┤┬┴┼╭╮╰╯┏┓┗┛┣┫┳┻╋║╔╗╚╝╠╣╦╩╬"
    private val CORPO = Regex("^(\\s*)(?:[●⎿•\\-*❯>]\\s+)?")

    fun senzaColori(s: String): String = s.replace(COLORI, "")

    private fun soloCornice(t: String) = t.isNotBlank() && t.all { it == ' ' || CORNICE.indexOf(it) >= 0 }

    private fun interno(t: String): String {
        var i = 0
        var f = t.length
        fun via(c: Char) = c == ' ' || CORNICE.indexOf(c) >= 0
        while (i < f && via(t[i])) i += 1
        while (f > i && via(t[f - 1])) f -= 1
        return t.substring(i, f)
    }

    fun daGriglia(t: String): Boolean {
        val dentro = interno(t)
        if (dentro.isEmpty()) return false
        if (dentro.any { DENTRO_TABELLA.indexOf(it) >= 0 }) return true
        return Regex(" {3,}\\S").containsMatchIn(dentro)
    }

    private fun rientro(t: String) = t.length - t.trimStart().length
    private fun rientroCorpo(t: String) = CORPO.find(t)?.value?.length ?: rientro(t)
    private fun primaParola(t: String) = t.trimStart().split(' ').firstOrNull() ?: ""

    private fun unisci(aV: String, aT: String, bV: String, bT: String): Pair<String, String> =
        (aV + " " + bV.replace(COLORI_IN_TESTA, "$1")) to (aT + " " + bT.trimStart())

    private class Logica(var vestita: String, var testo: String, val lunghezze: MutableList<Int>)

    fun ricomponi(grezze: List<String>, continua: List<Boolean>? = null, colonne: Int? = null): List<Riga> {
        // 1. Le continuazioni di xterm: la stessa riga.
        val logiche = mutableListOf<Logica>()
        grezze.forEachIndexed { i, g ->
            val testo = senzaColori(g).trimEnd()
            val ultima = logiche.lastOrNull()
            if (continua != null && continua.getOrNull(i) == true && ultima != null && !soloCornice(ultima.testo)) {
                if (testo.isNotEmpty() && testo[0].isWhitespace()) {
                    val (v, t) = unisci(ultima.vestita, ultima.testo, g, testo)
                    ultima.vestita = v; ultima.testo = t
                } else {
                    ultima.vestita += g; ultima.testo += testo
                }
                ultima.lunghezze.add(testo.length)
            } else logiche.add(Logica(g, testo, mutableListOf(testo.length)))
        }
        val col = colonne?.takeIf { it >= 20 }
        val fuori = mutableListOf<Riga>()
        var ultimaFisica: String? = null
        var corpo = 0
        for (l in logiche) {
            val ultimo = fuori.lastOrNull()
            if (l.testo.isBlank()) {
                if (ultimo != null && ultimo.tipo != "vuota") fuori.add(Riga("vuota", "", ""))
                ultimaFisica = null
                continue
            }
            if (soloCornice(l.testo)) {
                if (l.testo.any { INCROCI.indexOf(it) >= 0 }) fuori.add(Riga("griglia", l.vestita, l.testo))
                ultimaFisica = null
                continue
            }
            if (daGriglia(l.testo)) {
                fuori.add(Riga("griglia", l.vestita, l.testo))
                ultimaFisica = null
                continue
            }
            val uf = ultimaFisica
            // 2. Spezzata da Claude per la larghezza del PC: la parola dopo non ci stava.
            if (col != null && ultimo != null && ultimo.tipo == "testo" && uf != null &&
                l.lunghezze.size == 1 && rientro(l.testo) > 0 && rientro(l.testo) == corpo &&
                uf.length <= col && uf.length + 1 + primaParola(l.testo).length > col
            ) {
                val (v, t) = unisci(ultimo.vestita, ultimo.testo, l.vestita, l.testo)
                fuori[fuori.size - 1] = Riga("testo", v, t)
                ultimaFisica = l.testo
                continue
            }
            fuori.add(Riga("testo", l.vestita, l.testo))
            ultimaFisica = if (l.lunghezze.size == 1) l.testo else null
            corpo = rientroCorpo(l.testo)
        }
        while (fuori.isNotEmpty() && fuori.last().tipo == "vuota") fuori.removeAt(fuori.size - 1)
        return fuori
    }
}
