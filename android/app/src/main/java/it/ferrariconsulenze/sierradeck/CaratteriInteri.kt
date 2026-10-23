package it.ferrariconsulenze.sierradeck

/**
 * Il testo senza mezzi caratteri (0.84.3, ricollaudo c-94).
 *
 * Un PC fino alla 0.84.2 taglia le opzioni a 200 unità UTF-16 e può spezzare un
 * emoji a metà. Mandato così, il mezzo carattere passa in UTF-8 come «?» e il
 * testo non è più l'inizio dell'opzione: il PC risponde 409. Togliere la metà
 * sola lascia l'inizio vero, che il PC della chat riconosce (dalla 0.84.3 il
 * taglio non spezza più niente: `tagliaIntero` in `shared/posta.ts`).
 */
fun senzaMezziCaratteri(testo: String): String {
    if (testo.none { Character.isSurrogate(it) }) return testo
    val fuori = StringBuilder(testo.length)
    var i = 0
    while (i < testo.length) {
        val c = testo[i]
        if (Character.isHighSurrogate(c) && i + 1 < testo.length && Character.isLowSurrogate(testo[i + 1])) {
            fuori.append(c).append(testo[i + 1]); i += 2; continue
        }
        if (!Character.isSurrogate(c)) fuori.append(c)
        i += 1
    }
    return fuori.toString()
}
