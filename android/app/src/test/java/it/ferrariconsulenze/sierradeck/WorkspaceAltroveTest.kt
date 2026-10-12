package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «Su altri PC» (PC 0.65.1): i workspace degli altri PC arrivano a parte in
 * `workspace.altrove`; la lista di questo PC (`nomi`) resta sua. Un PC prima
 * della 0.65.1 non li manda, e si legge lo stesso.
 */
class WorkspaceAltroveTest {
    @Test
    fun `i workspace degli altri PC arrivano a parte`() {
        val w = Api.json.decodeFromString(Workspace.serializer(), """{"nomi":["SierraDeck"],"attivo":"SierraDeck","altrove":[{"pc":"pc-port","nome":"PORTATILE-ESEMPIO","workspace":["GLOS"]}]}""")
        assertEquals(listOf("SierraDeck"), w.nomi)
        assertEquals("PORTATILE-ESEMPIO", w.altrove.single().nome)
        assertEquals(listOf("GLOS"), w.altrove.single().workspace)
    }

    @Test
    fun `un PC vecchio non li manda`() {
        val w = Api.json.decodeFromString(Workspace.serializer(), """{"nomi":["A","B"],"attivo":"A"}""")
        assertTrue(w.altrove.isEmpty())
    }
}
