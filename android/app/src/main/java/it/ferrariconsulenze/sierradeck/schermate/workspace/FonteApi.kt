package it.ferrariconsulenze.sierradeck.schermate.workspace

import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoAutopilota
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.VistaAttesa
import it.ferrariconsulenze.sierradeck.nucleo.SchedaBreve
import it.ferrariconsulenze.sierradeck.nucleo.SchedaPiena
import it.ferrariconsulenze.sierradeck.rete.Api
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Le letture della pagina dal PC vero. Un errore = null: resta quello che si vedeva. */
class FonteApi(private val api: Api, private val id: String, private val cartella: () -> String? = { null }, private val workspace: () -> String?) : FonteWorkspace {
    private suspend fun <T> prova(f: suspend () -> T): T? = try { f() } catch (e: CancellationException) { throw e } catch (_: Exception) { null }

    override suspend fun chat(): List<Battuta>? = prova { api.autopilota(id).chat }
    override suspend fun avanzamento(): AvanzamentoAutopilota? = prova { api.avanzamentoAutopilota(workspace(), id) }
    override suspend fun attesa(): VistaAttesa? = prova { Api.json.decodeFromString(VistaAttesa.serializer(), api.grezzo("/api/specialisti/attesa", "{}")) }
    override suspend fun specialista(id: String): List<String>? = prova {
        api.specialista(workspace() ?: "", id).righe.map { r -> r.testo }.filter { it.isNotBlank() }
    }
    override suspend fun quaderno(): List<SchedaBreve>? = cartella()?.takeIf { it.isNotBlank() }?.let { c -> prova { api.quaderno(c).schede } }
    override suspend fun scheda(file: String): SchedaPiena? = cartella()?.takeIf { it.isNotBlank() }?.let { c -> prova { api.scheda(c, file) } }
    override suspend fun mossa(id: String, mossa: String): Boolean = prova {
        api.grezzo("/api/specialisti/attesa/priorita", buildJsonObject { put("id", id); put("mossa", mossa) }.toString())
    } != null
}

/** Le chat accese di quel workspace (PC 0.82: `workspace` sulla chat; prima, dall'archivio per sessione). */
fun chatDelWorkspace(s: Stato?, workspace: String): List<ChatDelWorkspace> {
    if (s == null || workspace.isBlank()) return emptyList()
    val sessioni = s.workspace.chat.filter { it.workspace == workspace }.map { it.sessione }.toSet()
    return s.chat.filter { it.workspace == workspace || (it.workspace == null && it.sessione != null && it.sessione in sessioni) }
        .map { ChatDelWorkspace(it.id, it.nome ?: it.titolo.ifBlank { "Chat" }) }
}
