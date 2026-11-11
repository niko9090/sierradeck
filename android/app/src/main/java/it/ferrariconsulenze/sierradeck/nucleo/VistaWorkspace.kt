package it.ferrariconsulenze.sierradeck.nucleo

import kotlin.math.roundToInt

/**
 * **Cosa mostra la pagina di un workspace** (app 11/11), senza Compose:
 * l'intestazione fissa, la chat con l'autopilota, «Chi lavora» e le tue
 * richieste. Provata in `VistaWorkspaceTest`.
 */
data class TestaWorkspace(
    val nome: String,
    val frase: String,
    val tono: Tono,
    val percento: Int?,
    val mancaMin: Int?,
    /** Perché la percentuale è scesa, per il «?». */
    val perche: String?
)

sealed interface RigaChat {
    val chiave: String
    data class Bolla(override val chiave: String, val tua: Boolean, val testo: String, val quando: String) : RigaChat
    /** Un traguardo: una riga sola («Fatto: …», «Pronto per il tuo via»). */
    data class Traguardo(override val chiave: String, val testo: String) : RigaChat
    /** Una sua domanda aperta, con i tasti dentro la bolla. */
    data class Domanda(override val chiave: String, val testo: String, val id: String, val scelte: List<SceltaLavoro>, val rigaSotto: String?, val rischiosa: Boolean) : RigaChat
    /** Una domanda chiusa: «Hai risposto: …», «Ha scelto il programma: …». */
    data class Decisa(override val chiave: String, val testo: String, val riga: String) : RigaChat
    /** Le note di lavoro di fila, chiuse in «Cosa è successo · N». */
    data class Successo(override val chiave: String, val note: List<String>) : RigaChat
}

data class RigaChiLavora(
    val id: String,
    val ruolo: String,
    val colore: String,
    val titolo: String,
    val percento: Int?,
    val stato: String,
    val alLavoro: Boolean
)

data class RigaRichiesta(val id: String, val titolo: String, val stato: String, val percento: Int)

object ComponiWorkspace {
    private val TRAGUARDI = setOf("fine", "pronto", "decisione", "traguardo", "fatto")

    fun testa(a: AutopilotaBreve?, idOppure: String, avanzamento: AvanzamentoAutopilota?): TestaWorkspace {
        val (frase, tono) = a?.let { RegoleSchermate.adessoDi(it) } ?: ("A riposo" to Tono.RIPOSO)
        val calo = avanzamento?.calo
        return TestaWorkspace(
            nome = a?.workspace?.takeIf { it.isNotBlank() } ?: a?.nome?.takeIf { it.isNotBlank() } ?: idOppure,
            frase = frase, tono = tono,
            percento = a?.avanzamento?.percento?.coerceIn(0, 100) ?: avanzamento?.percento?.roundToInt()?.coerceIn(0, 100),
            mancaMin = a?.avanzamento?.mancaMin,
            perche = calo?.let { it.percheParole?.takeIf { p -> p.isNotBlank() } ?: it.perche.takeIf { p -> p.isNotBlank() } }
        )
    }

    fun chat(battute: List<Battuta>, ora: Long): List<RigaChat> {
        val righe = mutableListOf<RigaChat>()
        val note = mutableListOf<String>()
        var inizioNote = 0
        fun chiudiNote() {
            if (note.isNotEmpty()) { righe += RigaChat.Successo("s-$inizioNote", note.toList()); note.clear() }
        }
        battute.forEachIndexed { i, b ->
            val d = b.domanda
            val dec = b.decisa
            when {
                d != null && d.scelte.isNotEmpty() -> {
                    chiudiNote()
                    righe += RigaChat.Domanda(
                        "d-$i", b.testo, d.id,
                        d.scelte.map { SceltaLavoro(it, it, consigliata = it == d.consigliata) },
                        RegoleSchermate.rigaSeNonRispondi(d.scadeIl, d.rischiosa, d.consigliata, ora),
                        d.rischiosa == true
                    )
                }
                dec != null -> { chiudiNote(); righe += RigaChat.Decisa("c-$i", b.testo, RegoleSchermate.rigaDecisa(dec)) }
                b.da == "nota" && (b.tono ?: "") in TRAGUARDI -> { chiudiNote(); righe += RigaChat.Traguardo("t-$i", b.testo.lineSequence().first()) }
                b.da == "nota" -> { if (note.isEmpty()) inizioNote = i; note += b.testo }
                else -> { chiudiNote(); righe += RigaChat.Bolla("b-$i", b.da == "tu", b.testo, b.quando) }
            }
        }
        chiudiNote()
        return righe
    }

    /** «Chi lavora»: dalla lista d'attesa del PC per questo workspace; se non c'è, dagli specialisti dell'orchestratore. */
    fun chiLavora(workspace: String, attesa: VistaAttesa?, orchestratore: VistaOrchestratore?): List<RigaChiLavora> {
        val mie = { v: VoceAttesa -> v.workspace.isBlank() || v.workspace == workspace }
        if (attesa != null && (attesa.alLavoro.any(mie) || attesa.inFila.any(mie))) {
            fun riga(v: VoceAttesa, lavora: Boolean): RigaChiLavora {
                val ruolo = RegoleSchermate.ruolo(v.ruoloParole, v.tipo)
                return RigaChiLavora(v.id, ruolo, v.colore ?: RegoleSchermate.coloreRuolo(ruolo),
                    RegoleSchermate.titolo(v.titoloParole, v.titolo ?: v.descrizione), v.percentuale?.coerceIn(0, 100),
                    RegoleSchermate.statoVoce(v, lavora), lavora)
            }
            return attesa.alLavoro.filter(mie).map { riga(it, true) } + attesa.inFila.filter(mie).sortedBy { it.posizione ?: Int.MAX_VALUE }.map { riga(it, false) }
        }
        return orchestratore?.specialisti.orEmpty().map { s ->
            val ruolo = RegoleSchermate.ruolo(s.ruoloParole, s.ruolo)
            val lavora = s.stato == "lavoro" || s.stato == "avviato"
            RigaChiLavora(s.id, ruolo, s.colore ?: RegoleSchermate.coloreRuolo(ruolo), RegoleSchermate.titolo(s.titoloParole, s.compito), null,
                s.statoParole?.takeIf { it.isNotBlank() } ?: if (lavora) "al lavoro" else if (s.stato == "finito" || s.stato == "fatto") "finito" else s.stato.ifBlank { "in attesa" },
                lavora)
        }.sortedBy { if (it.alLavoro) 0 else 1 }
    }

    fun richieste(coda: VistaCoda?): List<RigaRichiesta> =
        RegoleAvanzamento.ordinate(coda?.richieste.orEmpty()).map {
            RigaRichiesta(it.id, RegoleSchermate.titolo(it.titoloParole, it.titolo.ifBlank { it.testo }),
                it.statoParole?.takeIf { s -> s.isNotBlank() } ?: RegoleAvanzamento.parolaStato(it.stato), it.percento.roundToInt().coerceIn(0, 100))
        }
}
