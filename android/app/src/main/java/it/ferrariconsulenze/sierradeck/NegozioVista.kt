package it.ferrariconsulenze.sierradeck

/**
 * Il negozio, la parte senza schermo (2.53.0): lo stato di ogni voce, quali
 * tasti ha, cosa mostrare dell'elenco. Pura, per i test.
 *
 * Lo stato lo scrive **il computer** dalla 0.53.0 (`shared/negozio.ts`), con
 * le stesse parole del pannello sul PC e della pagina: qui lo si mostra e
 * basta. Un computer di prima non lo manda, e allora lo si dice come allora
 * (acceso, spento, da installare), senza spiegazione inventata.
 */
object NegozioVista {
    /** Senza ricerca, da un computer di prima arriva il catalogo intero: se ne mostrano tanti così. */
    const val TETTO_VECCHIO = 40

    fun stato(p: PluginVoce): StatoVoce = p.stato ?: when {
        !p.installato -> StatoVoce("da installare", "neutro")
        p.abilitato -> StatoVoce("attivo", "ok")
        else -> StatoVoce("disattivato", "spento")
    }

    fun stato(s: SkillVoce): StatoVoce = s.stato ?: if (s.abilitata) StatoVoce("attiva", "ok") else StatoVoce("disattivata", "spento")

    fun stato(m: McpVoce): StatoVoce = m.stato ?: if (m.abilitato) StatoVoce("attivo", "neutro") else StatoVoce("disattivato", "spento")

    /** Acceso per la cartella: dal computer nuovo lo dice `config`, da uno di prima `abilitato`. */
    fun mcpAcceso(m: McpVoce): Boolean = if (m.config.isBlank()) m.abilitato else m.config == "attivo"

    /** Un server del .mcp.json che aspetta di essere approvato (o è stato rifiutato). */
    fun daApprovare(m: McpVoce): Boolean = m.config == "da-approvare" || m.config == "rifiutato"

    /** Da un plugin o da claude.ai: da qui non si tocca. */
    fun soloLettura(m: McpVoce): Boolean = m.ambito == "altro"

    /** Le parole di un ambito MCP, come sul PC. */
    fun dove(m: McpVoce): String = when (m.ambito) {
        "locale" -> "solo questa cartella"
        "utente" -> "tutti i progetti"
        "progetto" -> "file .mcp.json del progetto"
        "altro" -> "da un plugin o da claude.ai"
        else -> ""
    }

    fun origine(s: SkillVoce): String = when (s.origine) {
        "utente" -> "personale"
        "progetto" -> "del progetto"
        "plugin" -> "dal plugin ${s.plugin.orEmpty()}".trim()
        else -> s.origine
    }

    /**
     * I plugin da mostrare: quelli trovati, se si è cercato; se no quelli che
     * ha mandato il computer — installati in cima, poi i più installati — con
     * un tetto, perché un computer di prima della 0.53.0 manda tutti i 3500.
     */
    fun plugin(dati: DatiNegozio, trovati: RicercaNegozio?): List<PluginVoce> {
        val base = trovati?.plugin ?: dati.plugin
        val ordinati = base.sortedWith(compareByDescending<PluginVoce> { it.installato }.thenByDescending { it.installazioni ?: 0 })
        return if (trovati == null && dati.totalePlugin == null) ordinati.take(TETTO_VECCHIO + ordinati.count { it.installato }) else ordinati
    }

    /** La riga sopra l'elenco dei plugin: cosa si sta guardando. */
    fun riassunto(dati: DatiNegozio, trovati: RicercaNegozio?, parola: String): String = when {
        trovati?.errore != null -> trovati.errore
        trovati != null -> "${trovati.totale} trovati con «$parola»" +
            (if (trovati.totale > trovati.plugin.count { !it.installato }) ", qui i primi ${trovati.plugin.count { !it.installato }}" else "") + "."
        dati.totalePlugin != null -> "Gli installati e i più installati dei ${dati.totalePlugin} del catalogo. Cerca una parola per trovare gli altri."
        else -> "Gli installati e i più installati. La ricerca nel catalogo arriva aggiornando il computer alla 0.53.0."
    }

    /** Quanti da guardare: plugin da aggiornare, MCP in errore o da approvare. */
    fun daAggiornare(dati: DatiNegozio?): Int = dati?.plugin?.count { it.aggiornamento } ?: 0
    fun mcpDaGuardare(dati: DatiNegozio?): Int = dati?.mcp?.count { stato(it).tono == "errore" || daApprovare(it) } ?: 0

    /** «Installo… 12 s»: i secondi passati, mai negativi. */
    fun secondi(da: Long, ora: Long): Long = maxOf(0L, (ora - da) / 1000)
}
