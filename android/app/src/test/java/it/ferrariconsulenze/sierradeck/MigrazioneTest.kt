package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PC 0.74.1: la trasformazione dei workspace vista dall'app, con la risposta del PC. */
class MigrazioneTest {
    @Test
    fun `lo stato dal PC, con i campi che l'app non usa`() {
        val r = Api.json.decodeFromString(
            RispostaMigrazione.serializer(),
            """{"stato":{"versione":1,"stato":"fatta","iniziata":"2026-10-15T21:00:00.000Z","copia":"migrazione-elenco-x","prima":{"workspaceElenco":[]},"aggiunti":["A","B"],"dormienti":[{"workspace":"A","cwd":"E:/p/a","chat":2},{"workspace":"B","chat":0}]}}"""
        )
        val s = r.stato!!
        assertEquals(2, s.dormienti.size)
        assertNull(s.dormienti[1].cwd)
        assertTrue(testoMigrazione(s).startsWith("Tutti i workspace del computer (2) hanno la Panoramica"))
        assertEquals("La trasformazione non è riuscita, tutto è com’era: disco pieno", testoMigrazione(StatoMigrazioneApp("fallita", "disco pieno")))
        assertNull(Api.json.decodeFromString(RispostaMigrazione.serializer(), """{"stato":null}""").stato)
    }
}
