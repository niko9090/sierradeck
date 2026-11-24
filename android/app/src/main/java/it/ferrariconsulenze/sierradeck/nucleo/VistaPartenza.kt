package it.ferrariconsulenze.sierradeck.nucleo

enum class VistaPartenza { QUESTO_PC, TUTTI_I_PC }

/**
 * Vista di partenza di Lavoro (k-and7). Con più PC collegati si parte da «Tutti i PC»
 * senza toccare niente; «Questo PC» resta una scelta, ricordata finché l'app è aperta
 * e dimenticata quando si collega un altro PC. Con un PC solo, nessuna scelta.
 * Pura: lo stato (`scelta`, `pcVisti`) lo tiene chi la usa, in memoria di processo.
 */
data class MemoriaVistaPartenza(val scelta: VistaPartenza? = null, val pcVisti: Int = 0) {
    /** Chiamata a ogni disegno con il numero di PC collegati: se è cresciuto, la scelta torna quella di partenza. */
    fun conPc(n: Int): MemoriaVistaPartenza =
        if (n == pcVisti) this else MemoriaVistaPartenza(if (n > pcVisti) null else scelta, n)

    fun scegli(v: VistaPartenza): MemoriaVistaPartenza = copy(scelta = v)

    /** La vista da mostrare. */
    fun vista(): VistaPartenza = vistaDiPartenza(pcVisti, scelta)

    companion object {
        fun vistaDiPartenza(pc: Int, scelta: VistaPartenza?): VistaPartenza =
            if (pc <= 1) VistaPartenza.QUESTO_PC else scelta ?: VistaPartenza.TUTTI_I_PC
    }
}
