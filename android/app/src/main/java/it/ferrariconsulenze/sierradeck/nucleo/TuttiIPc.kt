package it.ferrariconsulenze.sierradeck.nucleo

import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.rete.PcNoto

/**
 * **Tutti i PC insieme** (k-and5): ogni PC collegato col suo stato e le sue
 * chat sotto, senza sceglierlo. Pura: i dati sono quelli che l'app già tiene
 * per ogni PC (`Deposito`), la schermata li disegna e basta.
 */
enum class StatoGruppoPc { RAGGIUNGIBILE, SI_AGGIORNA, VECCHIO, NON_RAGGIUNGIBILE }

/** Una chat nella riga del suo PC: `tono` e `parola` sono quelli di sempre (`leggiChat`). */
data class RigaChatPc(val id: String, val titolo: String, val dettaglio: String?, val tono: TonoChat, val parola: String, val protetta: Boolean)

data class GruppoPc(
    val id: String,
    val nome: String,
    val stato: StatoGruppoPc,
    /** Una frase corta sullo stato: «acceso», «non risponde», «dati delle 14:05». */
    val frase: String,
    val corrente: Boolean,
    val chat: List<RigaChatPc>,
    /** Quante chat chiedono qualcosa a te (scelta aperta): il numero accanto al nome. */
    val chiedono: Int
) {
    /** Il PC non risponde: le chat sono l'ultima copia, non lo stato di adesso. */
    val ultimaCopia: Boolean get() = stato == StatoGruppoPc.VECCHIO || stato == StatoGruppoPc.NON_RAGGIUNGIBILE
}

object TuttiIPc {
    /** Un PC con la sua ultima copia (o nessuna: non l'ha mai letto). */
    fun gruppo(p: PcNoto, copia: Deposito.Copia?, corrente: Boolean, ora: (Long) -> String): GruppoPc {
        val s = copia?.stato
        val stato = when {
            s == null -> StatoGruppoPc.NON_RAGGIUNGIBILE
            copia.vecchia -> StatoGruppoPc.VECCHIO
            s.aggiornamento?.fase == "installo" -> StatoGruppoPc.SI_AGGIORNA
            else -> StatoGruppoPc.RAGGIUNGIBILE
        }
        val frase = when (stato) {
            StatoGruppoPc.RAGGIUNGIBILE -> "acceso"
            StatoGruppoPc.SI_AGGIORNA -> "si aggiorna"
            StatoGruppoPc.VECCHIO -> if (copia!!.quando > 0) "non risponde · dati delle ${ora(copia.quando)}" else "non risponde"
            StatoGruppoPc.NON_RAGGIUNGIBILE -> if (copia == null || copia.motivo == null && copia.quando == 0L) "non ancora letto" else "non risponde"
        }
        val righe = s?.chat.orEmpty().map { c ->
            val l = leggiChat(c)
            RigaChatPc(
                id = c.id, titolo = c.nome ?: c.titolo.ifBlank { "Chat" },
                dettaglio = c.workspace?.takeIf { it.isNotBlank() }, tono = l.tono, parola = l.parola, protetta = c.pin == "chiusa"
            )
        }.sortedWith(compareBy({ ordine(it.tono) }, { it.titolo.lowercase() }))
        return GruppoPc(
            id = p.id, nome = p.nome.ifBlank { p.host.ifBlank { "Computer" } }, stato = stato, frase = frase,
            corrente = corrente, chat = righe, chiedono = righe.count { it.tono == TonoChat.SCEGLIE }
        )
    }

    /** Il PC con cui si sta già parlando in cima, gli altri come in rubrica. */
    fun tutti(pcs: List<PcNoto>, copie: Map<String, Deposito.Copia>, corrente: String?, ora: (Long) -> String): List<GruppoPc> =
        pcs.map { gruppo(it, copie[it.id], it.id == corrente, ora) }.sortedBy { if (it.corrente) 0 else 1 }

    private fun ordine(t: TonoChat): Int = when (t) {
        TonoChat.SCEGLIE -> 0; TonoChat.FERMA -> 1; TonoChat.GUIDATA -> 2; TonoChat.LAVORA -> 3; TonoChat.SPENTA -> 4
    }
}
