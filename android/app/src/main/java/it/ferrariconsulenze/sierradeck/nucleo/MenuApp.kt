package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.Serializable
import it.ferrariconsulenze.sierradeck.rete.Api

/**
 * Il menu del PC, letto da `assets/menu.json` (k-166m4): nomi, ordine e
 * sottovoci li scrive la fonte unica `src/shared/menu-principale.ts`, qui non
 * si ripetono a mano. Le voci solo del PC (Correzioni) nel json non ci sono,
 * quindi sul telefono non compaiono.
 */
@Serializable
data class SottoVoceMenu(val id: String = "", val nome: String = "")

@Serializable
data class VoceMenuApp(
    val id: String = "",
    val nome: String = "",
    val breve: String = "",
    val icona: String = "",
    val spiega: String = "",
    val sotto: List<SottoVoceMenu> = emptyList()
)

@Serializable
data class MenuApp(val voci: List<VoceMenuApp> = emptyList()) {
    fun voce(id: String): VoceMenuApp? = voci.firstOrNull { it.id == id }

    /** Il nome della voce (`sottoId` nullo) o della sua sottovoce; `null` se il json non la prevede. */
    fun nome(voceId: String, sottoId: String? = null): String? {
        val v = voce(voceId) ?: return null
        return if (sottoId == null) v.nome else v.sotto.firstOrNull { it.id == sottoId }?.nome
    }

    /** Il nome corto della fascia (con i trattini morbidi), come lo scrive il PC. */
    fun breve(voceId: String): String? = voce(voceId)?.breve

    companion object {
        @Volatile private var caricato: MenuApp? = null

        fun da(testo: String): MenuApp = Api.json.decodeFromString(serializer(), testo)

        fun carica(contesto: android.content.Context): MenuApp =
            caricato ?: try {
                da(contesto.assets.open("menu.json").bufferedReader().use { it.readText() }).also { caricato = it }
            } catch (_: Exception) { MenuApp() }
    }
}
