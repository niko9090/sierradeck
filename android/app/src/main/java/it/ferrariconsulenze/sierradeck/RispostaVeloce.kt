package it.ferrariconsulenze.sierradeck

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import it.ferrariconsulenze.sierradeck.sottofondo.Avvisatore
import it.ferrariconsulenze.sierradeck.sottofondo.CodaRisposte
import it.ferrariconsulenze.sierradeck.sottofondo.EsitoInvio
import it.ferrariconsulenze.sierradeck.sottofondo.InvioRisposta
import it.ferrariconsulenze.sierradeck.sottofondo.InvioRisposte
import it.ferrariconsulenze.sierradeck.sottofondo.Porte
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

/**
 * Rispondere dalla notifica, senza aprire niente (app 2.100.0).
 *
 * Arriva da un tasto con la risposta pronta («Sì», la consigliata…) o da
 * «Scrivi…» col testo battuto. Si prova subito (`goAsync`, al più 8 s); se il
 * computer non si raggiunge la notifica dice «Non inviata, riprovo da solo» e
 * la risposta entra nella coda di [InvioRisposte], con lo stesso id della
 * richiesta a ogni tentativo: il PC non la conta due volte.
 */
class RispostaVeloce : BroadcastReceiver() {

    override fun onReceive(contesto: Context, intent: Intent) {
        val avviso = intent.getStringExtra(EXTRA_AVVISO) ?: return
        val testo = (intent.getStringExtra(EXTRA_RISPOSTA)
            ?: RemoteInput.getResultsFromIntent(intent)?.getCharSequence(CHIAVE_TESTO)?.toString())?.trim()
        // Invio a vuoto: la notifica resta com'era.
        if (testo.isNullOrEmpty()) return
        val app = contesto.applicationContext
        val invio = InvioRisposta(
            idRichiesta = UUID.randomUUID().toString(),
            avviso = avviso,
            titolo = intent.getStringExtra(EXTRA_TITOLO) ?: "SierraDeck",
            cosa = intent.getStringExtra(EXTRA_COSA) ?: "domanda",
            bersaglio = intent.getStringExtra(EXTRA_BERSAGLIO) ?: return,
            pc = intent.getStringExtra(EXTRA_PC),
            testo = testo,
            domanda = intent.getStringExtra(EXTRA_TESTO_DOMANDA) ?: "",
            creata = System.currentTimeMillis()
        )
        // Subito un riscontro: una notifica identica dopo il tocco sembra non aver sentito.
        Avvisatore.inInvio(app, invio.avviso, invio.titolo, invio.testo)
        val attesa = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try { prova(app, invio) } catch (e: Exception) {
                Log.e("SierraDeck", "risposta dalla notifica non partita", e)
                InvioRisposte.accoda(app, invio)
                Avvisatore.nonInviata(app, invio.avviso, invio.titolo, invio.testo)
            } finally { attesa.finish() }
        }
    }

    private suspend fun prova(c: Context, invio: InvioRisposta) {
        val esito = withTimeoutOrNull(8_000) {
            val porta = Porte.delPc(c) ?: return@withTimeoutOrNull null
            CodaRisposte.manda(porta, invio)
        }
        when (esito?.let { CodaRisposte.esito(it) } ?: EsitoInvio.RIPROVA) {
            EsitoInvio.PRESA -> Avvisatore.risposto(c, invio.avviso, invio.titolo, invio.domanda, invio.testo)
            EsitoInvio.RIFIUTATA -> Avvisatore.rifiutata(c, invio.avviso, invio.titolo, (esito as? it.ferrariconsulenze.sierradeck.rete.Esito.Rifiuto)?.motivo)
            EsitoInvio.RIPROVA -> {
                InvioRisposte.accoda(c, invio)
                Avvisatore.nonInviata(c, invio.avviso, invio.titolo, invio.testo)
            }
        }
    }

    companion object {
        const val CHIAVE_TESTO = "testo"
        const val EXTRA_AVVISO = "avviso"
        const val EXTRA_TITOLO = "titolo"
        const val EXTRA_COSA = "cosa"
        const val EXTRA_BERSAGLIO = "bersaglio"
        const val EXTRA_PC = "pc"
        const val EXTRA_RISPOSTA = "risposta"
        /** Il testo intero della domanda (0.84.0): resta nella notifica sopra la risposta. */
        const val EXTRA_TESTO_DOMANDA = "testoDomanda"

        /** La domanda intera e, sotto, «Hai risposto: …» (0.84.0). */
        fun testoDopoRisposta(domanda: String, risposta: String): String =
            "${domanda.trim()}\n\nHai risposto: ${risposta.trim()}"
    }
}
