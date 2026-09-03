package it.ferrariconsulenze.sierradeck

/**
 * Una voce dell'elenco chat: o una chat viva (terminale acceso in una
 * finestra), o una salvata nell'archivio che nessuna finestra mostra.
 */
data class VoceChat(val viva: Chat? = null, val salvata: ChatSalvata? = null) {
    /** Unica dentro l'elenco: serve a Compose per non confondere due righe. */
    val chiave: String
        get() = if (viva != null) "viva:" + viva.id else "salvata:" + (salvata?.sessione ?: "")
}

/** Un workspace e le sue chat, nell'ordine in cui si mostrano. */
data class GruppoChat(val workspace: String, val attivo: Boolean, val voci: List<VoceChat>)

/**
 * Tutte le chat del computer, raggruppate per workspace.
 *
 * Prima il workspace davanti, poi gli altri nell'ordine del computer. Dentro
 * ogni gruppo prima le chat vive, poi quelle salvate che non hanno un
 * terminale acceso — una conversazione sola non compare due volte: se e' viva,
 * conta la viva. Una chat viva la cui conversazione l'archivio non conosce
 * ancora sta nel workspace davanti, che e' dove e' nata.
 *
 * Con un computer di una versione precedente `workspace.chat` non arriva: si
 * vedono le sole chat vive, come prima, sotto il workspace davanti.
 *
 * Pura, cosi' si prova senza Compose.
 */
fun raggruppaChat(vive: List<Chat>, ws: Workspace): List<GruppoChat> {
    val nomi = ws.nomi
    if (nomi.isEmpty()) {
        return if (vive.isEmpty()) emptyList()
        else listOf(GruppoChat("Chat", true, vive.map { VoceChat(viva = it) }))
    }
    val casa = if (ws.attivo in nomi) ws.attivo else nomi.first()
    val ordine = listOf(casa) + nomi.filter { it != casa }
    val dove = ws.chat.filter { it.sessione.isNotBlank() }.associate { it.sessione to it.workspace }
    val viveSessioni = vive.mapNotNull { it.sessione }.toSet()
    return ordine.map { nome ->
        val aperte = vive.filter { c ->
            val w = c.sessione?.let { dove[it] }
            (if (w != null && w in nomi) w else casa) == nome
        }.map { VoceChat(viva = it) }
        val ferme = ws.chat
            .filter { it.workspace == nome && it.sessione !in viveSessioni }
            .map { VoceChat(salvata = it) }
        GruppoChat(nome, nome == ws.attivo, aperte + ferme)
    }
}
