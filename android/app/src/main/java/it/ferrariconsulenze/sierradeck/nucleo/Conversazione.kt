package it.ferrariconsulenze.sierradeck.nucleo

/**
 * **La conversazione a voce** nell'app (Nicholas, 14/11: «la parte dove legge
 * in automatico e rispondo non c'è, parlo dell'apk»). Sul PC c'è da tempo
 * («A voce» e «Parlato», `src/shared/voce-autopilota.ts` e `parlato.ts`): qui
 * le stesse regole, pure, per i test senza Android.
 *
 * Il giro: le risposte nuove si leggono (TextToSpeech), finita la lettura si
 * ascolta (riconoscimento di Android), quello che dici si manda, poi si aspetta
 * la risposta. Si ferma col tasto, con «basta» o quando l'app va in sottofondo.
 * L'audio non esce dal telefono e non si registra.
 */
object TestoDaLeggere {
    /** Quanto è lunga al più una frase letta (circa 20 secondi): il resto si legge nella chat. */
    const val MASSIMO = 320

    private val CODICE = Regex("```[\\s\\S]*?(```|$)")
    private val CODICE_BREVE = Regex("`([^`\\n]{0,30})`")
    private val CODICE_LUNGO = Regex("`[^`\\n]*`")
    private val LINK = Regex("\\bhttps?://\\S+", RegexOption.IGNORE_CASE)
    private val PERCORSO_WIN = Regex("\\b[a-z]:\\\\[^\\s,;:)»]*", RegexOption.IGNORE_CASE)
    private val PERCORSO_UNIX = Regex("(?:^|\\s)(?:\\.{0,2}/)?(?:[\\w.-]+/)+[\\w.-]*")
    private val FILE = Regex("\\b[\\w-]+\\.(?:tsx?|jsx?|mjs|json|md|css|kt|ya?ml|exe|ps1|py|apk)\\b", RegexOption.IGNORE_CASE)
    private val IMPRONTA = Regex("\\b[0-9a-f]{7,40}\\b", RegexOption.IGNORE_CASE)
    private val SIGLA = Regex("\\b[krp]-\\d+\\b", RegexOption.IGNORE_CASE)
    private val TITOLO = Regex("^\\s{0,3}#{1,6}\\s+", RegexOption.MULTILINE)
    private val ELENCO = Regex("^\\s*[-*•]\\s+", RegexOption.MULTILINE)
    private val NUMERATO = Regex("^\\s*\\d+[.)]\\s+", RegexOption.MULTILINE)
    private val SEGNI = Regex("\\*\\*|__|~~|\\|")
    private val VIRGOLETTE = Regex("[«»]")
    private val A_CAPO = Regex("\\s*\\n+\\s*")
    private val FRASI = Regex("[^.!?]+[.!?]+(?:\\s|$)|[^.!?]+$")

    /**
     * Il testo da dire: senza blocchi di codice, link, percorsi, segni del
     * markdown e sigle interne; le prime frasi fino a `max` caratteri.
     */
    fun pulisci(testo: String, max: Int = MASSIMO): String {
        var codice = false
        var t = CODICE.replace(testo) { codice = true; " " }
        t = CODICE_BREVE.replace(t, "$1")
        t = CODICE_LUNGO.replace(t) { codice = true; " " }
        t = LINK.replace(t, "un link")
        t = PERCORSO_WIN.replace(t, " ")
        t = PERCORSO_UNIX.replace(t, " ")
        t = FILE.replace(t, "un file")
        t = IMPRONTA.replace(t, " ")
        t = SIGLA.replace(t, " ")
        t = TITOLO.replace(t, "")
        t = ELENCO.replace(t, "")
        t = NUMERATO.replace(t, "")
        t = SEGNI.replace(t, " ")
        t = VIRGOLETTE.replace(t, "")
        t = A_CAPO.replace(t, ". ")
        t = t.replace(Regex("\\s+([,.;:!?])"), "$1")
            .replace(Regex("([.!?])\\.+"), "$1")
            .replace(Regex("(?:un file[,\\s]+){2,}"), "alcuni file ")
            .replace(Regex("\\s{2,}"), " ")
            .trim()
        if (t.isEmpty() && codice) return "Ti ha scritto del codice: lo trovi nella chat."
        if (t.length > max) {
            var fuori = ""
            for (f in FRASI.findAll(t).map { it.value }) {
                if ((fuori + f).length > max) break
                fuori += f
            }
            if (fuori.isBlank()) fuori = t.take(max).replace(Regex("\\s+\\S*$"), "") + "…"
            t = fuori.trim() + " Il resto è nella chat."
        } else if (codice) {
            t = "$t C’è anche del codice: lo trovi nella chat."
        }
        return t
    }

    /** Un testo in pezzi da al più `max` caratteri, tagliati sulle frasi: la voce si interrompe sui testi molto lunghi. */
    fun aPezzi(testo: String, max: Int = 240): List<String> {
        val pezzi = mutableListOf<String>()
        var ora = ""
        for (f in FRASI.findAll(testo).map { it.value }) {
            if (ora.isNotEmpty() && (ora + f).length > max) { pezzi += ora.trim(); ora = "" }
            ora += f
        }
        if (ora.isNotBlank()) pezzi += ora.trim()
        return pezzi
    }

    /** Le righe del terminale di una chat in un testo da dire: niente cornici, cursori e righe di stato. */
    fun dalTerminale(righe: List<String>): String =
        righe.map { it.trim() }
            .filter { r ->
                r.isNotEmpty() && r.count { it.isLetter() } >= 3 && r.none { it in '\u2500'..'\u257F' || it in '\u2800'..'\u28FF' } &&
                    // Il tuo messaggio ripetuto dal terminale non si rilegge.
                    r[0] !in ">\u276F\u203A$"
            }
            .joinToString("\n")
}

enum class ComandoVoce { ZITTO, RIPETI }

/** Le parole dette che sono comandi per la conversazione e non messaggi: «basta», «ripeti». Solo frasi brevi. */
fun comandoDetto(testo: String): ComandoVoce? {
    val t = java.text.Normalizer.normalize(testo.lowercase(), java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").replace(Regex("[^a-z\\s]"), " ").replace(Regex("\\s+"), " ").trim()
        .removePrefix("ok ").removePrefix("ehi ").removePrefix("allora ").removeSuffix(" per favore").removeSuffix(" grazie")
    if (t.isEmpty() || t.split(" ").size > 5) return null
    if (Regex("^(?:basta|stop|zitto|silenzio|smetti di (?:leggere|parlare)|non leggere|spegni(?: la conversazione)?|chiudi la conversazione)$").matches(t)) return ComandoVoce.ZITTO
    if (Regex("^(?:ripeti|puoi ripetere)$").matches(t)) return ComandoVoce.RIPETI
    return null
}

/** Una frase da leggere: `id` dice se è già stata vista, `testo` è già pulito. */
data class FraseLetta(val id: String, val testo: String)

/** Le sue battute nuove (non le tue, non le note di lavoro) come frasi da leggere. */
object NovitaDaLeggere {
    /** Le risposte e le domande dell'autopilota non ancora viste. Le «viste» le tiene il chiamante. */
    fun dalleRighe(righe: List<RigaChat>): List<FraseLetta> = righe.mapNotNull { r ->
        when (r) {
            // L'id dal contenuto, non dal posto: se il PC accorcia la storia, le vecchie non tornano «nuove».
            is RigaChat.Bolla -> if (r.tua) null else FraseLetta("b:${r.quando}|${r.testo.take(60)}", TestoDaLeggere.pulisci(r.testo))
            is RigaChat.Domanda -> {
                val scelte = r.scelte.take(3).joinToString(", oppure ") { TestoDaLeggere.pulisci(it.etichetta, 60).trimEnd('.', '!', '?') }
                FraseLetta("d:${r.id}", "Ha una domanda per te. ${TestoDaLeggere.pulisci(r.testo)}" + if (scelte.isNotEmpty()) " Puoi rispondere: $scelte." else "")
            }
            else -> null
        }
    }.filter { it.testo.isNotBlank() }
}

/** Il terminale di una chat: le righe dopo `marcatore` diventano una frase sola, quando la chat si è fermata. */
object NovitaDelTerminale {
    fun frase(righe: List<Pair<Int, String>>, marcatore: Int): FraseLetta? {
        val nuove = righe.filter { it.first > marcatore }
        if (nuove.isEmpty()) return null
        val testo = TestoDaLeggere.pulisci(TestoDaLeggere.dalTerminale(nuove.map { it.second }))
        return if (testo.isBlank()) null else FraseLetta("t:${nuove.first().first}-${nuove.last().first}", testo)
    }
}

enum class FaseGiro { SPENTO, LEGGO, ASCOLTO, ASPETTO, ERRORE }

data class StatoGiro(
    val fase: FaseGiro = FaseGiro.SPENTO,
    /** Le frasi già viste (lette o saltate): la storia vecchia non si legge. */
    val viste: Set<String> = emptySet(),
    val fila: List<FraseLetta> = emptyList(),
    val inLettura: FraseLetta? = null,
    val ultima: FraseLetta? = null,
    /** Quanti ascolti di fila sono finiti nel silenzio. */
    val silenzi: Int = 0,
    val messaggio: String? = null
)

sealed class EventoGiro {
    /** Il tasto: accende, con gli id di quello che c'è già in chat (non si legge). */
    data class Accendi(val giaPresenti: Set<String>) : EventoGiro()
    object Spegni : EventoGiro()
    /** L'app va in sottofondo. */
    object Sottofondo : EventoGiro()
    data class Novita(val frasi: List<FraseLetta>) : EventoGiro()
    object LetturaFinita : EventoGiro()
    /** La voce non c'è o non parte: si salta alla parte dell'ascolto. */
    data class LetturaFallita(val messaggio: String) : EventoGiro()
    data class Sentito(val testo: String) : EventoGiro()
    /** L'ascolto è finito senza parole (silenzio, niente). */
    object NienteSentito : EventoGiro()
    data class ErroreAscolto(val codice: Int) : EventoGiro()
    /** Il tasto 🎤 della conversazione: parli subito. */
    object Parla : EventoGiro()
    object ManoNonPresa : EventoGiro()
}

sealed class AzioneGiro {
    object Niente : AzioneGiro()
    data class Leggi(val frase: FraseLetta) : AzioneGiro()
    object Ascolta : AzioneGiro()
    data class Manda(val testo: String) : AzioneGiro()
    /** Tace la voce e chiude il microfono. */
    object Ferma : AzioneGiro()
}

data class PassoGiro(val stato: StatoGiro, val azione: AzioneGiro = AzioneGiro.Niente)

object Giro {
    const val FILA_MAX = 4
    const val SILENZI_MAX = 2
    const val SPIEGA = "Con «A voce» acceso l'app legge ad alta voce, in breve, le risposte e le domande nuove: non la storia vecchia e non il codice. " +
        "Quando ha finito di leggere, ascolta: parli in italiano e quello che dici parte da solo come messaggio. " +
        "Poi aspetta la risposta e il giro riparte. Parole che fanno qualcosa: «basta» spegne, «ripeti» rilegge. " +
        "Si ferma col tasto o quando l'app va in sottofondo. Voce e riconoscimento sono quelli di Android: l'app non registra e non salva l'audio."
    const val MOTIVO_PERMESSO = "Per parlare serve il microfono: lo ascolta Android, l'app non registra e non salva l'audio."

    /** Una frase in fondo alla fila; oltre il tetto le più vecchie diventano «altre N novità». */
    fun accoda(fila: List<FraseLetta>, f: FraseLetta): List<FraseLetta> {
        if (fila.any { it.id == f.id }) return fila
        var n = fila + f
        if (n.size > FILA_MAX) {
            val tolte = n.size - FILA_MAX + 1
            val altre = n.take(tolte).sumOf { if (it.id.startsWith("altre:")) it.id.substringAfter(':').toIntOrNull() ?: 1 else 1 }
            n = listOf(FraseLetta("altre:$altre", "Ci sono altre $altre novità: le trovi nella chat.")) + n.drop(tolte)
        }
        return n
    }

    private fun spento(s: StatoGiro, messaggio: String? = null) =
        PassoGiro(s.copy(fase = if (messaggio != null) FaseGiro.ERRORE else FaseGiro.SPENTO, fila = emptyList(), inLettura = null, silenzi = 0, messaggio = messaggio), AzioneGiro.Ferma)

    /** Dopo una lettura (o se non c'è niente da leggere): la prossima frase, oppure si ascolta. */
    private fun avanti(s: StatoGiro): PassoGiro {
        val prima = s.fila.firstOrNull()
        return if (prima != null) PassoGiro(s.copy(fase = FaseGiro.LEGGO, fila = s.fila.drop(1), inLettura = prima, messaggio = null), AzioneGiro.Leggi(prima))
        else PassoGiro(s.copy(fase = FaseGiro.ASCOLTO, inLettura = null, messaggio = null), AzioneGiro.Ascolta)
    }

    /** Fra due ascolti, o quando si aspetta: se c'è qualcosa da leggere si legge, sennò si aspetta. */
    private fun riposo(s: StatoGiro): PassoGiro =
        if (s.fila.isNotEmpty()) avanti(s) else PassoGiro(s.copy(fase = FaseGiro.ASPETTO, inLettura = null))

    fun passo(s: StatoGiro, e: EventoGiro): PassoGiro = when (e) {
        is EventoGiro.Accendi -> if (s.fase != FaseGiro.SPENTO && s.fase != FaseGiro.ERRORE) PassoGiro(s)
            // Chi accende parla per primo: la storia che c'è non si legge.
            else PassoGiro(StatoGiro(fase = FaseGiro.ASCOLTO, viste = e.giaPresenti, ultima = s.ultima), AzioneGiro.Ascolta)
        is EventoGiro.Spegni, is EventoGiro.Sottofondo -> if (s.fase == FaseGiro.SPENTO) PassoGiro(s) else spento(s)
        is EventoGiro.Novita -> if (s.fase == FaseGiro.SPENTO || s.fase == FaseGiro.ERRORE) PassoGiro(s) else {
            val nuove = e.frasi.filter { it.id !in s.viste }
            if (nuove.isEmpty()) PassoGiro(s) else {
                var fila = s.fila
                for (f in nuove) fila = accoda(fila, f)
                val m = s.copy(viste = s.viste + nuove.map { it.id }, fila = fila)
                // Mentre parli, o mentre ne legge una, si accoda; se aspettava, comincia.
                if (m.fase == FaseGiro.ASPETTO) avanti(m) else PassoGiro(m)
            }
        }
        is EventoGiro.LetturaFinita -> if (s.fase != FaseGiro.LEGGO) PassoGiro(s) else avanti(s.copy(ultima = s.inLettura ?: s.ultima))
        is EventoGiro.LetturaFallita -> if (s.fase != FaseGiro.LEGGO) PassoGiro(s) else spento(s, e.messaggio)
        is EventoGiro.Sentito -> if (s.fase != FaseGiro.ASCOLTO) PassoGiro(s) else {
            val t = e.testo.trim()
            when {
                t.isEmpty() -> passo(s, EventoGiro.NienteSentito)
                comandoDetto(t) == ComandoVoce.ZITTO -> spento(s)
                comandoDetto(t) == ComandoVoce.RIPETI -> {
                    val u = s.ultima
                    if (u == null) riposo(s.copy(silenzi = 0)) else avanti(s.copy(fila = listOf(u) + s.fila, silenzi = 0))
                }
                else -> PassoGiro(s.copy(fase = FaseGiro.ASPETTO, silenzi = 0, messaggio = null), AzioneGiro.Manda(t))
            }
        }
        is EventoGiro.NienteSentito -> if (s.fase != FaseGiro.ASCOLTO) PassoGiro(s) else {
            val n = s.silenzi + 1
            // Se intanto è arrivato qualcosa si legge; sennò si riprova due volte e poi si aspetta il tasto.
            if (s.fila.isNotEmpty()) avanti(s.copy(silenzi = 0))
            else if (n >= SILENZI_MAX) PassoGiro(s.copy(fase = FaseGiro.ASPETTO, silenzi = 0, messaggio = "Non ti sento: tocca il microfono per parlare."))
            else PassoGiro(s.copy(silenzi = n), AzioneGiro.Ascolta)
        }
        is EventoGiro.ErroreAscolto -> if (s.fase != FaseGiro.ASCOLTO) PassoGiro(s) else when (e.codice) {
            RegolaDettatura.ERRORE_SILENZIO, RegolaDettatura.ERRORE_NIENTE, RegolaDettatura.ERRORE_OCCUPATO -> passo(s, EventoGiro.NienteSentito)
            else -> spento(s, RegolaDettatura.messaggio(e.codice))
        }
        is EventoGiro.Parla -> if (s.fase == FaseGiro.SPENTO || s.fase == FaseGiro.ERRORE || s.fase == FaseGiro.ASCOLTO) PassoGiro(s)
            else PassoGiro(s.copy(fase = FaseGiro.ASCOLTO, inLettura = null, silenzi = 0, messaggio = null), AzioneGiro.Ascolta)
        is EventoGiro.ManoNonPresa -> if (s.fase == FaseGiro.SPENTO) PassoGiro(s)
            else PassoGiro(s.copy(fase = FaseGiro.ASPETTO, messaggio = "Non sono riuscito a mandarlo: scrivilo nella casella."))
    }

    fun frase(s: StatoGiro): String = when (s.fase) {
        FaseGiro.SPENTO -> ""
        FaseGiro.LEGGO -> "Leggo…"
        FaseGiro.ASCOLTO -> "Ti ascolto…"
        FaseGiro.ASPETTO -> s.messaggio ?: "Aspetto la risposta…"
        FaseGiro.ERRORE -> s.messaggio ?: "Conversazione interrotta."
    }
}
