package it.ferrariconsulenze.sierradeck.nucleo

/**
 * Regole pure che il resto dell'app usa ancora (app 11/11): stavano nelle
 * schermate di prima (`schermate/vecchie`, tolte).
 */

/**
 * L'ordine dell'elenco (2.73.0): dalla vista del PC quando c'è, come sul PC —
 * un autopilota «al lavoro» con una domanda aperta è «aspetta te» e sta in alto.
 */
fun urgenzaAp(a: AutopilotaBreve): Int = a.vista?.stato?.id?.let { id ->
    when (id) { "guasto" -> 0; "aspetta", "senza-segni" -> 1; "pronto" -> 2; "al-lavoro", "prepara" -> 3; "finito" -> 5; else -> 4 }
} ?: urgenzaDi(a.stato)

fun urgenzaDi(stato: String): Int = when (stato) {
    "sospeso", "fallito" -> 0
    "attesa" -> 1
    "pronto" -> 2
    "lavoro" -> 3
    "finito" -> 5
    else -> 4
}


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
 * Come si risponde a una domanda della linguetta: percorso e corpo. L'autopilota
 * unico (PC 0.86.x) non ha più il via: quello che non è la risposta a una
 * domanda gli arriva come messaggio, «Vai» compreso.
 */
fun richiestaScheda(d: DomandaScheda, autopilota: String, testo: String): Pair<String, Map<String, String>> = when {
    d.tipo == "domanda" -> "/api/rispondi" to mapOf("domanda" to (d.idDomanda ?: ""), "risposta" to testo)
    else -> "/api/autopilota/dialogo" to mapOf("autopilota" to autopilota, "testo" to testo)
}

/**
 * Come si risponde a una conversazione: il percorso e il corpo, uguali al PC e
 * alla pagina (`richiestaRisposta` in `shared/domande-conversazioni.ts`).
 * Pura: si prova senza Compose.
 */
fun richiestaRisposta(via: ViaRisposta, testo: String): Pair<String, Map<String, String>> = when (via.via) {
    "rispondi" -> "/api/rispondi" to mapOf("domanda" to (via.domanda ?: ""), "risposta" to testo)
    "dialogo" -> "/api/autopilota/dialogo" to mapOf("autopilota" to (via.autopilota ?: ""), "testo" to testo)
    else -> "/api/scrivi" to mapOf("chat" to (via.chat ?: ""), "testo" to testo)
}

/**
 * Quante domande aspettano te: il numero del computer (0.37.2), lo stesso del
 * tasto «Domande» del PC e della colonna. Da un computer piu' vecchio si conta
 * come prima, domande piu' scelte.
 */
fun domandeInAttesa(s: Stato): Int = s.domandeInAttesa ?: (s.domande.size + s.chat.count { it.chiede })

fun VoceDomanda.chiave(): String = when (tipo) {
    "autopilota" -> "d:$id"
    "scelta" -> "s:$chat:" + opzioni.joinToString("|") { it.testo }
    else -> "c:$chat"
}
