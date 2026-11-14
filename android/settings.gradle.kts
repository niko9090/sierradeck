pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

// Una sola costruzione alla volta per questa cartella. Due gradle lanciati insieme sulla stessa
// android/app/build (es. il cancello di unione e un'altra misura a 38 secondi di distanza) si
// pestano: su Windows «Unable to delete directory ...\\test-results\\testDebugUnitTest\\binary»
// (output.bin aperto dall'altra) oppure «Could not close incremental caches ... lookups.tab».
// La seconda aspetta la fine della prima, poi parte su una cartella build in ordine.
run {
    val blocco = try {
        val file = File(rootDir, ".gradle/costruzione-unica.lock")
        file.parentFile.mkdirs()
        val canale = java.io.RandomAccessFile(file, "rw").channel
        canale to canale.lock()
    } catch (e: Exception) {
        null
    }
    if (blocco != null) {
        gradle.buildFinished {
            try { blocco.second.release() } catch (e: Exception) { }
            try { blocco.first.close() } catch (e: Exception) { }
        }
    }
}

rootProject.name = "SierraDeck"
include(":app")
