package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import java.util.Base64

/**
 * I file dal telefono a una chat o a un autopilota (PC 0.50.0, app 2.50.0).
 *
 * Nicholas (06/10): condividere un file dal telefono a una chat o a un
 * autopilota, dentro il progetto di quella chat. Il PC lo salva in
 * `<cartella della chat>/.sierradeck/allegati/AAAA-MM-GG/<nome>`, fuori da
 * git, e la chat riceve «Nicholas ti ha mandato il file …».
 *
 * Il file viaggia a pezzi da 96 KB (`/api/allegati/pezzo`, in base64): il
 * corpo di una richiesta del PC è al massimo 256 KB, e la rete del telefono
 * cade. Se cade, si chiede al PC dove era arrivato (`/api/allegati/stato`) e
 * si riparte da lì; alla fine il PC controlla l'impronta SHA-256 e risponde
 * «arrivato». Verso una chat di un altro PC si passa dal ponte (0.48.0): le
 * stesse chiamate, girate a quel PC con le firme di casa.
 *
 * Qui le parti pure (limiti, pezzi, ordine delle destinazioni, impronta) e
 * l'invio, che parla con un [Trasporto]: nei test un PC finto in memoria.
 */
object Allegati {
    /** Uguali a `src/shared/allegati.ts` (un test lo controlla). */
    const val MAX_BYTE = 100L * 1024 * 1024
    const val PEZZO_BYTE = 96 * 1024
    val VIETATE = setOf(
        "exe", "com", "scr", "pif", "msi", "msp", "msix", "msixbundle", "appx", "appxbundle",
        "bat", "cmd", "vbs", "vbe", "jse", "wsf", "wsh", "hta", "cpl", "lnk", "url", "scf",
        "reg", "dll", "sys", "drv", "ocx", "inf", "application", "gadget", "msc", "jar", "ps1xml", "settingcontent-ms"
    )
    /** Quante volte di fila si riprova un pezzo prima di arrendersi (poi «Riprova» riparte da dove era). */
    const val TENTATIVI = 8

    fun estensione(nome: String): String {
        val p = nome.lastIndexOf('.')
        return if (p > 0) nome.substring(p + 1).lowercase() else ""
    }

    fun inMb(byte: Long): String {
        val mb = byte / (1024.0 * 1024.0)
        return if (mb >= 10) "${Math.round(mb)} MB" else String.format(java.util.Locale.ITALY, "%.1f MB", mb)
    }

    /** `null` se si può mandare, altrimenti perché no (prima di cominciare: il PC lo ricontrolla). */
    fun controlla(nome: String, byte: Long): String? {
        if (nome.isBlank()) return "Il file non ha un nome."
        if (estensione(nome) in VIETATE) return "I file .${estensione(nome)} non si mandano: sono programmi che Windows esegue con un doppio clic. Se ti serve davvero, mettilo in uno .zip."
        if (byte > MAX_BYTE) return "«$nome» è di ${inMb(byte)}: il limite è ${inMb(MAX_BYTE)}. Per i file più grandi usa il Drive o una chiavetta."
        return null
    }

    /** Il prossimo pezzo `(da, lunghezza)`, o `null` se il PC ha già tutto. */
    fun prossimoPezzo(ricevuti: Long, byte: Long, pezzo: Int = PEZZO_BYTE): Pair<Long, Int>? =
        if (ricevuti >= byte) null else ricevuti to minOf(pezzo.toLong(), byte - ricevuti).toInt()

    fun percento(ricevuti: Long, byte: Long): Int = if (byte <= 0) 100 else minOf(100, (ricevuti * 100 / byte).toInt())

    /** L'id dell'invio lo sceglie il telefono: così, dopo una caduta, ritrova il suo. */
    fun nuovoId(): String = "t" + java.util.UUID.randomUUID().toString().replace("-", "").take(24)

    /** L'impronta SHA-256 del file e quanti byte ha (un `content://` non sempre dice la grandezza). */
    fun impronta(input: InputStream): Pair<String, Long> {
        val h = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        var totale = 0L
        input.use { s ->
            while (true) {
                val n = s.read(buf)
                if (n < 0) break
                h.update(buf, 0, n); totale += n
            }
        }
        return h.digest().joinToString("") { "%02x".format(it) } to totale
    }

    /** Legge esattamente `n` byte (meno solo se il file finisce). */
    fun leggiPezzo(s: InputStream, n: Int): ByteArray {
        val b = ByteArray(n)
        var letti = 0
        while (letti < n) {
            val r = s.read(b, letti, n - letti)
            if (r < 0) break
            letti += r
        }
        return if (letti == n) b else b.copyOf(letti)
    }

    /** Salta `n` byte di un flusso appena aperto (per riprendere da metà). */
    fun salta(s: InputStream, n: Long) {
        var resto = n
        while (resto > 0) {
            val k = s.skip(resto)
            if (k <= 0) { if (s.read() < 0) break; resto -= 1 } else resto -= k
        }
    }

    /**
     * Le destinazioni del «Manda a…»: prima quelle usate di recente (dalla più
     * recente), poi le chat di questo PC, i suoi autopiloti, le chat degli
     * altri PC. `recenti` = chiave → quando l'ultima volta.
     */
    fun ordina(tutte: List<DestinazioneFile>, recenti: Map<String, Long>): List<DestinazioneFile> {
        val (usate, altre) = tutte.partition { recenti.containsKey(it.chiave) }
        val pos = { d: DestinazioneFile -> if (d.pcId != null) 2 else if (d.tipo == "autopilota") 1 else 0 }
        return usate.sortedByDescending { recenti[it.chiave] ?: 0L } + altre.sortedBy(pos)
    }

    /** Dalle chat e dagli autopiloti che il telefono vede, le destinazioni possibili. */
    fun destinazioni(qui: Stato?, altri: List<Pair<PcPonte, Stato?>>): List<DestinazioneFile> {
        val d = mutableListOf<DestinazioneFile>()
        qui?.chat?.forEach { d += DestinazioneFile("chat", it.id, it.titolo.ifBlank { it.cwd }, sessione = it.sessione, aspetta = it.aspetta, protetta = it.pin == "chiusa") }
        qui?.autopiloti?.filter { it.stato != "finito" }?.forEach { d += DestinazioneFile("autopilota", it.id, it.nome) }
        for ((pc, s) in altri) s?.chat?.forEach {
            d += DestinazioneFile("chat", it.id, it.titolo.ifBlank { it.cwd }, pcId = pc.pcId, pcNome = pc.nome, sessione = it.sessione, aspetta = it.aspetta, protetta = it.pin == "chiusa")
        }
        return d
    }

    /** Il testo dell'esito, per chi guarda. */
    fun testoArrivato(a: EsitoInvio.Arrivato): String =
        "✓ Arrivato: ${a.nome} in ${a.percorso}" + when {
            a.avviso != null -> " — ${a.avviso}"
            a.avvisata == "chat" -> " (la chat è avvisata)"
            a.avvisata == "autopilota" -> " (è nel suo dialogo)"
            else -> ""
        }
}

/** Dove mandare: una chat (di questo PC o di un altro, `pcId`) o un autopilota. */
data class DestinazioneFile(
    val tipo: String,
    val id: String,
    val titolo: String,
    val pcId: String? = null,
    val pcNome: String? = null,
    val sessione: String? = null,
    val aspetta: Boolean = false,
    /** Protetta dal PIN e chiusa per questo telefono: il PIN si chiede prima di mandare. */
    val protetta: Boolean = false
) {
    /** Per i «recenti»: la conversazione, non il riquadro, che cambia a ogni riavvio. */
    val chiave: String get() = "${pcId ?: ""}|$tipo|${sessione ?: id}"
}

/** Il file da mandare: il nome, la grandezza e come riaprirlo da un punto. */
class SorgenteFile(val nome: String, val byte: Long, val sha256: String?, val apri: () -> InputStream)

sealed class EsitoInvio {
    data class Arrivato(val nome: String, val percorso: String, val avvisata: String?, val avviso: String?) : EsitoInvio()
    /** `codice` 423 = chat protetta dal PIN; 0 = la rete non è tornata (si riprova con lo stesso id). */
    data class Rifiutato(val codice: Int, val messaggio: String) : EsitoInvio()
}

/** Una chiamata al PC (diretta o attraverso il ponte). Solleva [Api.Errore] o un `IOException`. */
interface Trasporto {
    suspend fun chiama(percorso: String, corpo: JsonObject): String
}

object Invio {
    private fun errore(e: Api.Errore): String = try {
        Api.json.parseToJsonElement(e.corpo).jsonObject["errore"]?.jsonPrimitive?.contentOrNull
    } catch (_: Exception) { null } ?: "il computer ha risposto ${e.codice}"

    private fun numero(testo: String, campo: String): Long? = try {
        Api.json.parseToJsonElement(testo).jsonObject[campo]?.jsonPrimitive?.longOrNull
    } catch (_: Exception) { null }

    /**
     * Manda un file. `id` resta lo stesso fra un «Riprova» e l'altro: il PC
     * riconosce l'invio e riparte da dove era arrivato.
     */
    suspend fun manda(
        t: Trasporto,
        s: SorgenteFile,
        dest: DestinazioneFile,
        nota: String,
        id: String,
        attendi: suspend (Long) -> Unit = { delay(it) },
        onAvanzamento: (Long, Long) -> Unit = { _, _ -> }
    ): EsitoInvio {
        Allegati.controlla(s.nome, s.byte)?.let { return EsitoInvio.Rifiutato(413, it) }
        val inizio = try {
            t.chiama("/api/allegati/inizia", buildJsonObject {
                put("id", id); put("nome", s.nome); put("byte", s.byte)
                if (s.sha256 != null) put("sha256", s.sha256)
                if (dest.tipo == "autopilota") put("autopilota", dest.id) else put("chat", dest.id)
                if (nota.isNotBlank()) put("nota", nota.trim())
            })
        } catch (e: CancellationException) { throw e
        } catch (e: Api.Errore) { return EsitoInvio.Rifiutato(e.codice, errore(e))
        } catch (e: Exception) { return EsitoInvio.Rifiutato(0, "Il computer non risponde: ${e.message ?: "rete assente"}. Riprova: ripartirà da dove era.") }
        var ricevuti = numero(inizio, "ricevuti") ?: 0L
        val pezzo = (numero(inizio, "pezzo") ?: Allegati.PEZZO_BYTE.toLong()).toInt().coerceIn(1024, Allegati.PEZZO_BYTE)
        onAvanzamento(ricevuti, s.byte)
        var flusso: InputStream? = null
        var posizione = -1L
        var tentativi = 0
        try {
            while (true) {
                val (da, lunghezza) = Allegati.prossimoPezzo(ricevuti, s.byte, pezzo) ?: break
                try {
                    // Il flusso si riapre solo se si riparte da un altro punto.
                    if (flusso == null || posizione != da) {
                        flusso?.close()
                        flusso = s.apri().also { Allegati.salta(it, da) }
                        posizione = da
                    }
                    val dati = Allegati.leggiPezzo(flusso!!, lunghezza)
                    posizione += dati.size
                    val r = t.chiama("/api/allegati/pezzo", buildJsonObject {
                        put("id", id); put("da", da); put("dati", Base64.getEncoder().encodeToString(dati))
                    })
                    ricevuti = numero(r, "ricevuti") ?: (da + dati.size)
                    tentativi = 0
                } catch (e: CancellationException) { throw e
                } catch (e: Api.Errore) {
                    // 409: un pezzo fuori posto, il PC dice da dove riprendere.
                    val dove = numero(e.corpo, "ricevuti")
                    if (e.codice == 409 && dove != null) { ricevuti = dove; continue }
                    // Un rifiuto vero (PIN, invio sparito, troppo grande): non si riprova.
                    if (e.codice in 400..499) return EsitoInvio.Rifiutato(e.codice, errore(e))
                    tentativi += 1
                    if (tentativi > Allegati.TENTATIVI) return EsitoInvio.Rifiutato(0, "Il computer non risponde (${errore(e)}). Riprova: ripartirà da dove era.")
                    attendi(minOf(15_000L, 1000L * tentativi * tentativi))
                    ricevuti = riprendi(t, id) ?: ricevuti
                } catch (e: IOException) {
                    tentativi += 1
                    if (tentativi > Allegati.TENTATIVI) return EsitoInvio.Rifiutato(0, "La rete non torna (${e.message ?: "caduta"}). Riprova: ripartirà da dove era.")
                    attendi(minOf(15_000L, 1000L * tentativi * tentativi))
                    ricevuti = riprendi(t, id) ?: ricevuti
                }
                onAvanzamento(ricevuti, s.byte)
            }
        } finally {
            try { flusso?.close() } catch (_: Exception) {}
        }
        val fine = try {
            t.chiama("/api/allegati/fine", buildJsonObject { put("id", id) })
        } catch (e: CancellationException) { throw e
        } catch (e: Api.Errore) { return EsitoInvio.Rifiutato(e.codice, errore(e))
        } catch (e: Exception) { return EsitoInvio.Rifiutato(0, "Il file è sul computer ma non ha confermato: ${e.message ?: "rete caduta"}. Riprova.") }
        val o = Api.json.parseToJsonElement(fine).jsonObject
        return EsitoInvio.Arrivato(
            nome = o["nome"]?.jsonPrimitive?.contentOrNull ?: s.nome,
            percorso = o["percorso"]?.jsonPrimitive?.contentOrNull ?: "",
            avvisata = o["avvisata"]?.jsonPrimitive?.contentOrNull,
            avviso = o["avviso"]?.jsonPrimitive?.contentOrNull
        )
    }

    /** Dopo una caduta: dove era arrivato il PC. */
    private suspend fun riprendi(t: Trasporto, id: String): Long? = try {
        numero(t.chiama("/api/allegati/stato", buildJsonObject { put("id", id) }), "ricevuti")
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}
