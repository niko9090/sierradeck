package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable
import java.text.Normalizer

/**
 * Le impostazioni rifatte (app 2.56.0): la struttura è quella del PC
 * (`src/shared/impostazioni-struttura.ts`), letta da `assets/impostazioni.json`
 * che scrive il PC stesso con i suoi test. Qui c'è solo la ricerca, uguale a
 * `cercaImpostazioni`, controllata da `ImpostazioniVociTest` sui casi del file.
 */
@Serializable
data class SezioneImp(val id: String = "", val titolo: String = "", val spiega: String = "")

@Serializable
data class VoceImp(val id: String = "", val sezione: String = "", val titolo: String = "", val spiega: String = "", val parole: List<String> = emptyList(), val dove: List<String> = emptyList())

@Serializable
data class StrutturaImp(val sezioni: List<SezioneImp> = emptyList(), val voci: List<VoceImp> = emptyList())

object ImpostazioniVoci {
    @Volatile private var caricata: StrutturaImp? = null

    fun da(testo: String): StrutturaImp = Api.json.decodeFromString(StrutturaImp.serializer(), testo)

    fun carica(contesto: android.content.Context): StrutturaImp =
        caricata ?: try {
            da(contesto.assets.open("impostazioni.json").bufferedReader().use { it.readText() }).also { caricata = it }
        } catch (_: Exception) { StrutturaImp() }

    fun normalizza(t: String): String =
        Normalizer.normalize(t, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").replace('’', ' ').replace('\'', ' ').lowercase()

    /** Le voci di quel posto che contengono tutte le parole cercate, nell'ordine delle sezioni. */
    fun cerca(s: StrutturaImp, q: String, dove: String = "app"): List<VoceImp> {
        val qui = s.voci.filter { dove in it.dove }
        val parole = normalizza(q).split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (parole.isEmpty()) return qui
        val ordine = s.sezioni.map { it.id }
        return qui.filter { v ->
            val testo = normalizza((listOf(v.titolo, v.spiega) + v.parole + listOf(s.sezioni.firstOrNull { it.id == v.sezione }?.titolo ?: "")).joinToString(" "))
            parole.all { testo.contains(it) }
        }.sortedBy { ordine.indexOf(it.sezione) }
    }

    /** Gli id delle sezioni da mostrare con quella ricerca. */
    fun sezioniVisibili(s: StrutturaImp, q: String, dove: String = "app"): Set<String> = cerca(s, q, dove).map { it.sezione }.toSet()
}
