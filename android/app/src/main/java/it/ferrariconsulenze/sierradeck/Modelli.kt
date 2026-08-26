package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * I modelli dell'API del computer, tipati.
 *
 * Uno per forma di risposta, con i campi che il desktop manda davvero (vedi il
 * contratto in `client-rotte.ts`). Tutti i campi hanno un default: se il computer
 * gira una versione più vecchia che non manda un campo, l'app non cade — legge
 * ciò che c'è e tira avanti. Lo stesso vale al contrario, grazie a
 * `ignoreUnknownKeys` nel `Json` del client.
 *
 * NB: `led`, le percentuali dei passaggi e i colori arrivano **già calcolati**
 * dal desktop — non si reinventano qui, o tornerebbe la divergenza già vissuta
 * (fallito e finito con lo stesso puntino grigio).
 */

// ─── /api/accoppia ───
@Serializable
data class Accoppiamento(val id: String = "", val chiave: String = "")

// ─── /api/stato ───
@Serializable
data class Stato(
    val chat: List<Chat> = emptyList(),
    val autopiloti: List<AutopilotaBreve> = emptyList(),
    val domande: List<Domanda> = emptyList(),
    val workspace: Workspace = Workspace()
)

@Serializable
data class Chat(
    val id: String,
    val titolo: String = "",
    val cwd: String = "",
    val sessione: String? = null,
    /** L'ultima riga del terminale: il «battito» a colpo d'occhio. */
    val ultimaRiga: String? = null
)

@Serializable
data class AutopilotaBreve(
    val id: String,
    val nome: String = "",
    /** intervista | pronto | lavoro | attesa | sospeso | finito | fallito */
    val stato: String = "",
    /** Colore/urgenza del LED, deciso dal desktop. */
    val led: String = "",
    val cicli: Int = 0,
    val strategia: String = "",
    val motivo: String = "",
    val cwd: String = "",
    val fatti: Int = 0,
    val criteri: Int = 0
)

@Serializable
data class Domanda(
    val id: String,
    val autopilotaId: String = "",
    val testo: String = ""
)

@Serializable
data class Workspace(
    val nomi: List<String> = emptyList(),
    val attivo: String = ""
)

// ─── /api/dentro ───  (le ultime righe del terminale di UNA chat)
@Serializable
data class Dentro(
    val chat: String = "",
    val titolo: String = "",
    /** Righe ripulite (senza codici ANSI). */
    val righe: List<String> = emptyList(),
    /** Righe grezze con i codici ANSI: sono queste che la nativa colora. */
    val grezze: List<String> = emptyList()
)

// ─── /api/consumi ───
@Serializable
data class Consumi(
    val oggi: Quota = Quota(),
    val settimana: Quota = Quota(),
    val totale: Quota = Quota()
)

@Serializable
data class Quota(
    val ingresso: Long = 0,
    val uscita: Long = 0,
    val cache: Long = 0,
    val chat: Int = 0
)

// ─── /api/cartelle ───
@Serializable
data class Cartelle(val cartelle: List<Cartella> = emptyList())

@Serializable
data class Cartella(val cwd: String = "", val titolo: String = "")

// ─── /api/sessioni ───
@Serializable
data class Sessioni(val sessioni: List<SessioneRipresa> = emptyList())

@Serializable
data class SessioneRipresa(
    val id: String = "",
    val cwd: String = "",
    val titolo: String = "",
    val quando: String = ""
)

// ─── risposta generica delle azioni ───
@Serializable
data class Fatto(val fatto: Boolean = false, val autopilota: String? = null)
