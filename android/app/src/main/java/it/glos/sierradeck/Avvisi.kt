package it.glos.sierradeck

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
        /** Le notifiche con lo stesso numero si sostituiscono a vicenda. */
        val id: Int
    )

    const val ID_DOMANDA = 2
    const val ID_FINITO = 100
    const val ID_FERMO = 500

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

        val domande = stato.optJSONArray("domande")
        if (domande != null) {
            for (i in 0 until domande.length()) {
                val d = domande.getJSONObject(i)
                val id = d.optString("id")
                if (id.isEmpty() || !giaVisti.add("d:$id")) continue
                avvisi.add(
                    Avviso(
                        chiave = "d:$id",
                        titolo = "SierraDeck ti sta chiedendo una cosa",
                        testo = d.optString("testo", "Serve una tua risposta"),
                        id = ID_DOMANDA
                    )
                )
            }
        }

        val autopiloti = stato.optJSONArray("autopiloti") ?: return avvisi
        for (i in 0 until autopiloti.length()) {
            val a = autopiloti.getJSONObject(i)
            val id = a.optString("id")
            if (id.isEmpty()) continue
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
                            id = ID_FINITO + (id.hashCode() and 0xFFF)
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
                            id = ID_FERMO + (id.hashCode() and 0xFFF)
                        )
                    )
                }
                // Chi riparte torna annunciabile: se domani si ferma di nuovo,
                // è una notizia nuova e va detta.
                else -> giaVisti.remove("s:$id")
            }
        }
        return avvisi
    }
}
