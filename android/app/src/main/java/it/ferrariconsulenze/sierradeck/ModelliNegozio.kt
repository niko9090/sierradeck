package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

// I modelli dell'API del Negozio: plugin, skill, agenti e MCP.
// Spostati così com'erano da Modelli.kt nella 0.83.0.

/** Quello che il computer ha in dotazione. */
@Serializable
data class DatiNegozio(
    /** Dalla 0.53.0: gli installati e i più installati, non i 3500 del catalogo. */
    val plugin: List<PluginVoce> = emptyList(),
    val skill: List<SkillVoce> = emptyList(),
    val agenti: List<AgenteVoce> = emptyList(),
    val mcp: List<McpVoce> = emptyList(),
    /** Il computer non ha potuto rispondere: diverso da «non c'è niente». */
    val errore: String? = null,
    /** La spiegazione di un vuoto legittimo, tipo «nessuna chat aperta». */
    val nota: String? = null,
    /** Quanti plugin ha il catalogo intero (0.53.0): gli altri si trovano cercando. */
    val totalePlugin: Int? = null,
    /** La cartella da cui il computer legge skill e MCP di progetto (0.53.0). */
    val cartella: String? = null
)

/**
 * Lo stato di una voce come lo scrive il computer (0.53.0, `shared/negozio.ts`):
 * la parola breve, il tono del colore, e cosa vuol dire per esteso. Le stesse
 * parole del pannello sul PC e della pagina.
 */
@Serializable
data class StatoVoce(val etichetta: String = "", val tono: String = "neutro", val spiegazione: String = "",
    /** PC 0.70: lo stato in una parola con il colore. */
    val parola: String? = null, val colore: String? = null)

@Serializable
data class PluginVoce(
    val id: String = "",
    val nome: String = "",
    val descrizione: String = "",
    val marketplace: String = "",
    val installato: Boolean = false,
    val abilitato: Boolean = false,
    val installazioni: Int? = null,
    val versione: String? = null,
    val versioneNuova: String? = null,
    val aggiornamento: Boolean = false,
    val stato: StatoVoce? = null
)

@Serializable
data class SkillVoce(
    val nome: String = "",
    val descrizione: String = "",
    val origine: String = "",
    val abilitata: Boolean = true,
    val plugin: String? = null,
    val percorso: String = "",
    val stato: StatoVoce? = null
)

@Serializable
data class AgenteVoce(
    val nome: String = "",
    val descrizione: String = "",
    val origine: String = ""
)

@Serializable
data class McpVoce(
    val nome: String = "",
    val come: String = "",
    val abilitato: Boolean = true,
    /** locale, utente, progetto (.mcp.json), altro (plugin o claude.ai). Vuoto da un PC di prima. */
    val ambito: String = "",
    val tipo: String = "",
    /** I nomi delle variabili e delle intestazioni: i valori restano sul computer. */
    val variabili: List<String> = emptyList(),
    val intestazioni: List<String> = emptyList(),
    /** attivo, spento, da-approvare, rifiutato. Vuoto da un PC di prima. */
    val config: String = "",
    val salute: String? = null,
    val motivo: String? = null,
    val stato: StatoVoce? = null
)

/** Il comando che un marketplace vuole eseguire per installare: si mostra, e si conferma. */
@Serializable
data class ConfermaComando(val sha256: String = "", val comando: String = "")

/** Com’è andata un’azione del negozio: il motivo se no, cosa cambia se sì. */
@Serializable
data class EsitoNegozio(
    val ok: Boolean = false,
    val messaggio: String? = null,
    val fatto: String? = null,
    val conferma: ConfermaComando? = null
)

/** La ricerca nel catalogo intero (0.53.0). */
@Serializable
data class RicercaNegozio(val plugin: List<PluginVoce> = emptyList(), val totale: Int = 0, val errore: String? = null)

/** Gli MCP con lo stato del collegamento, provato dal computer (0.53.0). */
@Serializable
data class SaluteMcp(val mcp: List<McpVoce> = emptyList(), val errore: String? = null)
