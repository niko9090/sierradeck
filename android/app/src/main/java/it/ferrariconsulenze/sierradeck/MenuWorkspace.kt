package it.ferrariconsulenze.sierradeck

import java.text.Normalizer

/**
 * Il menu dei workspace (PC 0.82.0), le stesse regole di
 * `src/shared/menu-workspace.ts`: in cima la ricerca per nome, sotto i gruppi
 * «Recenti» e uno per PC, le azioni di ogni workspace dietro «⋯».
 * `MenuWorkspaceTest` le confronta con i casi scritti dal PC
 * (`resources/menu-workspace/menu-0.82.json`).
 */
object MenuWorkspace {
    const val RECENTI_MAX = 5

    data class Voce(val nome: String, val qui: Boolean, val pcId: String? = null, val pcNome: String? = null)
    data class Gruppo(val chiave: String, val titolo: String, val voci: List<Voce>)
    data class Azione(val azione: String, val etichetta: String, val spiega: String, val spenta: String? = null, val pericolo: Boolean = false)

    private val accenti = Regex("[̀-ͯ]")

    /** Senza accenti e maiuscole: «Dèsk» trova «desk». */
    fun piano(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(accenti, "").lowercase()

    /**
     * I gruppi, già filtrati dalla ricerca: «Recenti» (dove sei, poi gli ultimi
     * dove sei andato, al massimo [RECENTI_MAX], e solo con più di
     * [RECENTI_MAX] workspace), «Questo PC» con gli altri nell'ordine di
     * sempre, poi un gruppo per ogni altro PC. I gruppi vuoti non ci sono.
     */
    fun gruppi(
        nomi: List<String>,
        attivo: String,
        recenti: List<String> = emptyList(),
        filtro: String = "",
        nomePc: String? = null,
        altrove: List<WorkspaceAltrove> = emptyList(),
        max: Int = RECENTI_MAX
    ): List<Gruppo> {
        val f = piano(filtro.trim())
        fun passa(n: String) = f.isEmpty() || piano(n).contains(f)
        val primi = mutableListOf<String>()
        for (n in listOf(attivo) + recenti) {
            if (primi.size >= max) break
            if (n.isNotEmpty() && n in nomi && n !in primi) primi.add(n)
        }
        val conRecenti = nomi.size > max && primi.isNotEmpty()
        val restanti = if (conRecenti) nomi.filter { it !in primi } else nomi
        val gruppi = mutableListOf<Gruppo>()
        fun voci(l: List<String>) = l.filter { passa(it) }.map { Voce(it, qui = true) }
        if (conRecenti) gruppi.add(Gruppo("recenti", "Recenti", voci(primi)))
        gruppi.add(Gruppo("qui", if (nomePc.isNullOrEmpty()) "Questo PC" else "Questo PC · $nomePc", voci(restanti)))
        for (a in altrove) {
            gruppi.add(Gruppo("pc:${a.pc}", a.nome, a.workspace.filter { passa(it) && it !in nomi }.map { Voce(it, qui = false, pcId = a.pc, pcNome = a.nome) }))
        }
        return gruppi.filter { it.voci.isNotEmpty() }
    }

    /** Cosa c'è dietro «⋯»: di qui apri, rinomina, Apri cartella, (Sposta), Elimina; di un altro PC apri e Porta qui. */
    fun azioni(v: Voce, attivo: String, quanti: Int, sposta: Boolean = false, cartella: Boolean = true): List<Azione> {
        if (!v.qui) {
            val pc = v.pcNome ?: "l’altro PC"
            return listOf(
                Azione("apri", "Apri", "Apre qui «${v.nome}»: le sue chat dal vivo su $pc, dove continuano a girare. Su $pc non cambia niente."),
                Azione("portaQui", "Porta qui", "Porta qui «${v.nome}» con le sue chat (le copia dal Drive). Su $pc non cambia niente.")
            )
        }
        val davanti = v.nome == attivo
        return buildList {
            add(Azione("apri", if (davanti) "Sei qui" else "Apri", if (davanti) "«${v.nome}» è già davanti." else "Passa a «${v.nome}». Le chat che lasci continuano a lavorare.", spenta = if (davanti) "«${v.nome}» è già davanti" else null))
            add(Azione("rinomina", "Rinomina…", "Cambia solo il nome: le chat restano dove sono."))
            if (cartella) add(Azione("cartella", "Apri cartella", "Apre la cartella del progetto di questo workspace."))
            if (sposta) add(Azione("sposta", "Sposta su un altro PC…", "Sposta il progetto di questo workspace su un altro PC, con il trasloco: confronta, unisce, e la copia di qui va nel recupero per 30 giorni."))
            add(Azione("elimina", "Elimina…", "Lo toglie dalla fascia; resta 30 giorni in «Eliminati», con «Ripristina».", spenta = if (quanti <= 1) AzioniTelefono.ULTIMO_WORKSPACE else null, pericolo = true))
        }
    }
}
