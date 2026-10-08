package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.Base64

/*
 * I file fra il PC e il telefono (PC 0.54.0, app 2.54.0).
 *
 * Nicholas (08/10): «Permetti anche di inviare dal pc al cellulare i file …
 * anche perché tutta la parte file qui sul cellulare non c'è come nel pc».
 * Due cose, che qui hanno le parti pure:
 * - la sezione **File**: i progetti di ogni PC (anche attraverso il ponte),
 *   sfogliati in sola lettura, con l'anteprima, lo scaricamento e il carica;
 * - i file **dal PC al telefono**: il PC li tiene in una coda per questo
 *   telefono, l'app li ritira a pezzi (anche in sottofondo) e riprende da
 *   dove era se la rete cade.
 * Le regole sono le stesse di `src/shared/file-telefono.ts` (un test le
 * confronta sulle risposte vere del PC).
 */

@Serializable
data class ProgettoFile(val nome: String = "", val percorso: String = "", val doppio: Boolean = false, val chiuso: Boolean = false)

@Serializable
data class ProgettiFile(val progetti: List<ProgettoFile> = emptyList())

@Serializable
data class VoceFile(
    val nome: String = "",
    /** Relativo al progetto, con `/`. */
    val percorso: String = "",
    val cartella: Boolean = false,
    val byte: Long = 0,
    /** Ultima modifica, millisecondi. */
    val quando: Long = 0,
    /** `testo`, `immagine`, `pdf`, `altro`: lo decide il PC (`tipoAnteprima`). */
    val tipo: String = "altro"
)

@Serializable
data class ElencoFile(
    val progetto: String = "",
    val nome: String = "",
    val percorso: String = "",
    val su: String? = null,
    val voci: List<VoceFile> = emptyList(),
    val tagliato: Boolean = false
)

@Serializable
data class PezzoFile(
    val dati: String = "",
    val da: Long = 0,
    val byte: Long = 0,
    val letti: Int = 0,
    val quando: Long = 0,
    val nome: String = "",
    val tipo: String = "altro",
    val mime: String = "application/octet-stream"
)

/** Un file che un PC ha messo in coda per questo telefono. */
@Serializable
data class ConsegnaTel(
    val id: String,
    val nome: String = "",
    val byte: Long = 0,
    val sha256: String? = null,
    /** Il nome del PC che l'ha mandato: va nella notifica. */
    val daPc: String = "",
    val creata: String = "",
    /** `pc` (dal pannello) o `chat` (lo strumento manda_al_telefono). */
    val da: String = "pc",
    val daChat: String? = null,
    val nota: String? = null
)

@Serializable
data class Consegne(val consegne: List<ConsegnaTel> = emptyList())

@Serializable
data class PezzoConsegna(val dati: String = "", val letti: Int = 0, val byte: Long = 0)

/** Il rifiuto di un progetto protetto dal PIN: la chat da sbloccare, se è aperta. */
@Serializable
data class RifiutoPin(val errore: String = "", val pin: String? = null, val chat: String? = null)

object FileVista {
    /** Uguali a `src/shared/file-telefono.ts`. */
    const val PEZZO_BYTE = 96 * 1024
    const val ANTEPRIMA_TESTO_BYTE = 512L * 1024
    const val ANTEPRIMA_MAX_BYTE = 20L * 1024 * 1024
    const val MAX_BYTE = 100L * 1024 * 1024
    /** Quante volte di fila si riprova un pezzo prima di arrendersi. */
    const val TENTATIVI = 8

    private val TESTO = setOf(
        "txt", "md", "markdown", "json", "jsonl", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "log", "csv", "tsv",
        "ts", "tsx", "js", "jsx", "mjs", "cjs", "kt", "kts", "java", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cc", "cs",
        "swift", "php", "html", "htm", "css", "scss", "less", "xml", "svg", "sql", "sh", "bash", "zsh", "ps1", "psm1", "bat", "cmd",
        "gradle", "properties", "gitignore", "gitattributes", "editorconfig", "dockerfile", "makefile", "lock", "vue", "svelte",
        "r", "lua", "pl", "dart", "scala", "tex", "rst", "adoc", "srt", "vtt"
    )
    private val IMMAGINE = mapOf("png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "gif" to "image/gif", "webp" to "image/webp", "bmp" to "image/bmp")
    private val TESTO_PER_NOME = setOf("dockerfile", "makefile", "license", "readme", "changelog", "procfile", ".gitignore", ".env", ".npmrc", ".editorconfig")

    private fun estensione(nome: String): String {
        val p = nome.lastIndexOf('.')
        return if (p >= 0) nome.substring(p + 1).lowercase() else ""
    }

    /** Come si guarda un file, dal nome: lo stesso giudizio del PC. */
    fun tipo(nome: String): String {
        val e = estensione(nome)
        return when {
            e in IMMAGINE -> "immagine"
            e == "pdf" -> "pdf"
            e in TESTO || nome.lowercase() in TESTO_PER_NOME -> "testo"
            else -> "altro"
        }
    }

    /** Il tipo MIME per aprire, salvare e condividere. */
    fun mime(nome: String): String {
        val e = estensione(nome)
        return IMMAGINE[e] ?: when {
            e == "pdf" -> "application/pdf"
            e == "json" -> "application/json"
            e == "csv" -> "text/csv"
            e == "zip" -> "application/zip"
            e == "mp4" -> "video/mp4"
            e == "mp3" -> "audio/mpeg"
            tipo(nome) == "testo" -> "text/plain"
            else -> "application/octet-stream"
        }
    }

    /** «40 byte», «12 KB», «3,4 MB». */
    fun misura(byte: Long): String = when {
        byte < 1024 -> "$byte byte"
        byte < 1024 * 1024 -> "${maxOf(1L, Math.round(byte / 1024.0))} KB"
        else -> Allegati.inMb(byte)
    }

    /** Le briciole: il progetto, poi ogni cartella fino a quella aperta. */
    fun briciole(nomeProgetto: String, percorso: String): List<Pair<String, String>> {
        val fuori = mutableListOf(nomeProgetto to "")
        var fin = ""
        for (x in percorso.split('/', '\\').filter { it.isNotEmpty() }) {
            fin = if (fin.isEmpty()) x else "$fin/$x"
            fuori += x to fin
        }
        return fuori
    }

    /**
     * Un nome di file sicuro per salvarlo sul telefono: niente percorsi,
     * niente caratteri che Android o una scheda SD non vogliono. Il nome
     * arriva dal PC, che è nostro, ma un nome con `../` non deve poter
     * uscire dalla cartella dell'app.
     */
    fun nomeSicuro(nome: String): String {
        val ultimo = nome.split('/', '\\').lastOrNull { it.isNotBlank() } ?: "file"
        val pulito = ultimo.replace(Regex("[\\u0000-\\u001f:*?\"<>|]"), "_").trim().trimEnd('.', ' ')
        return when {
            pulito.isEmpty() || pulito == "." || pulito == ".." -> "file"
            pulito.length > 120 -> {
                val p = pulito.lastIndexOf('.')
                if (p > 0 && pulito.length - p <= 10) pulito.take(120 - (pulito.length - p)) + pulito.substring(p) else pulito.take(120)
            }
            else -> pulito
        }
    }

    /** `foto.jpg`, poi `foto (2).jpg`… se c'è già. */
    fun nomeLibero(nome: String, esiste: (String) -> Boolean): String {
        val n = nomeSicuro(nome)
        if (!esiste(n)) return n
        val p = n.lastIndexOf('.')
        val base = if (p > 0) n.substring(0, p) else n
        val est = if (p > 0) n.substring(p) else ""
        for (i in 2 until 1000) {
            val c = "$base ($i)$est"
            if (!esiste(c)) return c
        }
        return "$base (${System.currentTimeMillis()})$est"
    }

    /** L'impronta SHA-256 di un file sul telefono. */
    fun impronta(f: File): String = f.inputStream().use { s ->
        val h = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        while (true) {
            val n = s.read(buf)
            if (n < 0) break
            h.update(buf, 0, n)
        }
        h.digest().joinToString("") { "%02x".format(it) }
    }

    /** La frase della notifica: chi l'ha mandato, e la nota se c'è. */
    fun testoNotifica(c: ConsegnaTel): String =
        "Hai ricevuto ${c.nome} (${misura(c.byte)}) da ${c.daPc.ifBlank { "il PC" }}" +
            (if (c.da == "chat" && !c.daChat.isNullOrBlank()) ", chiesto dalla chat «${c.daChat}»" else "") +
            (c.nota?.takeIf { it.isNotBlank() }?.let { ". Nota: $it" } ?: ".")

    /** Il messaggio di un rifiuto del PC, per esteso. */
    fun motivo(e: Throwable): String = when (e) {
        is Api.Errore -> try {
            Api.json.decodeFromString(RifiutoPin.serializer(), e.corpo).errore.takeIf { it.isNotBlank() }
        } catch (_: Exception) { null } ?: "il computer ha risposto ${e.codice}"
        else -> e.message ?: "il computer non risponde"
    }

    /** Il progetto è chiuso dal PIN (423): la chat da sbloccare, se è aperta. */
    fun rifiutoPin(e: Throwable): RifiutoPin? {
        if (e !is Api.Errore || e.codice != 423) return null
        return try { Api.json.decodeFromString(RifiutoPin.serializer(), e.corpo) } catch (_: Exception) { RifiutoPin(errore = "Progetto protetto dal PIN.") }
    }
}

/**
 * Scaricare a pezzi, con la ripresa (puro, provato con un PC finto).
 *
 * Il file si scrive in `parte` man mano: la sua lunghezza è quanto è già
 * arrivato, anche dopo che Android ha chiuso l'app. Se la rete cade si
 * aspetta un po' (sempre di più) e si riprova dallo stesso punto; un rifiuto
 * vero (4xx) si dice subito. Alla fine, se c'è l'impronta, si confronta.
 */
object Scaricatore {
    sealed class Esito {
        data class Fatto(val file: File, val byte: Long) : Esito()
        /** `codice` 0 = la rete non è tornata (si riprova più tardi, ripartendo da dov'era). */
        data class Fallito(val codice: Int, val messaggio: String) : Esito()
    }

    /**
     * `pezzo(da)` chiede al PC i byte da `da` e torna i dati e la grandezza
     * totale. Si ferma a `massimo` (per l'anteprima di un testo lungo).
     */
    suspend fun scarica(
        parte: File,
        pezzo: suspend (Long) -> Pair<ByteArray, Long>,
        sha256: String? = null,
        massimo: Long = Long.MAX_VALUE,
        attendi: suspend (Long) -> Unit = { delay(it) },
        onAvanzamento: (Long, Long) -> Unit = { _, _ -> }
    ): Esito {
        parte.parentFile?.mkdirs()
        if (!parte.exists()) parte.createNewFile()
        var totale = -1L
        var tentativi = 0
        while (true) {
            val da = parte.length()
            if (totale >= 0 && (da >= totale || da >= massimo)) break
            try {
                val (dati, byte) = pezzo(da)
                totale = byte
                if (da > byte) { parte.writeBytes(ByteArray(0)); continue }
                if (dati.isNotEmpty()) java.io.FileOutputStream(parte, true).use { it.write(dati) }
                tentativi = 0
                onAvanzamento(parte.length(), byte)
                if (dati.isEmpty()) break
            } catch (e: CancellationException) { throw e
            } catch (e: Api.Errore) {
                if (e.codice in 400..499) return Esito.Fallito(e.codice, FileVista.motivo(e))
                tentativi += 1
                if (tentativi > FileVista.TENTATIVI) return Esito.Fallito(0, "Il computer non risponde (${FileVista.motivo(e)}). Riprovo più tardi, da dov'era.")
                attendi(minOf(15_000L, 1000L * tentativi * tentativi))
            } catch (e: IOException) {
                tentativi += 1
                if (tentativi > FileVista.TENTATIVI) return Esito.Fallito(0, "La rete non torna (${e.message ?: "caduta"}). Riprovo più tardi, da dov'era.")
                attendi(minOf(15_000L, 1000L * tentativi * tentativi))
            }
        }
        if (sha256 != null && parte.length() == totale && FileVista.impronta(parte) != sha256.lowercase()) {
            parte.delete()
            return Esito.Fallito(422, "Il file è arrivato diverso da com'era sul PC (l'impronta non torna): lo riscarico da capo.")
        }
        return Esito.Fatto(parte, maxOf(totale, 0L))
    }

    /** I dati di un pezzo arrivato in base64 dal PC. */
    fun decodifica(base64: String): ByteArray = Base64.getDecoder().decode(base64)
}
