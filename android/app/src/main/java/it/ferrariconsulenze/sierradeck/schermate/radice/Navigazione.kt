package it.ferrariconsulenze.sierradeck.schermate.radice

import it.ferrariconsulenze.sierradeck.schermate.vecchie.Scheda

/**
 * **Tre voci** (app nuova, 11/11): Lavoro · File · Altro. Nicholas: «da capo,
 * e migliorala». Lavoro tiene quello che prima stava in Workspace, Chat e
 * Progetti (domande, autopiloti, chat, progetti); File i file dei PC e quelli
 * ricevuti; Altro salute, computer, aggiornamenti, consumi e preferenze.
 *
 * Le voci di prima (`MENU_TELEFONO` del PC, scritte in `assets/menu.json`)
 * hanno ognuna un posto qui: `NavigazioneTest` lo controlla, così nessuna
 * funzione resta senza casa.
 */
enum class VoceBarra(val id: String, val nome: String) {
    LAVORO("lavoro", "Lavoro"),
    FILE("file", "File"),
    ALTRO("altro", "Altro");

    companion object {
        /** Dove sta adesso una voce di prima (`menu.json` → `telefono[].id`). */
        fun daVoceDiPrima(id: String): VoceBarra? = when (id) {
            "adesso", "chat", "progetti" -> LAVORO
            "file" -> FILE
            "altro" -> ALTRO
            else -> null
        }
    }
}

/**
 * Le sei voci di «Altro» (app 11/11): una per tocco. `impostazione` è l'id
 * della sezione delle impostazioni del PC (`assets/impostazioni.json`).
 */
enum class SezioneAltro(val titolo: String, val sotto: String, val impostazione: String? = null) {
    AGGIORNAMENTI("Aggiornamenti", "L’app e il computer", "aggiornamenti"),
    AVVISI("Notifiche", "Quali suonano, ore di silenzio", "notifiche"),
    SALUTE("Computer e salute", "Accesi o spenti, cosa sistemare, consumi", "computer"),
    CHAT("Tutte le chat", "Rinomina, chiudi"),
    DRIVE("Dati riservati", "Drive, cassaforte, quaderno personale", "drive"),
    INFO("Aiuto", "Versioni, errori, scollega questo telefono", "info");

    companion object {
        /** Dove porta una voce trovata con «Cerca» (l'id della sezione delle impostazioni del PC). */
        fun diImpostazione(id: String, voce: String? = null): SezioneAltro = when (id) {
            "aggiornamenti" -> AGGIORNAMENTI
            "computer" -> SALUTE
            "chat" -> if (voce == "quaderno-personale") DRIVE else CHAT
            "drive" -> DRIVE
            "notifiche" -> AVVISI
            else -> INFO
        }
    }
}

/** Una pagina aperta sopra una voce: il dettaglio che «indietro» chiude per primo. */
sealed interface Dettaglio {
    data class Chat(val id: String) : Dettaglio
    data class Autopilota(val id: String) : Dettaglio
    data class Domanda(val id: String) : Dettaglio
    data class Cartella(val progetto: String, val percorso: String = "") : Dettaglio
    data class Sezione(val sezione: SezioneAltro) : Dettaglio
}

/**
 * Dove si è: la voce e, per ogni voce, la pila dei dettagli aperti (si
 * ritrovano tornandoci). Sta in un `Posto` solo, salvato con la rotazione e
 * con la morte del processo (`Navigazione.salva`/`riprendi`).
 */
data class Posto(
    val voce: VoceBarra = VoceBarra.LAVORO,
    val pile: Map<VoceBarra, List<Dettaglio>> = emptyMap()
) {
    val pila: List<Dettaglio> get() = pile[voce].orEmpty()
    val dettaglio: Dettaglio? get() = pila.lastOrNull()
}

/** Chi chiede di aprire l'app in un posto: una notifica toccata, un'altra app che condivide. */
sealed interface Richiesta {
    data class Domanda(val id: String?) : Richiesta
    data class Chat(val id: String) : Richiesta
    data class Autopilota(val id: String) : Richiesta
    data class Cartella(val progetto: String, val percorso: String = "") : Richiesta
    data object Lavori : Richiesta
    data object Aggiornamenti : Richiesta
    data object File : Richiesta

    companion object {
        /** Le chiavi dell'Intent di una notifica (contratto: `bersaglio.cosa`, `.id`, `.pc`, `.autopilota`). */
        const val COSA = "bersaglio.cosa"
        const val ID = "bersaglio.id"
        const val PC = "bersaglio.pc"
        const val AUTOPILOTA = "bersaglio.autopilota"

        /**
         * Dove porta una notifica: `cosa` è domanda | workspace | autopilota |
         * chat | aggiornamenti | file | lavori. Una domanda senza id apre
         * «Lavoro»; una cosa sconosciuta (notifica più nuova dell'app) anche.
         */
        fun daBersaglio(cosa: String?, id: String?, autopilota: String?): Richiesta? = when (cosa) {
            null, "" -> null
            "domanda" -> Domanda(id?.takeIf { it.isNotBlank() })
            "workspace", "autopilota" -> (autopilota ?: id)?.takeIf { it.isNotBlank() }?.let { Autopilota(it) } ?: Lavori
            "chat" -> id?.takeIf { it.isNotBlank() }?.let { Chat(it) } ?: Lavori
            "aggiornamenti", "aggiornamento" -> Aggiornamenti
            "file" -> File
            else -> Lavori
        }
    }
}

/**
 * La regola della barra e di «indietro», uguale nelle tre voci:
 *
 * 1. chiude il dialogo o il menu aperto (lo fa la schermata, col suo `BackHandler`);
 * 2. chiude l'ultimo dettaglio aperto;
 * 3. torna a Lavoro;
 * 4. da Lavoro esce dall'app.
 */
object Navigazione {
    val INIZIO = Posto()

    /** Il tocco su una voce. Sulla voce in cui sei già: torna al suo inizio. */
    fun tocca(p: Posto, v: VoceBarra): Posto =
        if (p.voce == v) p.copy(pile = p.pile - v) else p.copy(voce = v)

    /** Apre un dettaglio sopra la voce dove sta (uno uguale già in cima non si ripete). */
    fun apri(p: Posto, d: Dettaglio): Posto {
        val voce = voceDi(d) ?: p.voce
        val pila = p.pile[voce].orEmpty()
        val nuova = if (pila.lastOrNull() == d) pila else (pila - d) + d
        return p.copy(voce = voce, pile = p.pile + (voce to nuova))
    }

    private fun voceDi(d: Dettaglio): VoceBarra? = when (d) {
        is Dettaglio.Chat, is Dettaglio.Autopilota, is Dettaglio.Domanda -> VoceBarra.LAVORO
        is Dettaglio.Cartella -> VoceBarra.FILE
        is Dettaglio.Sezione -> VoceBarra.ALTRO
    }

    /** Dove porta «indietro»; `null` = si esce dall'app. */
    fun indietro(p: Posto): Posto? = when {
        p.pila.isNotEmpty() -> p.copy(pile = p.pile + (p.voce to p.pila.dropLast(1)))
        p.voce != VoceBarra.LAVORO -> p.copy(voce = VoceBarra.LAVORO)
        else -> null
    }

    /** Una notifica o un'altra app chiede di aprire un posto. */
    fun verso(p: Posto, r: Richiesta): Posto = when (r) {
        is Richiesta.Domanda -> if (r.id != null) apri(p.copy(pile = p.pile - VoceBarra.LAVORO), Dettaglio.Domanda(r.id)) else p.copy(voce = VoceBarra.LAVORO, pile = p.pile - VoceBarra.LAVORO)
        is Richiesta.Chat -> apri(p.copy(pile = p.pile - VoceBarra.LAVORO), Dettaglio.Chat(r.id))
        is Richiesta.Autopilota -> apri(p.copy(pile = p.pile - VoceBarra.LAVORO), Dettaglio.Autopilota(r.id))
        is Richiesta.Cartella -> apri(p.copy(pile = p.pile - VoceBarra.FILE), Dettaglio.Cartella(r.progetto, r.percorso))
        Richiesta.Lavori -> p.copy(voce = VoceBarra.LAVORO, pile = p.pile - VoceBarra.LAVORO)
        Richiesta.Aggiornamenti -> apri(p.copy(pile = p.pile - VoceBarra.ALTRO), Dettaglio.Sezione(SezioneAltro.AGGIORNAMENTI))
        Richiesta.File -> p.copy(voce = VoceBarra.FILE, pile = p.pile - VoceBarra.FILE)
    }

    /** Le destinazioni di prima (`Scheda`), che le schermate vecchie chiedono ancora. */
    fun verso(p: Posto, s: Scheda): Posto = when (s) {
        Scheda.DOMANDE, Scheda.AUTOPILOTI, Scheda.CHAT, Scheda.PROGETTI -> p.copy(voce = VoceBarra.LAVORO, pile = p.pile - VoceBarra.LAVORO)
        Scheda.FILE -> p.copy(voce = VoceBarra.FILE, pile = p.pile - VoceBarra.FILE)
        Scheda.SALUTE -> apri(p.copy(pile = p.pile - VoceBarra.ALTRO), Dettaglio.Sezione(SezioneAltro.SALUTE))
        Scheda.IMPOSTAZIONI -> p.copy(voce = VoceBarra.ALTRO, pile = p.pile - VoceBarra.ALTRO)
    }

    // ─── salvataggio (rotazione, processo ucciso) ───

    /** In righe di testo: semplice da tenere in un `Bundle` e da leggere nei test. */
    fun salva(p: Posto): ArrayList<String> {
        val righe = arrayListOf("voce|${p.voce.id}")
        for ((v, pila) in p.pile) for (d in pila) righe += "${v.id}|" + when (d) {
            is Dettaglio.Chat -> "chat|${d.id}"
            is Dettaglio.Autopilota -> "autopilota|${d.id}"
            is Dettaglio.Domanda -> "domanda|${d.id}"
            is Dettaglio.Cartella -> "cartella|${d.progetto}|${d.percorso}"
            is Dettaglio.Sezione -> "sezione|${d.sezione.name}"
        }
        return righe
    }

    fun riprendi(righe: List<String>?): Posto {
        if (righe.isNullOrEmpty()) return INIZIO
        var p = INIZIO
        val pile = linkedMapOf<VoceBarra, MutableList<Dettaglio>>()
        for (r in righe) {
            val pezzi = r.split('|')
            if (pezzi[0] == "voce") { p = p.copy(voce = VoceBarra.entries.firstOrNull { it.id == pezzi.getOrNull(1) } ?: VoceBarra.LAVORO); continue }
            val v = VoceBarra.entries.firstOrNull { it.id == pezzi[0] } ?: continue
            val d: Dettaglio = when (pezzi.getOrNull(1)) {
                "chat" -> Dettaglio.Chat(pezzi.drop(2).joinToString("|"))
                "autopilota" -> Dettaglio.Autopilota(pezzi.drop(2).joinToString("|"))
                "domanda" -> Dettaglio.Domanda(pezzi.drop(2).joinToString("|"))
                "cartella" -> Dettaglio.Cartella(pezzi.getOrElse(2) { "" }, pezzi.drop(3).joinToString("|"))
                "sezione" -> SezioneAltro.entries.firstOrNull { it.name == pezzi.getOrNull(2) }?.let { Dettaglio.Sezione(it) } ?: continue
                else -> continue
            }
            pile.getOrPut(v) { mutableListOf() } += d
        }
        return p.copy(pile = pile.mapValues { it.value.toList() })
    }
}
