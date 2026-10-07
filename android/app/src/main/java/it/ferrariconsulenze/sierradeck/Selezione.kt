package it.ferrariconsulenze.sierradeck

/**
 * La scelta del computer dal selettore in alto (app 2.52.2), come funzione
 * pura.
 *
 * Nicholas (07/10, app 2.52.1): «Io seleziono un altro pc e il programma va
 * sempre in errore e mi dice che sta provando a connettersi a quello che è già
 * connesso». Le cause, nell'app:
 * - lo stato letto dal computer (`stato`) e i contatori dei giri non si
 *   azzeravano al cambio: finché il nuovo non rispondeva, nome in alto,
 *   «Mi collego a …» e chat erano ancora quelli del computer di prima, e se il
 *   nuovo non rispondeva si leggeva «Non riesco a collegarmi a <quello di prima>»;
 * - la prova «anche gli altri indirizzi dello stesso computer» li cercava per
 *   **nome**, e poteva passare da sola a un'altra postazione.
 *
 * Le regole, qui: al tocco su un computer diverso si apre un tentativo nuovo
 * (con un numero, `gen`, che rende muti i tentativi vecchi) verso **quella**
 * postazione e il suo solo indirizzo; il tocco su quello già scelto non fa
 * niente; un fallimento resta sul computer scelto, con «Riprova»; mai un
 * ripiego su un altro.
 */
data class StatoSelezione(
    /** La postazione scelta (il suo indirizzo è la sua identità). */
    val scelto: String,
    /** Il numero del tentativo in corso o dell'ultimo: quelli con un numero diverso non contano più. */
    val gen: Int = 0,
    /** `provo`, `collegato`, `fallito`. */
    val esito: String = "provo",
    /** La postazione scelta prima (2.52.3): per «Torna al PC di prima», solo se la chiedi tu. */
    val precedente: String? = null
)

sealed class MossaSelezione {
    /** Niente da fare: è già quello scelto. */
    object Niente : MossaSelezione()
    /** Stacca il collegamento di prima e collegati a questa postazione, solo a questi indirizzi. */
    data class Collegati(val gen: Int, val indirizzo: String, val indirizzi: List<String>) : MossaSelezione()
}

object Selezione {
    fun iniziale(indirizzo: String): StatoSelezione = StatoSelezione(indirizzo)

    /** Gli indirizzi da provare per una postazione: **solo il suo**. Nessun altro computer, nemmeno con lo stesso nome. */
    fun indirizziDi(scelto: String): List<String> = if (scelto.isBlank()) emptyList() else listOf(scelto)

    fun tocca(s: StatoSelezione, indirizzo: String): Pair<StatoSelezione, MossaSelezione> {
        if (indirizzo == s.scelto) return s to MossaSelezione.Niente
        val n = StatoSelezione(indirizzo, s.gen + 1, "provo", precedente = s.scelto.takeIf { it.isNotBlank() })
        return n to MossaSelezione.Collegati(n.gen, indirizzo, indirizziDi(indirizzo))
    }

    /** «Riprova» sul computer scelto: un tentativo nuovo, sempre verso lo stesso. */
    fun riprova(s: StatoSelezione): Pair<StatoSelezione, MossaSelezione> {
        val n = s.copy(gen = s.gen + 1, esito = "provo")
        return n to MossaSelezione.Collegati(n.gen, s.scelto, indirizziDi(s.scelto))
    }

    /**
     * «Torna al PC di prima» (2.52.3): una scelta come le altre, verso la
     * postazione di prima e solo quella. Se non ce n'è una, niente.
     */
    fun tornaIndietro(s: StatoSelezione): Pair<StatoSelezione, MossaSelezione> {
        val prima = s.precedente ?: return s to MossaSelezione.Niente
        return tocca(s, prima)
    }

    /** L'esito di un tentativo: conta solo se è quello in corso; il computer scelto non cambia mai da solo. */
    fun esito(s: StatoSelezione, gen: Int, indirizzo: String, ok: Boolean): StatoSelezione {
        if (gen != s.gen || indirizzo != s.scelto) return s
        return s.copy(esito = if (ok) "collegato" else "fallito")
    }
}
