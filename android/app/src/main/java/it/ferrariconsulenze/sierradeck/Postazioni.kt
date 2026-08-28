package it.ferrariconsulenze.sierradeck

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * I computer con cui questo telefono lavora.
 *
 * L'app è nata pensando a **un** computer, e per un po' andava bene. Ma chi ne
 * ha tre in casa — il fisso, il portatile, quello di lavoro — si trovava
 * legato al primo con cui si era accoppiato: l'indirizzo era uno solo, e per
 * cambiarlo bisognava buttare via l'accoppiamento e rifarlo col QR. Cioè
 * cambiare computer costava quanto perderne uno.
 *
 * La cosa curiosa è che metà del lavoro c'era già: le chiavi sono sempre state
 * salvate **per indirizzo** (`Collegamento.chiaveDi`), e l'elenco degli
 * indirizzi noti veniva scritto a ogni accoppiamento. Solo che non lo leggeva
 * nessuno — come la nota dei guasti, scritta per mesi e mai mostrata. Qui
 * quella memoria diventa una cosa che si vede e si tocca.
 *
 * ## Tenuta o di passaggio
 *
 * Una postazione **tenuta** (spuntata) non si dimentica mai: è il computer di
 * casa, quello che vuoi ritrovare fra un mese. Una non tenuta è di passaggio —
 * il portatile di un amico, una prova — e resta finché non è troppo vecchia
 * per interessare a qualcuno. Senza questa distinzione l'elenco diventerebbe
 * una discarica di indirizzi provati una volta, e cercare il proprio computer
 * dentro sarebbe peggio che digitarlo.
 */
object Postazioni {

    /** Quante di passaggio si tengono: oltre non è più una scelta, è un elenco. */
    private const val DI_PASSAGGIO_MAX = 5

    /**
     * Ogni quanto si riscrive «l'ho usata adesso».
     *
     * Serve solo a ordinare l'elenco: al minuto e' gia' una precisione
     * superflua, e il polso che chiama questa funzione batte ogni due secondi.
     */
    private const val PASSO_USO_MS = 60_000L
    private const val CHIAVE = "postazioni"

    data class Postazione(
        /** L'indirizzo normalizzato: è l'identità, non il nome. */
        val indirizzo: String,
        /** Come si chiama. Lo dice il computer stesso, o lo scrivi tu. */
        val nome: String,
        /** Spuntata: non si dimentica mai. */
        val tenuta: Boolean,
        val ultimoUso: Long
    )

    private fun prefs(contesto: Context) =
        contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    /**
     * Tutte, la più usata di recente per prima.
     *
     * Le tenute non vanno in cima d'ufficio: chi ne ha tre spuntate vuole
     * ritrovare quella di ieri dov'era, non ordinata per una spunta che ha
     * messo mesi fa. La spunta decide se sopravvive, non dove sta.
     */
    fun elenca(contesto: Context): List<Postazione> {
        val grezzo = prefs(contesto).getString(CHIAVE, "") ?: ""
        val lista = mutableListOf<Postazione>()
        if (grezzo.isNotBlank()) {
            try {
                val a = JSONArray(grezzo)
                for (i in 0 until a.length()) {
                    val o = a.optJSONObject(i) ?: continue
                    val indirizzo = o.optString("indirizzo", "")
                    if (indirizzo.isBlank()) continue
                    lista.add(
                        Postazione(
                            indirizzo = indirizzo,
                            nome = o.optString("nome", "").ifBlank { hostDi(indirizzo) },
                            tenuta = o.optBoolean("tenuta", false),
                            ultimoUso = o.optLong("ultimoUso", 0L)
                        )
                    )
                }
            } catch (e: Exception) {
                // Un elenco illeggibile vale come nessun elenco: non è un
                // guasto da mostrare, è una memoria che riparte.
            }
        }
        // Il recupero dalla vecchia memoria: gli indirizzi noti erano già
        // scritti, e sarebbe assurdo far ricominciare da zero chi ha già
        // accoppiato dei computer prima che questa schermata esistesse.
        if (lista.isEmpty()) {
            for (vecchio in Collegamento(contesto).indirizziNoti()) {
                lista.add(Postazione(vecchio, hostDi(vecchio), tenuta = true, ultimoUso = 0L))
            }
            if (lista.isNotEmpty()) scrivi(contesto, lista)
        }
        return lista.sortedByDescending { it.ultimoUso }
    }

    /** Quella che si sta usando adesso, se è fra le note. */
    fun corrente(contesto: Context): Postazione? {
        val ora = Collegamento(contesto).indirizzo
        return elenca(contesto).firstOrNull { it.indirizzo == ora }
    }

    /**
     * Segna che si sta usando questa, ed eventualmente come si chiama.
     *
     * `nome` arriva dal computer stesso (`/api/stato`), e vince su quello
     * dedotto dall'indirizzo — ma **non** su un nome scritto a mano: chi ha
     * chiamato un computer «studio» non vuole ritrovarselo «DESKTOP-4F2K1».
     */
    fun usata(contesto: Context, indirizzo: String, nome: String? = null) {
        if (indirizzo.isBlank()) return
        val tutte = elenca(contesto).toMutableList()
        // **Al minuto, non a ogni giro.** Questa la chiama il polso di
        // `/api/stato`, che batte ogni due secondi: riscrivere le preferenze a
        // ogni battito sarebbe migliaia di scritture all'ora per un dato che
        // serve solo a ordinare un elenco. E' esattamente l'errore che sul
        // computer ha scollegato un telefono — `dispositivi.json` riscritto a
        // ogni richiesta — e non vale la pena rifarlo da questa parte.
        val gia = tutte.firstOrNull { it.indirizzo == indirizzo }
        val nomeNuovo = nome?.takeIf { it.isNotBlank() }
        val fresca = gia != null && System.currentTimeMillis() - gia.ultimoUso < PASSO_USO_MS
        val nienteDiNuovo = nomeNuovo == null || gia?.nome == nomeNuovo
        if (fresca && nienteDiNuovo) return
        val i = tutte.indexOfFirst { it.indirizzo == indirizzo }
        val adesso = System.currentTimeMillis()
        if (i >= 0) {
            val vecchia = tutte[i]
            val daTenere = if (vecchia.nome.isNotBlank() && vecchia.nome != hostDi(indirizzo)) {
                vecchia.nome
            } else {
                nome?.takeIf { it.isNotBlank() } ?: vecchia.nome
            }
            tutte[i] = vecchia.copy(nome = daTenere, ultimoUso = adesso)
        } else {
            tutte.add(
                Postazione(
                    indirizzo = indirizzo,
                    nome = nome?.takeIf { it.isNotBlank() } ?: hostDi(indirizzo),
                    // Chi si accoppia apposta con un computer quasi sempre ci
                    // tornerà: nasce tenuta, e si toglie la spunta se non era vero.
                    tenuta = true,
                    ultimoUso = adesso
                )
            )
        }
        scrivi(contesto, pota(tutte))
    }

    fun rinomina(contesto: Context, indirizzo: String, nome: String) {
        val tutte = elenca(contesto).map {
            if (it.indirizzo == indirizzo) it.copy(nome = nome.trim().take(30).ifBlank { hostDi(indirizzo) }) else it
        }
        scrivi(contesto, tutte)
    }

    fun commutaTenuta(contesto: Context, indirizzo: String, tenuta: Boolean) {
        val tutte = elenca(contesto).map {
            if (it.indirizzo == indirizzo) it.copy(tenuta = tenuta) else it
        }
        scrivi(contesto, pota(tutte.toMutableList()))
    }

    /**
     * Toglie una postazione **e la sua chiave**.
     *
     * Le due cose vanno insieme: una chiave che resta per un computer che non
     * si vede più nell'elenco è un accesso che nessuno può revocare perché
     * nessuno sa che c'è.
     */
    fun dimentica(contesto: Context, indirizzo: String) {
        scrivi(contesto, elenca(contesto).filter { it.indirizzo != indirizzo })
        Collegamento(contesto).scordaChiaveDi(indirizzo)
    }

    /** Le tenute restano tutte; delle altre sopravvivono le più recenti. */
    private fun pota(tutte: MutableList<Postazione>): List<Postazione> {
        val tenute = tutte.filter { it.tenuta }
        val passaggio = tutte.filter { !it.tenuta }.sortedByDescending { it.ultimoUso }.take(DI_PASSAGGIO_MAX)
        return tenute + passaggio
    }

    private fun scrivi(contesto: Context, tutte: List<Postazione>) {
        val a = JSONArray()
        for (p in tutte) {
            a.put(
                JSONObject()
                    .put("indirizzo", p.indirizzo)
                    .put("nome", p.nome)
                    .put("tenuta", p.tenuta)
                    .put("ultimoUso", p.ultimoUso)
            )
        }
        prefs(contesto).edit().putString(CHIAVE, a.toString()).apply()
    }

    /** Il nome di ripiego: l'indirizzo senza schema e senza porta. */
    fun hostDi(indirizzo: String): String = Indirizzi.hostDi(indirizzo)
}
