package it.ferrariconsulenze.sierradeck

import org.json.JSONObject

/**
 * Quali avvisi meritano di svegliare il telefono.
 *
 * Sta qui, fuori dal servizio, perché è la parte che si può sbagliare in
 * silenzio: una notifica che non arriva non la vedi — e una che arriva due
 * volte, o che arriva quando non serve, insegna a ignorarle tutte. Fuori da
 * Android si può provare con dei numeri invece che con un telefono in mano.
 *
 * La regola è una sola: **si annuncia ciò che chiede qualcosa a te.** Una
 * domanda che aspetta, una chat ferma su una scelta, una chat che ha finito il
 * turno, un lavoro che si è fermato o che aspetta il via, un lavoro che ha
 * finito. Non «sta lavorando», che non chiede niente a nessuno.
 */
object Avvisi {

    /** Un avviso da dare, già scritto come lo leggerai. */
    data class Avviso(
        /** Chi lo ha generato: la stessa cosa non si annuncia due volte. */
        val chiave: String,
        val titolo: String,
        val testo: String,
        /**
         * L'identificatore della domanda, quando l'avviso è una domanda.
         *
         * Serve a rispondere **dalla notifica**: senza, il testo si legge e
         * poi bisogna aprire l’app, trovare la chat, e a quel punto la
         * risposta l’hai già pensata due volte.
         */
        val domanda: String? = null,
        /** La chat a cui scrivere dalla notifica, quando è una chat che aspetta. */
        val chat: String? = null,
        /**
         * La chat che aspetta una **scelta** (un permesso, «vuoi procedere?»).
         *
         * Non ha risposta nella notifica: una scelta si fa toccando
         * un'opzione, e un testo scritto finirebbe nel campo invece di
         * scegliere. Toccata, la notifica apre la scheda Domande, dove ci sono
         * i pulsanti.
         */
        val scelta: String? = null,
        /** Le notifiche con lo stesso numero si sostituiscono a vicenda. */
        val id: Int
    )

    /**
     * Le famiglie di avviso stanno in bande che non si toccano.
     *
     * Prima erano 100, 500 e 900 con dodici bit di impronta sopra: bande larghe
     * 4096 che partivano a quattrocento di distanza, cioe' **sovrapposte per
     * quasi tutta la loro lunghezza**. Due autopiloti diversi — uno che finisce
     * e uno che si ferma — potevano cadere sullo stesso numero, e il secondo
     * avviso cancellava il primo: si perdeva proprio quello che chiedeva
     * qualcosa.
     *
     * Con un passo di centomila e un'impronta di sedici bit le bande sono
     * larghe 65536 e distanti 100000: non si incontrano mai.
     */
    const val PASSO_FAMIGLIA = 100_000
    private const val MASCHERA = 0xFFFF

    const val ID_DOMANDA = 1 * PASSO_FAMIGLIA
    const val ID_FINITO = 2 * PASSO_FAMIGLIA
    const val ID_FERMO = 3 * PASSO_FAMIGLIA
    const val ID_ASPETTA = 4 * PASSO_FAMIGLIA
    const val ID_SCELTA = 5 * PASSO_FAMIGLIA
    const val ID_PRONTO = 6 * PASSO_FAMIGLIA

    /** Il numero di una notifica: la sua famiglia, piu' l'impronta di chi la manda. */
    fun idAvviso(famiglia: Int, chiave: String): Int = famiglia + (chiave.hashCode() and MASCHERA)

    /**
     * Cosa annunciare, dato lo stato del computer e ciò che si è già detto.
     *
     * `giaVisti` entra e **esce** modificato: chi chiama lo conserva fra un giro
     * e l'altro, ed è ciò che impedisce a una notifica di ripetersi ogni cinque
     * secondi finché non si spegne il computer.
     *
     * Al `primoGiro` si tace su ciò che è già successo: gli autopiloti finiti
     * ieri non sono una notizia, e riceverne cinque all'apertura dell'app
     * insegna a ignorare anche quella che conta. Le domande invece si annunciano
     * subito: una domanda aperta sta aspettando **adesso**.
     */
    fun daAnnunciare(stato: JSONObject, giaVisti: MutableSet<String>, primoGiro: Boolean): List<Avviso> {
        val avvisi = mutableListOf<Avviso>()
        /**
         * Le chiavi di cui **questo** stato parla ancora.
         *
         * `giaVisti` vive quanto il processo, e la guardia gira per giorni. Le
         * chiavi delle chat e degli autopiloti ripartiti si toglievano da sole,
         * ma quelle delle domande (`d:`) e dei lavori finiti (`f:`) no: una
         * domanda ha un id nuovo ogni volta, quindi l'insieme cresceva a ogni
         * domanda mai fatta e non tornava piu' indietro.
         */
        val vivi = mutableSetOf<String>()

        val domande = stato.optJSONArray("domande")
        if (domande != null) {
            for (i in 0 until domande.length()) {
                val d = domande.getJSONObject(i)
                val id = d.optString("id")
                if (id.isEmpty()) continue
                vivi.add("d:$id")
                if (!giaVisti.add("d:$id")) continue
                avvisi.add(
                    Avviso(
                        chiave = "d:$id",
                        titolo = "SierraDeck ti sta chiedendo una cosa",
                        testo = d.optString("testo", "Serve una tua risposta"),
                        domanda = id,
                        // Una per domanda, non una sola per tutte: con l'id
                        // fisso, la seconda domanda aperta cancellava la prima
                        // e restava senza risposta perche' nessuno la vedeva.
                        id = idAvviso(ID_DOMANDA, id)
                    )
                )
            }
        }

        // Le chat che hanno finito di scrivere e aspettano te.
        //
        // Si annuncia il **passaggio**, non lo stato: una chat ferma al
        // prompt lo è per ore, e dirlo ogni cinque secondi è il modo più
        // veloce per far spegnere le notifiche. Quando riprende a lavorare
        // torna annunciabile, perché la prossima volta che si ferma è di
        // nuovo una notizia.
        //
        // Quelle governate da un autopilota tacciono: è lui a parlare per
        // loro, e due avvisi per lo stesso fatto sono uno di troppo.
        val chat = stato.optJSONArray("chat")
        if (chat != null) {
            for (i in 0 until chat.length()) {
                val c = chat.getJSONObject(i)
                val id = c.optString("id")
                if (id.isEmpty()) continue
                // Una scelta aperta (un permesso, «vuoi procedere?») blocca la
                // chat finche' non tocchi un'opzione: e' una domanda a tutti
                // gli effetti, e fino alla 2.37 non si annunciava — si vedeva
                // solo aprendo l'app. Vale anche per le governate: l'autopilota
                // non concede permessi al posto tuo. Come le domande, si dice
                // anche al primo giro: sta aspettando adesso.
                vivi.add("k:$id")
                if (c.optBoolean("chiede", false)) {
                    if (giaVisti.add("k:$id")) {
                        val titolo = c.optString("titolo").ifBlank { c.optString("cwd") }
                        avvisi.add(
                            Avviso(
                                chiave = "k:$id",
                                titolo = "«$titolo» aspetta che tu scelga",
                                testo = "Sullo schermo c'è un elenco di scelte (un permesso, «vuoi procedere?»). Tocca per vedere le opzioni.",
                                scelta = id,
                                id = idAvviso(ID_SCELTA, id)
                            )
                        )
                    }
                    // La stessa pausa non si annuncia due volte: «aspetta che
                    // tu scelga» dice gia' tutto, «aspetta te» sarebbe un doppione.
                    vivi.add("c:$id")
                    giaVisti.add("c:$id")
                    continue
                }
                giaVisti.remove("k:$id")
                if (c.optBoolean("governata", false)) continue
                vivi.add("c:$id")
                if (!c.optBoolean("aspetta", false)) {
                    giaVisti.remove("c:$id")
                    continue
                }
                if (!giaVisti.add("c:$id") || primoGiro) continue
                val titolo = c.optString("titolo").ifBlank { c.optString("cwd") }
                avvisi.add(
                    Avviso(
                        chiave = "c:$id",
                        titolo = "«$titolo» aspetta te",
                        testo = c.optString("ultimaRiga").ifBlank { "Ha finito di scrivere." },
                        chat = id,
                        id = idAvviso(ID_ASPETTA, id)
                    )
                )
            }
        }

        val autopiloti = stato.optJSONArray("autopiloti")
        // Il servizio degli autopiloti non ha risposto (`autopilotiLetti`
        // falso, 0.37.0): l'elenco arriva vuoto ma non vuol dire «nessuno».
        // Prima si dimenticavano i fermi gia' annunciati e, al ritorno del
        // servizio, si annunciavano tutti di nuovo.
        val letti = stato.optBoolean("autopilotiLetti", true)
        if (autopiloti == null || !letti) {
            pota(giaVisti, vivi, stato, conAutopiloti = false)
            return avvisi
        }
        for (i in 0 until autopiloti.length()) {
            val a = autopiloti.getJSONObject(i)
            val id = a.optString("id")
            if (id.isEmpty()) continue
            vivi.add("f:$id")
            vivi.add("s:$id")
            vivi.add("p:$id")
            val nome = a.optString("nome", "Un autopilota")
            when (a.optString("stato")) {
                "finito" -> {
                    if (!giaVisti.add("f:$id") || primoGiro) continue
                    avvisi.add(
                        Avviso(
                            chiave = "f:$id",
                            titolo = "SierraDeck ha finito un lavoro",
                            testo = "$nome ha finito",
                            // Un identificatore stabile e non la posizione
                            // nell'elenco: due lavori che finiscono a distanza
                            // di minuti cambiano posto, e il secondo
                            // cancellerebbe il primo.
                            id = idAvviso(ID_FINITO, id)
                        )
                    )
                }
                // Un autopilota fermo chiede qualcosa a te quanto una domanda:
                // finché non lo guardi, il lavoro non prosegue. Prima si taceva,
                // e lo si scopriva la mattina dopo.
                "sospeso", "fallito" -> {
                    // La chiave di **questo** fermo (id, momento, motivo) dal
                    // computer, 0.37.0: lo stesso fermo una volta sola, quello
                    // nuovo di nuovo. Un computer piu' vecchio non la manda, e
                    // si resta all'id. Un autopilota archiviato tace.
                    val chiave = chiaveFermo(a)
                    vivi.add(chiave)
                    if (!giaVisti.add(chiave) || primoGiro || a.optBoolean("archiviato", false)) continue
                    // `/api/stato` lo chiama `motivo` (e' il dettaglio,
                    // `/api/autopilota`, a chiamarlo `motivoSospensione`): la
                    // notifica leggeva il nome sbagliato e diceva sempre
                    // «Serve una tua occhiata» invece del perche'.
                    val motivo = a.optString("motivo", "").ifEmpty { a.optString("motivoSospensione", "") }
                    avvisi.add(
                        Avviso(
                            chiave = chiave,
                            titolo = "$nome si è fermato",
                            testo = if (motivo.isEmpty()) "Serve una tua occhiata." else motivo,
                            id = idAvviso(ID_FERMO, id)
                        )
                    )
                }
                // Si e' preparato e aspetta il via: senza di te non parte, come
                // uno fermo. La banda e il pallino lo dicevano gia'; la
                // notifica no, e ad app chiusa lo si scopriva ore dopo.
                "pronto" -> {
                    giaVisti.remove("s:$id")
                    if (!giaVisti.add("p:$id") || primoGiro) continue
                    avvisi.add(
                        Avviso(
                            chiave = "p:$id",
                            titolo = "$nome aspetta il tuo via",
                            testo = "Ha letto il progetto e capito l'obiettivo. Non comincia finché non glielo dici: apri Lavori e premi «Vai».",
                            id = idAvviso(ID_PRONTO, id)
                        )
                    )
                }
                // Chi riparte torna annunciabile: se domani si ferma di nuovo,
                // è una notizia nuova e va detta.
                else -> { giaVisti.remove("s:$id"); giaVisti.remove("p:$id") }
            }
        }
        pota(giaVisti, vivi, stato)
        return avvisi
    }

    /**
     * Toglie dal ricordo cio' di cui lo stato non parla piu'.
     *
     * Si pota **solo** una famiglia di cui questo stato ha davvero l'elenco: un
     * computer che non manda le domande non deve far dimenticare le domande gia'
     * annunciate, o al giro dopo tornerebbero tutte insieme.
     */
    private fun pota(giaVisti: MutableSet<String>, vivi: Set<String>, stato: JSONObject, conAutopiloti: Boolean = true) {
        val note = mutableListOf<String>()
        if (stato.optJSONArray("domande") != null) note.add("d:")
        if (stato.optJSONArray("chat") != null) { note.add("c:"); note.add("k:") }
        if (conAutopiloti && stato.optJSONArray("autopiloti") != null) { note.add("f:"); note.add("s:"); note.add("p:") }
        if (note.isEmpty()) return
        giaVisti.retainAll { chiave -> note.none { chiave.startsWith(it) } || chiave in vivi }
    }
}

/**
 * La chiave del fermo di un autopilota per le notifiche (0.37.0): `s:` + la
 * chiave che manda il computer (id, momento, motivo), o `s:<id>` da un
 * computer che non la manda ancora.
 */
fun chiaveFermo(a: JSONObject): String {
    val fermo = a.optString("fermo", "")
    return if (fermo.isNotEmpty()) "s:$fermo" else "s:${a.optString("id")}"
}

/**
 * La riga fissa del controllo continuo, pura: quante chat, e quante chiedono
 * qualcosa a te. Contava anche le governate (per loro parla l'autopilota) e
 * non le scelte, cioe' diceva «nessuna ti aspetta» davanti a un permesso.
 */
fun rigaPresenza(stato: JSONObject): String {
    val chat = stato.optJSONArray("chat")
    val quante = chat?.length() ?: 0
    var aspettano = 0
    for (i in 0 until quante) {
        val c = chat?.optJSONObject(i) ?: continue
        val chiede = c.optBoolean("chiede", false)
        if (chiede || (c.optBoolean("aspetta", false) && !c.optBoolean("governata", false))) aspettano += 1
    }
    val domande = stato.optJSONArray("domande")?.length() ?: 0
    return when {
        domande > 0 -> if (domande == 1) "Un autopilota ti sta chiedendo una cosa" else "$domande domande aspettano te"
        aspettano > 0 -> "$aspettano su $quante chat aspettano te"
        quante > 0 -> "$quante chat, nessuna ti aspetta"
        else -> "Nessuna chat aperta"
    }
}
