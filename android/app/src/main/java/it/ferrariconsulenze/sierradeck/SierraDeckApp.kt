package it.ferrariconsulenze.sierradeck

import android.app.Application
import it.ferrariconsulenze.sierradeck.dati.Telefono
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.rete.Rete
import it.ferrariconsulenze.sierradeck.sottofondo.Guasti

/**
 * La porta d'ingresso di **ogni** processo dell'app (11/11).
 *
 * Android la crea prima di qualunque Activity, ricevitore, servizio o lavoro:
 * una notifica toccata, la sveglia della guardia, WorkManager che riparte dopo
 * un riavvio. Prima il contesto lo depositava a mano chi arrivava per primo
 * (`Rete.ricorda` in due posti soli) e un processo avviato da un lavoro usciva
 * dalla rete sbagliata, senza il ripiego dell'altra strada. Il gestore dei
 * guasti stava nell'Activity: i crolli in sottofondo sparivano.
 */
class SierraDeckApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Guasti.prendiNota(this)
        Rete.ricorda(this)
        Percorsi.osserva(this)
        Telefono.avvia(this)
    }
}
