package it.ferrariconsulenze.sierradeck.dati

import android.content.Context
import android.content.SharedPreferences
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.rete.Centralino
import it.ferrariconsulenze.sierradeck.rete.Contatto
import it.ferrariconsulenze.sierradeck.rete.Diario
import it.ferrariconsulenze.sierradeck.rete.RetiAndroid
import it.ferrariconsulenze.sierradeck.rete.Scoperta
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.io.File

/**
 * Le cose che il telefono tiene una volta sola per processo (11/11): la rubrica
 * dei PC e il Centralino. Le crea `SierraDeckApp`, così una notifica, un lavoro
 * in sottofondo e le schermate parlano col PC dalla stessa porta.
 */
object Telefono {
    class Insieme(val rubrica: RubricaPreferenze, val centralino: Centralino, val ambito: CoroutineScope, val diario: Diario)

    @Volatile private var insieme: Insieme? = null
    /** Tenuto qui: le preferenze tengono l'ascoltatore solo con un riferimento debole. */
    private var ascoltatore: SharedPreferences.OnSharedPreferenceChangeListener? = null

    val pronto: Insieme? get() = insieme
    val centralino: Centralino? get() = insieme?.centralino
    val rubrica: RubricaPreferenze? get() = insieme?.rubrica

    @Synchronized
    fun avvia(contesto: Context): Insieme {
        insieme?.let { return it }
        val app = contesto.applicationContext
        val ambito = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val rubrica = RubricaPreferenze(app)
        val diario = Diario(File(app.filesDir, "diario-collegamenti.json"))
        val centralino = Centralino(rubrica, RetiAndroid(app), diario, ambito, scoperti = Scoperta::indirizziDi)
        val i = Insieme(rubrica, centralino, ambito, diario)
        insieme = i
        ambito.launch(Dispatchers.IO) { rubrica.carica() }
        // Il codice di prima (accoppiamento, scelta del PC, «Dimentica») scrive
        // ancora le preferenze: la rubrica si rilegge quando cambiano quelle sue.
        val l = SharedPreferences.OnSharedPreferenceChangeListener { _, chiave ->
            if (chiave == null || chiave == "postazioni" || chiave == "indirizzo" || chiave.startsWith("chiave:")) {
                ambito.launch(Dispatchers.IO) { rubrica.carica() }
            }
        }
        ascoltatore = l
        app.getSharedPreferences("sierradeck", Context.MODE_PRIVATE).registerOnSharedPreferenceChangeListener(l)
        ambito.launch { Davanti.flusso.drop(1).filter { it }.collect { centralino.riprova(null) } }
        Scoperta.quandoVisto = { impronta -> centralino.visto(impronta) }
        // La coda degli invii: riparte da sola quando un PC torna collegato.
        CodaInvii.avvia(
            File(app.filesDir, "dati"), ambito,
            manda = { inv -> centralino.chiama(inv.pc, inv.rotta, inv.corpo, inv.id) },
            collegati = centralino.contatti.map { m -> m.filterValues { it is Contatto.Collegato }.keys }.distinctUntilChanged()
        )
        return i
    }
}
