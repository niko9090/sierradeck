package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * Gestire chat, workspace e autopiloti dal telefono (PC 0.55.0, app 2.55.0),
 * alla pari con il PC. È la copia di `src/shared/azioni-telefono.ts`: le
 * stesse regole e gli stessi testi, controllati da `AzioniTelefonoTest` sui
 * casi scritti dal PC (`resources/azioni/azioni-0.55.json`).
 *
 * Il difetto da cui nasce (Nicholas, 09/10): creare un workspace o una chat
 * su un altro PC finiva in un rifiuto dell'app stessa (il ponte lasciava
 * passare solo «guardare e scrivere»), con due finestre aperte una chat nuova
 * nasceva due volte, e dal telefono non si eliminavano workspace né si
 * sceglieva dove lanciare un autopilota.
 */
data class Conferma(val titolo: String, val testo: String, val azione: String)

@Serializable
data class BozzaAutopilota(
    val obiettivo: String = "",
    val cwd: String = "",
    val nome: String = "",
    /** Uno per riga. */
    val criteri: String = "",
    val pubblicazione: String = "stabile",
    val cloud: Boolean = false,
    val partenza: String = "via",
    /** Il workspace in cui nascono le sue chat; vuoto = quello davanti sul PC. */
    val workspace: String = ""
)

@Serializable
data class CriterioNuovo(val descrizione: String)

@Serializable
data class RichiestaAutopilota(
    val nome: String,
    val obiettivo: String,
    val cwd: String,
    val criteri: List<CriterioNuovo>,
    val pubblicazione: String,
    val vaSulCloud: Boolean? = null,
    val workspace: String? = null,
    val partenza: String
)

/** L'esito del controllo: o la richiesta, o il campo e il perché. */
sealed class EsitoBozza {
    data class Ok(val richiesta: RichiestaAutopilota) : EsitoBozza()
    data class No(val campo: String, val errore: String) : EsitoBozza()
}

@Serializable
data class EsitoOspite(val fatto: Boolean = false, val messaggio: String = "")

@Serializable
data class ModelloClaude(val valore: String = "", val etichetta: String = "")

@Serializable
data class ElencoModelli(val modelli: List<ModelloClaude> = emptyList())

/** Una scelta con la sua spiegazione (regole di pubblicazione, partenze). */
data class Voce(val valore: String, val etichetta: String, val spiega: String)

object AzioniTelefono {
    const val NOME_WORKSPACE_MAX = 60
    const val OBIETTIVO_MAX = 200_000
    const val NOME_AUTOPILOTA_MAX = 80

    const val ULTIMO_WORKSPACE = "L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout."

    /** Le tre regole di pubblicazione, come `REGOLE_PUBBLICAZIONE` del PC (src/shared/harness.ts). */
    val REGOLE = listOf(
        Voce("beta", "beta: pubblica sempre", "A lavoro finito e verificato pubblica da solo, senza chiedere: va bene per un progetto in prova, dove un difetto costa poco."),
        Voce("stabile", "stabile: chiede prima", "Fa commit, unisce i suoi rami e (con le chat sul Drive) manda su, ma prima di pubblicare ti chiede il sì nella scheda Domande, con il riassunto di cosa esce."),
        Voce("unica", "versione unica: decide il progetto", REGOLA_UNICA)
    )

    val PARTENZE = listOf(
        Voce("via", "aspetta il mio «Vai»", "Legge il progetto, ti fa al massimo un paio di domande, si scrive i criteri se non li hai dati e aspetta il tuo «Vai» prima di cominciare. Non parte da solo."),
        Voce("subito", "parte da solo", "Legge il progetto e, se ha domande, le fa come sempre; appena ha le risposte e i criteri comincia a lavorare senza aspettare il tuo «Vai».")
    )

    fun confermaDormi(titolo: String) = Conferma(
        "Mettere a dormire «$titolo»?",
        "Si chiude il suo claude.exe sul computer e smette di occupare memoria. La chat resta nel suo workspace, al suo posto, con tutta la conversazione: con «Svegliala» riparte da dove era. Se sta lavorando adesso, il lavoro di questo turno si interrompe a metà: aspetta che abbia finito, se non sei sicuro.",
        "Metti a dormire"
    )

    fun confermaChiudi(titolo: String) = Conferma(
        "Chiudere «$titolo»?",
        "Si chiude il suo claude.exe e la chat esce dal workspace: sul computer il suo riquadro sparisce. La conversazione non si cancella: resta su disco e si riapre quando vuoi da «Riprendi», con tutta la sua storia. Se sta lavorando adesso, il lavoro di questo turno si interrompe a metà. Per spegnerla lasciandola al suo posto usa invece «Metti a dormire».",
        "Chiudi la chat"
    )

    fun confermaSposta(titolo: String, workspace: String) = Conferma(
        "Spostare «$titolo» in «$workspace»?",
        "La chat esce da questo workspace ed entra in «$workspace». Il suo claude.exe si chiude adesso e riparte con tutta la conversazione quando sul computer si passa a «$workspace». Niente si perde; se sta lavorando adesso, il lavoro di questo turno si interrompe a metà.",
        "Sposta la chat"
    )

    fun confermaEliminaWorkspace(nome: String) = Conferma(
        "Eliminare il workspace «$nome»?",
        "Il workspace sparisce dalla fascia e le chat che contiene escono dalla disposizione: i loro terminali si spengono. Le conversazioni restano su disco e si ritrovano nell’elenco Chat (Sessioni), da dove si riaprono in un altro workspace. Prima di eliminare viene messa da parte una copia dell’archivio dei workspace (workspaces.prima-dell-eliminazione.json, nella cartella dei dati). Se il workspace viaggia anche sul Drive, lì resta: si toglie da lì con «Togli dal Drive» nella scheda Drive.",
        "Elimina il workspace"
    )

    fun confermaRinominaWorkspace(nome: String) = Conferma(
        "Rinominare «$nome»?",
        "Cambia solo il nome: le chat restano dove sono e chi lavora continua a lavorare.",
        "Rinomina"
    )

    /** Il testo del PC (OspiteChat.tsx), per un altro PC e per questo. */
    fun confermaOspite(titolo: String, pcNome: String, questo: Boolean) = Conferma(
        "Ospitata da $pcNome",
        if (questo) "«$titolo» lavorerà su questo PC ($pcNome): il suo claude.exe parte qui, e sugli altri PC si apre solo dal vivo, guardando questo. Se la chat è aperta su un altro PC, là viene chiusa appena finisce il turno (mai a metà) e la copia di là va nella sua cartella di recupero: non si cancella niente, e si annulla da «Dove vive ogni chat». Se la copia più avanti è su un altro PC, prima di cambiare fai salvare quel PC sul Drive: qui arriva da sola."
        else "«$titolo» lavorerà su $pcNome: il suo claude.exe parte solo lì. Qui, e su ogni altro PC, si apre dal vivo su $pcNome. Prima salvo la copia di qui sul Drive, così $pcNome la trova; poi, appena la chat finisce il turno (mai a metà), la copia di qui va nella cartella di recupero di SierraDeck. Non si cancella niente, e si annulla da «Dove vive ogni chat».",
        "Ospitata da $pcNome"
    )

    fun confermaPin(titolo: String, proteggi: Boolean) = Conferma(
        if (proteggi) "Proteggere «$titolo» con il PIN?" else "Togliere il PIN a «$titolo»?",
        if (proteggi) "Da adesso, per vedere e scrivere questa chat da un telefono, da un altro PC o da questo schermo serve il PIN scelto sul computer. La chat continua a lavorare come prima; si richiude da sola dopo il tempo di inattività impostato là."
        else "Da adesso la chat si vede e si scrive senza PIN, da ogni telefono e PC della tua cassaforte. Il PIN resta per le altre chat protette.",
        if (proteggi) "Proteggi" else "Togli il PIN"
    )

    fun confermaEliminaAutopilota(nome: String) = Conferma(
        "Eliminare l’autopilota «$nome»?",
        "L’autopilota sparisce dall’elenco e le sue chat si fermano. I file che ha già cambiato nel progetto restano come sono (e i suoi commit restano nel git del progetto), ma il suo diario, le domande e i passaggi non si recuperano più. Per fermarlo e basta usa «Ferma»: si riprende quando vuoi.",
        "Elimina l’autopilota"
    )

    /** Lo stesso controllo del PC; `null` = va bene. */
    fun erroreNomeWorkspace(nome: String, esistenti: List<String> = emptyList()): String? {
        val p = nome.trim()
        if (p.isEmpty()) return "Scrivi il nome del workspace."
        if (p.length > NOME_WORKSPACE_MAX) return "Il nome è troppo lungo: al massimo $NOME_WORKSPACE_MAX caratteri."
        if (p.any { it.code in 0..0x1f || it.code == 0x7f }) return "Il nome non può contenere caratteri di controllo."
        if (p in esistenti) return "«$p» esiste già: scegli un altro nome."
        return null
    }

    /** Le prime otto parole dell'obiettivo, al massimo 60 caratteri (come il PC). */
    fun nomeDaObiettivo(obiettivo: String): String =
        obiettivo.trim().split(Regex("\\s+")).take(8).joinToString(" ").take(60)

    fun criteriDaTesto(testo: String): List<CriterioNuovo> =
        testo.split(Regex("\r?\n")).map { it.trim() }.filter { it.isNotEmpty() }.map { CriterioNuovo(it) }

    fun percorsoAssoluto(p: String): Boolean =
        Regex("^[A-Za-z]:[\\\\/]").containsMatchIn(p) || Regex("^\\\\\\\\[^\\\\]+\\\\[^\\\\]+").containsMatchIn(p) || p.startsWith("/")

    /** La validazione dell'autopilota nuovo, la stessa del PC (`controllaBozzaAutopilota`). */
    fun controlla(b: BozzaAutopilota): EsitoBozza {
        val obiettivo = b.obiettivo.trim()
        if (obiettivo.isEmpty()) return EsitoBozza.No("obiettivo", "Scrivi prima cosa vuoi ottenere.")
        if (obiettivo.length > OBIETTIVO_MAX) return EsitoBozza.No("obiettivo", "L’obiettivo è troppo lungo: al massimo 200.000 caratteri.")
        val cwd = b.cwd.trim()
        if (cwd.isEmpty()) return EsitoBozza.No("cwd", "Scegli la cartella in cui lavora.")
        if (!percorsoAssoluto(cwd)) return EsitoBozza.No("cwd", "La cartella dev’essere un percorso intero del computer (per esempio C:\\Progetti\\Esempio): sceglila dall’elenco o sfogliando.")
        if (REGOLE.none { it.valore == b.pubblicazione }) return EsitoBozza.No("pubblicazione", "Scegli la regola di pubblicazione: beta, stabile o versione unica.")
        if (PARTENZE.none { it.valore == b.partenza }) return EsitoBozza.No("partenza", "Scegli quando parte: dopo il tuo «Vai» o da solo.")
        var workspace: String? = null
        if (b.workspace.isNotBlank()) {
            erroreNomeWorkspace(b.workspace)?.let { return EsitoBozza.No("workspace", it) }
            workspace = b.workspace.trim()
        }
        val nome = if (b.nome.isNotBlank()) b.nome.trim().take(NOME_AUTOPILOTA_MAX) else nomeDaObiettivo(obiettivo)
        return EsitoBozza.Ok(RichiestaAutopilota(
            nome = nome, obiettivo = obiettivo, cwd = cwd,
            criteri = criteriDaTesto(b.criteri),
            pubblicazione = b.pubblicazione,
            vaSulCloud = if (b.cloud) true else null,
            workspace = workspace,
            partenza = b.partenza
        ))
    }
}

private const val REGOLA_UNICA = "Segue la regola di pubblicazione scritta nel progetto (CLAUDE.md, quaderno, script). Se il progetto non ne ha una, chiede."
