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
 * domanda che aspetta, un lavoro che si è fermato, un lavoro che ha finito. Non
 * «sta lavorando», che non chiede niente a nessuno.
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
                if (id.isEmpty() || c.optBoolean("governata", false)) continue
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
        if (autopiloti == null) {
            pota(giaVisti, vivi, stato)
            return avvisi
        }
        for (i in 0 until autopiloti.length()) {
            val a = autopiloti.getJSONObject(i)
            val id = a.optString("id")
            if (id.isEmpty()) continue
            vivi.add("f:$id")
            vivi.add("s:$id")
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
                    if (!giaVisti.add("s:$id") || primoGiro) continue
                    val motivo = a.optString("motivoSospensione", "")
                    avvisi.add(
                        Avviso(
                            chiave = "s:$id",
                            titolo = "$nome si è fermato",
                            testo = if (motivo.isEmpty()) "Serve una tua occhiata." else motivo,
                            id = idAvviso(ID_FERMO, id)
                        )
                    )
                }
                // Chi riparte torna annunciabile: se domani si ferma di nuovo,
                // è una notizia nuova e va detta.
                else -> giaVisti.remove("s:$id")
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
    private fun pota(giaVisti: MutableSet<String>, vivi: Set<String>, stato: JSONObject) {
        val note = mutableListOf<String>()
        if (stato.optJSONArray("domande") != null) note.add("d:")
        if (stato.optJSONArray("chat") != null) note.add("c:")
        if (stato.optJSONArray("autopiloti") != null) { note.add("f:"); note.add("s:") }
        if (note.isEmpty()) return
        giaVisti.retainAll { chiave -> note.none { chiave.startsWith(it) } || chiave in vivi }
    }
}
