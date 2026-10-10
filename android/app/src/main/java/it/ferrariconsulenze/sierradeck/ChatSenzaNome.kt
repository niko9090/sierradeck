package it.ferrariconsulenze.sierradeck

/**
 * Le chat senza nome (PC 0.60.0, app 2.60.0). Nicholas lavora per progetti e
 * workspace: le chat senza un titolo (né di Claude né da una domanda) non sono
 * negli elenchi principali. Non sono cancellate: il PC dice quante sono
 * nascoste (`nascoste` di `/api/sessioni`, `senzaNome` nel pannello) e la
 * casella le rimette. Le regole stanno sul PC (src/shared/progetti-unificati.ts).
 */
object ChatSenzaNome {
    fun testo(mostrate: Boolean, nascoste: Int): String =
        (if (mostrate) "☑" else "☐") + " mostra anche le chat senza nome" +
            (if (nascoste > 0) " ($nascoste, nascoste: non sono cancellate)" else "")
}
