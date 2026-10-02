package it.ferrariconsulenze.sierradeck

/**
 * Lo stato di una chat, detto in una parola e in un tono.
 *
 * Dal telefono si guarda **da lontano**: chi lavora, chi è fermo, chi aspetta
 * te. Fino alla 2.37 l'elenco delle chat mostrava il titolo e l'ultima riga del
 * terminale, e basta — per sapere se una chat aspettava bisognava leggere la
 * riga e indovinare, oppure aprirla. Il computer lo sa già (`chiede`,
 * `aspetta`, `governata`, `viva` in `/api/stato`): qui lo si dice.
 *
 * L'ordine dei casi è quello di cosa conta di più per chi guarda:
 * 1. **sceglie** — sullo schermo c'è un elenco di scelte (un permesso, «vuoi
 *    procedere?»): la chat è bloccata finché non tocchi un'opzione;
 * 2. **aspetta te** — ha finito il turno e aspetta la prossima istruzione;
 * 3. **guidata** — la governa un autopilota: se si ferma, parla lui per lei;
 * 4. **spenta** — nessun terminale acceso (ibernata, o appena aperta);
 * 5. **al lavoro** — tutto il resto: sta scrivendo o pensando.
 *
 * Pura, cosi' si prova senza Compose, e con la stessa regola della pagina
 * servita dal computer (`statoChat` in `client-pagina.ts`).
 */
enum class TonoChat { SCEGLIE, ASPETTA, GUIDATA, SPENTA, LAVORA }

data class LetturaChat(
    val tono: TonoChat,
    /** La parola breve, accanto al LED. */
    val parola: String,
    /** La frase per esteso, per chi apre la chat e vuole sapere cosa fare. */
    val spiegazione: String
)

fun leggiChat(chiede: Boolean, aspetta: Boolean, governata: Boolean, viva: Boolean): LetturaChat = when {
    // Una scelta aperta vince anche su «governata»: l'autopilota non tocca i
    // permessi al posto tuo, e la chat resta bloccata finché non scegli.
    chiede -> LetturaChat(
        TonoChat.SCEGLIE, "aspetta che tu scelga",
        "Sullo schermo c'è un elenco di scelte (un permesso, «vuoi procedere?»): la chat è ferma finché non tocchi un'opzione qui sotto o nella scheda Domande."
    )
    aspetta && governata -> LetturaChat(
        TonoChat.GUIDATA, "ferma · ci pensa l'autopilota",
        "Ha finito il turno. La governa un autopilota, che le darà lui la prossima istruzione: non serve niente da te, a meno che tu voglia intervenire."
    )
    aspetta -> LetturaChat(
        TonoChat.ASPETTA, "aspetta te",
        "Ha finito il turno e aspetta la tua prossima istruzione: scrivila nel campo in fondo."
    )
    !viva -> LetturaChat(
        TonoChat.SPENTA, "spenta",
        "Non ha un terminale acceso (è ibernata, o si sta ancora aprendo): si risveglia quando le scrivi o quando la guardi sul computer."
    )
    governata -> LetturaChat(
        TonoChat.GUIDATA, "al lavoro · la guida un autopilota",
        "Sta lavorando per un autopilota: le istruzioni gliele dà lui. Puoi guardare, e scriverle se vuoi correggere la rotta."
    )
    else -> LetturaChat(
        TonoChat.LAVORA, "al lavoro",
        "Sta scrivendo o pensando: non serve niente da te finché non si ferma."
    )
}

fun leggiChat(c: Chat): LetturaChat = leggiChat(c.chiede, c.aspetta, c.governata, c.viva)

/**
 * Il riassunto di tutte le chat vive in una riga: «2 aspettano te · 3 al
 * lavoro · 1 spenta». Prima i casi che chiedono qualcosa, e solo quelli che ci
 * sono: una riga di zeri non si legge.
 */
fun riassuntoChat(chat: List<Chat>): String {
    if (chat.isEmpty()) return "nessuna chat aperta sul computer"
    val conti = chat.groupingBy { leggiChat(it).tono }.eachCount()
    val pezzi = mutableListOf<String>()
    conti[TonoChat.SCEGLIE]?.let { pezzi += if (it == 1) "1 aspetta che tu scelga" else "$it aspettano che tu scelga" }
    conti[TonoChat.ASPETTA]?.let { pezzi += if (it == 1) "1 aspetta te" else "$it aspettano te" }
    conti[TonoChat.LAVORA]?.let { pezzi += "$it al lavoro" }
    conti[TonoChat.GUIDATA]?.let { pezzi += if (it == 1) "1 con l'autopilota" else "$it con gli autopiloti" }
    conti[TonoChat.SPENTA]?.let { pezzi += if (it == 1) "1 spenta" else "$it spente" }
    return pezzi.joinToString(" · ")
}

/** Quante chat vive chiedono qualcosa a te adesso: una scelta, o la prossima istruzione. */
fun chatCheTiAspettano(chat: List<Chat>): Int =
    chat.count { val t = leggiChat(it).tono; t == TonoChat.SCEGLIE || t == TonoChat.ASPETTA }

/**
 * «su portatile · acceso», «su portatile · spento», o solo «su portatile» con
 * un computer che non lo sa ancora dire. E' la stessa etichetta dell'elenco
 * «Riprendi» sul computer (0.33.0).
 */
fun etichettaAltrove(nome: String, acceso: Boolean?): String = when (acceso) {
    true -> "su $nome · acceso"
    false -> "su $nome · spento"
    null -> "su $nome"
}


/**
 * La parola di stato per una riga larga `larghezzaDp` (0.43.0, app 2.46.0).
 *
 * Dall'analisi del 30/09 restava aperto: su uno schermo stretto «al lavoro ·
 * la guida un autopilota» si prendeva tutto il posto e il nome della chat
 * spariva. Sotto i 380 dp la parola diventa quella breve (al massimo dodici
 * lettere); il significato intero resta in `spiegazione`, dentro la chat.
 */
fun parolaPerRiga(l: LetturaChat, larghezzaDp: Int): String =
    if (larghezzaDp >= RIGA_LARGA_DP) l.parola else when (l.tono) {
        TonoChat.SCEGLIE -> "scegli tu"
        TonoChat.ASPETTA -> "aspetta te"
        TonoChat.GUIDATA -> if (l.parola.startsWith("ferma")) "ferma · AP" else "lavora · AP"
        TonoChat.SPENTA -> "spenta"
        TonoChat.LAVORA -> "al lavoro"
    }

/** Da qui in su la riga ha posto per la parola intera. */
const val RIGA_LARGA_DP = 380
