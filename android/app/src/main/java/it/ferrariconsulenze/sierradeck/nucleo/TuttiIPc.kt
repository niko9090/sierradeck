package it.ferrariconsulenze.sierradeck.nucleo

import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.rete.ProvaTelefono

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
    val chiedono: Int,
    /** Non accoppiato a questo telefono: lo si legge dal ponte di un altro PC (le chat si guardano, non si aprono da qui). */
    val dalPonte: Boolean = false
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

    /**
     * I PC della rete che il telefono **non ha accoppiato** ma che il suo PC vede
     * (`/api/pc`) e raggiunge dal ponte: prima non comparivano in «Tutti i PC»,
     * che leggeva solo la rubrica. Un PC già in rubrica (stessa impronta, o stesso
     * nome se la rubrica non l'ha ancora imparata) e il PC che risponde non si
     * ripetono. Il `PcNoto` ha l'id del PC e nessuna chiave: si legge dal ponte.
     */
    fun dalPonte(rubrica: List<PcNoto>, elenco: ElencoPc?): List<PcNoto> {
        if (elenco == null) return emptyList()
        val impronte = rubrica.map { it.impronta }.filter { it.isNotBlank() }.toSet()
        val nomi = rubrica.filter { it.impronta.isBlank() }.flatMap { listOf(it.nome, it.host) }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
        return elenco.pc.filter { p ->
            p.pcId.isNotBlank() && p.pcId != elenco.io && ProvaTelefono.improntaDaId(p.pcId) !in impronte &&
                p.mostra.trim().lowercase() !in nomi
        }.distinctBy { it.pcId }.map { PcNoto(id = it.pcId, nome = it.mostra, chiave = "", host = it.host) }
    }

    /** Il PC dell'elenco del ponte che corrisponde a questo della rubrica: per id, per impronta o per nome. */
    fun remotoDi(p: PcNoto, elenco: ElencoPc?): PcRemoto? {
        val tutti = elenco?.pc ?: return null
        tutti.firstOrNull { it.pcId == p.id }?.let { return it }
        if (p.impronta.isNotBlank()) tutti.firstOrNull { ProvaTelefono.improntaDaId(it.pcId) == p.impronta }?.let { return it }
        val nome = p.nome.trim().lowercase()
        return if (nome.isEmpty()) null else tutti.firstOrNull { it.mostra.trim().lowercase() == nome }
    }

    /**
     * Un PC che tace non deve mostrarsi senza chat: il suo battito sul Drive
     * (`/api/pc`) porta l'elenco delle chat aperte l'ultima volta che ha battuto.
     * Se la copia non ha chat (mai letta, o vecchia e vuota) si usano quelle,
     * segnate come vecchie. Una copia fresca resta com'è: vuota vuol dire vuota.
     */
    fun conBattito(copia: Deposito.Copia?, remoto: PcRemoto?): Deposito.Copia? {
        if (remoto == null || remoto.chat.isEmpty()) return copia
        if (copia != null && !copia.vecchia) return copia
        if (copia?.stato?.chat?.isNotEmpty() == true) return copia
        val chat = remoto.chat.map { c ->
            Chat(id = c.sessione ?: (c.titolo + "|" + c.cwd), titolo = c.titolo, cwd = c.cwd, sessione = c.sessione, aspetta = c.aspetta)
        }
        return Deposito.Copia((copia?.stato ?: Stato()).copy(chat = chat), copia?.quando ?: 0L, vecchia = true, motivo = copia?.motivo ?: "dal battito")
    }

    /** Quelli del ponte da leggere adesso: solo i PC accesi (gli altri restano «non risponde»). */
    fun daLeggere(ponte: List<PcNoto>, elenco: ElencoPc?): List<PcNoto> {
        val vivi = elenco?.pc?.filter { it.vivo }?.map { it.pcId }?.toSet().orEmpty()
        return ponte.filter { it.id in vivi }
    }

    private fun ordine(t: TonoChat): Int = when (t) {
        TonoChat.SCEGLIE -> 0; TonoChat.FERMA -> 1; TonoChat.GUIDATA -> 2; TonoChat.LAVORA -> 3; TonoChat.SPENTA -> 4
    }
}
