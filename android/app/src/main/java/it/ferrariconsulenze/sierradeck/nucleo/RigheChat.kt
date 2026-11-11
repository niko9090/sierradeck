package it.ferrariconsulenze.sierradeck.nucleo

/**
 * **Le righe di una chat sul telefono** (app 11/11), per numero di riga del
 * PC. Si chiedono solo quelle nuove (`/api/storia` con `dopo`): la risposta
 * dice da che riga parte (`da`) e da lì in poi sostituisce quello che c'era
 * (il terminale riscrive le ultime righe mentre lavora). Un buco (sono
 * arrivate le ultime e non tutte) svuota le vecchie: mai righe fuori ordine.
 */
data class RigheChat(val righe: List<Pair<Int, String>> = emptyList()) {
    val ultima: Int get() = righe.lastOrNull()?.first ?: -1

    /** Quale `dopo` chiedere: un po' prima dell'ultima, per prendere le righe riscritte. */
    fun dopo(): Int = if (righe.isEmpty()) -1 else maxOf(-1, ultima - RISCRITTE)

    fun unisci(s: Storia): RigheChat {
        val nuove = s.righe.mapIndexed { i, t -> (s.da + i) to t }
        if (nuove.isEmpty()) return this
        val tenute = if (s.da > ultima + 1) emptyList() else righe.filter { it.first < s.da }
        return RigheChat((tenute + nuove).takeLast(MASSIMO))
    }

    companion object {
        const val RISCRITTE = 80
        const val MASSIMO = 3000
    }
}
