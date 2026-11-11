package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Le correzioni di velocità della 0.83.0, una per una: ognuna ha cambiato un
 * numero misurato sull'emulatore (rapporto-0-83-0.md), e nessuna deve tornare
 * indietro senza che qualcuno se ne accorga.
 */
class AvvioVelocitaTest {

    @Test
    fun `l'APK di rilascio passa da R8 con i nomi veri`() {
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("isMinifyEnabled = true"))
        assertTrue(gradle.contains("isShrinkResources = true"))
        assertTrue(File("proguard-rules.pro").readText().lines().any { it.trim() == "-dontobfuscate" })
    }
}
