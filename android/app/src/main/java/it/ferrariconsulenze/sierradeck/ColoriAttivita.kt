// GENERATO da src/shared/colori-attivita.ts: non modificare a mano.
// Lo controlla tests/shared/colori-attivita.test.ts; `AGGIORNA=1` lo riscrive.
package it.ferrariconsulenze.sierradeck

/** Un'attività di una chat (PC 0.82.0): nome, parola, simbolo, colore, spiegazione. */
data class SchedaAttivita(val id: String, val nome: String, val parola: String, val icona: String, val colore: String, val spiega: String)

/** La tabella unica dei colori di cosa fa una chat, la stessa del PC e della pagina. */
object TabellaAttivita {
    const val TITOLO_LEGENDA = "I colori delle chat"

    val colori: Map<String, Long> = mapOf(
        "blu" to 0xFF4AA3FF,
        "viola" to 0xFFB48CFF,
        "acqua" to 0xFF3CC8C0,
        "rosa" to 0xFFF283C0,
        "lime" to 0xFFB4D454,
        "ambra" to 0xFFE0A33C,
        "rosso" to 0xFFF2857C,
        "verde" to 0xFF54C07A,
        "quieto" to 0xFF9AA1A9,
    )

    val ordine: List<String> = listOf("sviluppo", "interfaccia", "collaudo", "revisione", "rilascio", "aspetta", "ferma", "finita")

    val attivita: Map<String, SchedaAttivita> = mapOf(
        "sviluppo" to SchedaAttivita("sviluppo", "Sviluppo", "sviluppo", "✎", "blu", "scrive il codice e i suoi test"),
        "interfaccia" to SchedaAttivita("interfaccia", "Interfaccia", "interfaccia", "◧", "viola", "sistema quello che vedi su PC, pagina e app"),
        "collaudo" to SchedaAttivita("collaudo", "Collaudo", "collaudo", "◎", "acqua", "prova il lavoro e cerca i difetti"),
        "revisione" to SchedaAttivita("revisione", "Revisione", "revisione", "◈", "rosa", "rilegge il lavoro di un’altra chat prima di unirlo"),
        "rilascio" to SchedaAttivita("rilascio", "Rilascio", "rilascio", "▲", "lime", "prepara la versione e le novità"),
        "aspetta" to SchedaAttivita("aspetta", "Aspetta te", "aspetta te", "◆", "ambra", "ha una domanda o un permesso per te"),
        "ferma" to SchedaAttivita("ferma", "Ferma o errore", "ferma", "■", "rosso", "si è fermata: in pausa, bloccata o per un errore"),
        "finita" to SchedaAttivita("finita", "Finita", "finita", "✓", "quieto", "ha finito il suo compito"),
    )
}
