package it.ferrariconsulenze.sierradeck

/**
 * **Le quattro voci fisse** (app 2.83.0, PC 0.83.0): Adesso, Chat, Progetti,
 * Altro. Nicholas (21/10): «fruibile al meglio, veloce, graficamente intuitiva
 * e leggibile». Prima erano sette, con i nomi su due righe a 10 sp
 * («Autopilo-ti», «Imposta-zioni»); ogni funzione di prima ha qui il suo posto
 * (mappa: `.sierradeck/quaderno/app-android-0-83-0.md`).
 *
 * L'ordine e i nomi vengono da `MENU_TELEFONO` in `src/shared/menu-principale.ts`,
 * scritti in `assets/menu.json`: `NavigazioneTest` controlla che questo enum sia
 * uguale, come la pagina servita dal PC.
 *
 * «Adesso» era stata tolta nella 0.61.0 perché nove volte su dieci era vuota.
 * Questa è un'altra cosa: le domande per te in cima, sotto gli autopiloti.
 */
enum class VoceBarra(val id: String, val nome: String) {
    ADESSO("adesso", "Adesso"),
    CHAT("chat", "Chat"),
    PROGETTI("progetti", "Progetti"),
    ALTRO("altro", "Altro")
}

/** Le linguette in cima a una voce, la prima è quella di partenza. Adesso e Altro non ne hanno. */
fun linguetteDi(v: VoceBarra): List<String> = when (v) {
    VoceBarra.CHAT -> listOf("Chat", "Workspace", "Negozio")
    VoceBarra.PROGETTI -> listOf("Progetti", "File", "Drive")
    else -> emptyList()
}

/**
 * Le sezioni di «Altro»: un elenco, e una sezione per tocco. Prima erano le
 * schede Salute e Impostazioni, una sotto l'altra in una pagina lunga.
 * `impostazione` è l'id della sezione delle impostazioni del PC
 * (`assets/impostazioni.json`) che le fa da testata, se c'è.
 */
enum class SezioneAltro(val titolo: String, val sotto: String, val impostazione: String? = null) {
    SALUTE("Salute del sistema", "Da sistemare, computer, Drive, errori"),
    ALTRI_PC("Altri computer", "Accesi o spenti, chat dal vivo, cassetta", "computer"),
    CONSUMI("Consumi", "Token, limiti del piano, contesto"),
    AGGIORNAMENTI("Aggiornamenti", "L’app e il computer", "aggiornamenti"),
    CHAT("Chat", "Workspace a elenco, Torna come prima", "chat"),
    QUADERNO("Quaderno personale", "Le tue note per tutte le chat"),
    DRIVE("Drive", "Account Google, cassaforte, salvataggio", "drive"),
    ASPETTO("Aspetto", "Banco o Foglio, chiarore", "aspetto"),
    AVVISI("Avvisi", "Controllo continuo, quali notifiche", "notifiche"),
    INFO("Info ed errori", "Versioni, Copia i dettagli, errori", "info");

    companion object {
        /** Dove porta una voce trovata con «Cerca» (l'id della sezione delle impostazioni del PC). */
        fun diImpostazione(id: String, voce: String? = null): SezioneAltro = when (id) {
            "aggiornamenti" -> AGGIORNAMENTI
            "computer" -> ALTRI_PC
            "chat" -> if (voce == "quaderno-personale") QUADERNO else CHAT
            "drive" -> DRIVE
            "aspetto" -> ASPETTO
            "notifiche" -> AVVISI
            else -> INFO
        }
    }
}

/**
 * Dove si è: la voce, la linguetta di ogni voce (si ricorda tornandoci) e la
 * sezione di Altro aperta. I dettagli dentro una schermata (una chat, un
 * autopilota, una cartella) li tiene la schermata, con il suo «indietro».
 */
data class Posto(
    val voce: VoceBarra = VoceBarra.ADESSO,
    val linguette: Map<VoceBarra, Int> = emptyMap(),
    val sezione: SezioneAltro? = null
) {
    val linguetta: Int get() = linguette[voce] ?: 0
}

/**
 * La regola della barra e di «indietro», uguale in tutte e quattro le voci (e
 * nella pagina servita dal PC):
 *
 * 1. chiude il dialogo o il menu aperto;
 * 2. chiude il dettaglio aperto (chat, autopilota, cartella, progetto, sezione di Altro);
 * 3. torna alla prima linguetta della voce;
 * 4. torna ad Adesso;
 * 5. da Adesso esce dall'app.
 *
 * I passi 1 e 2 dentro una schermata li fanno i suoi `BackHandler`, che stanno
 * più in fondo e quindi vincono; qui la sezione di Altro e i passi 3-5.
 */
object Navigazione {
    /** Si apre su Adesso: le domande per te sono la prima cosa da vedere. */
    val INIZIO = Posto()

    /** Il tocco su una voce della barra. Sulla voce in cui sei già: torna al suo inizio. */
    fun tocca(p: Posto, v: VoceBarra): Posto =
        if (p.voce == v) p.copy(linguette = p.linguette - v, sezione = null)
        else p.copy(voce = v, sezione = null)

    fun linguetta(p: Posto, i: Int): Posto =
        if (i == 0) p.copy(linguette = p.linguette - p.voce) else p.copy(linguette = p.linguette + (p.voce to i))

    fun apri(p: Posto, s: SezioneAltro): Posto = p.copy(voce = VoceBarra.ALTRO, sezione = s)

    /** Dove porta «indietro»; `null` = si esce dall'app. */
    fun indietro(p: Posto): Posto? = when {
        p.sezione != null -> p.copy(sezione = null)
        p.linguetta != 0 -> p.copy(linguette = p.linguette - p.voce)
        p.voce != VoceBarra.ADESSO -> p.copy(voce = VoceBarra.ADESSO)
        else -> null
    }

    /**
     * Dove porta una destinazione di prima (`Scheda`): le notifiche, «Apri la
     * chat», «Apri cartella», «Chat di X dal vivo» la chiedono ancora così.
     */
    fun verso(p: Posto, s: Scheda): Posto = when (s) {
        Scheda.DOMANDE, Scheda.AUTOPILOTI -> p.copy(voce = VoceBarra.ADESSO, sezione = null)
        Scheda.CHAT -> p.copy(voce = VoceBarra.CHAT, linguette = p.linguette - VoceBarra.CHAT, sezione = null)
        Scheda.PROGETTI -> p.copy(voce = VoceBarra.PROGETTI, linguette = p.linguette - VoceBarra.PROGETTI, sezione = null)
        Scheda.FILE -> p.copy(voce = VoceBarra.PROGETTI, linguette = p.linguette + (VoceBarra.PROGETTI to 1), sezione = null)
        Scheda.SALUTE -> p.copy(voce = VoceBarra.ALTRO, sezione = SezioneAltro.SALUTE)
        Scheda.IMPOSTAZIONI -> p.copy(voce = VoceBarra.ALTRO, sezione = null)
    }
}
