package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

// ─── Il Drive: il catalogo e il lavoro in corso, come li racconta il computer ───
// Spostati così com'erano da Modelli.kt nella 0.83.0.

@Serializable
data class ContiCatalogo(val uguali: Int = 0, val indietro: Int = 0, val avanti: Int = 0, val soloDrive: Int = 0, val soloQui: Int = 0)

@Serializable
data class FileCatalogo(val totale: Int = 0, val soloDrive: Int = 0, val indietro: Int = 0, val avanti: Int = 0, val soloQui: Int = 0, val uguali: Int = 0)

@Serializable
data class ChatCatalogo(
    val sessione: String = "",
    val percorso: String = "",
    val titolo: String = "Conversazione",
    val quando: String? = null,
    val messaggi: Int? = null,
    val workspace: String? = null,
    val stato: String = "uguale",
    val altroveQui: String? = null,
    /** Solo nella vista per workspace: il progetto (cartella) della chat. */
    val progetto: String? = null,
    val chiaveProgetto: String? = null
)

@Serializable
data class ProgettoCatalogo(
    val chiave: String = "",
    val nome: String = "",
    val cartellaOrigine: String = "",
    val id: String? = null,
    val cartellaQui: String? = null,
    val quiEsiste: Boolean = false,
    val cartellaSulDrive: Boolean = false,
    val origine: String = "altrove",
    val chat: List<ChatCatalogo> = emptyList(),
    val file: FileCatalogo = FileCatalogo(),
    val conti: ContiCatalogo = ContiCatalogo(),
    val stato: String = "allineato",
    val ultimoTocco: String? = null
)

@Serializable
data class WorkspaceCatalogo(
    val nome: String = "",
    val quiEsiste: Boolean = false,
    val chat: List<ChatCatalogo> = emptyList(),
    val progetti: List<String> = emptyList(),
    val daPortare: Int = 0,
    val quiUguali: Int = 0
)

@Serializable
data class TotaliCatalogo(val progetti: Int = 0, val chat: Int = 0, val daPortare: Int = 0, val daAggiornare: Int = 0, val soloQui: Int = 0, val uguali: Int = 0)

@Serializable
data class Catalogo(
    val progetti: List<ProgettoCatalogo> = emptyList(),
    val workspace: List<WorkspaceCatalogo> = emptyList(),
    val totali: TotaliCatalogo = TotaliCatalogo(),
    val letto: String = ""
)

/** La risposta di `/api/drive/catalogo`: `disponibile = false` e' un computer vecchio. */
@Serializable
data class RispostaCatalogo(
    val ok: Boolean = false,
    val disponibile: Boolean = true,
    val catalogo: Catalogo? = null,
    val messaggio: String? = null,
    val cassaforteDiversa: Boolean? = null
)

@Serializable
data class LavoroInCorso(
    val tipo: String = "",
    val avviato: String = "",
    val fase: String = "",
    val fatto: Int? = null,
    val totale: Int? = null,
    val unita: String? = null,
    val dettaglio: String? = null,
    val verso: String? = null,
    val caricati: Int? = null,
    val scaricati: Int? = null,
    val saltati: Int? = null,
    val annullamento: Boolean = false
)

@Serializable
data class EsitoLavoro(
    val tipo: String = "",
    val esito: String = "ok",
    val messaggio: String = "",
    val quando: String = "",
    val riavvioConsigliato: Boolean? = null
)

@Serializable
data class StatoLavoro(val inCorso: LavoroInCorso? = null, val ultimo: EsitoLavoro? = null)

/** L'esito di «Porta qui»: `ok` e, se e' andata, i conti della fusione. */
@Serializable
data class EsitoPorta(val ok: Boolean = false, val messaggio: String? = null, val errore: String? = null)

/** A che fase sta la lettura del catalogo sul computer: il telefono la chiede mentre aspetta. */
@Serializable
data class ProgressoCatalogo(val fase: String = "", val fatto: Int? = null, val totale: Int? = null, val avviato: String = "")

@Serializable
data class StatoCatalogo(val inCorso: ProgressoCatalogo? = null)
