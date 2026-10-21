package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

// I modelli dell'API per gli autopiloti: elenco, dettaglio, «Adesso», dal vivo, linguette e schede.
// Spostati così com'erano da Modelli.kt nella 0.83.0 (vale la nota in cima a Modelli.kt sui default).

/** Gli specialisti di un autopilota (PC 0.73.0): come è organizzato il lavoro, e uno per chat. */
@Serializable
data class Specialisti(val riga: String = "", val elenco: List<Specialista> = emptyList())

@Serializable
data class Specialista(
    val id: String = "",
    val ruolo: String = "",
    /** Un nome della tabella dei colori (`TabellaAttivita.colori`). */
    val colore: String = "quieto",
    val compito: String = "",
    val stato: String = "",
    val attivo: Boolean = false,
    val ultimaAzione: String = "",
    val sessionId: String? = null,
    val workspace: String? = null,
    /** PC 0.74.0: ha finito e la sua chat si è chiusa da sola. */
    val chiusa: Boolean = false,
    /** PC 0.82.0: cosa fa, per il colore fisso (`TabellaAttivita`); assente da un PC più vecchio. */
    val attivita: String? = null,
    /** PC 0.82.0: cosa fa in parole semplici e da quanto. */
    val cosa: String = "",
    val quanto: String = ""
)

/** La linguetta «File» (0.38.0): i file cambiati, per chat. */
@Serializable
data class FileAutopilota(val gruppi: List<GruppoFile> = emptyList())

@Serializable
data class GruppoFile(
    val chiave: String = "",
    val nome: String = "",
    val cartella: String = "",
    val ramo: String? = null,
    val base: String = "",
    val file: List<FileCambiato> = emptyList(),
    val errore: String? = null
)

@Serializable
data class FileCambiato(
    val percorso: String = "",
    val vecchio: String? = null,
    val stato: String = "modificato",
    val piu: Int = 0,
    val meno: Int = 0,
    val salvato: Boolean = false,
    val binario: Boolean? = null
)

@Serializable
data class DiffFile(val diff: String = "")

/** Un nodo dell'albero delle chat di un autopilota (T7, 0.36.0). */
@Serializable
data class RuoloChat(val id: String = "", val nome: String = "", val parola: String = "", val colore: String = "quieto")

@Serializable
data class NodoAlbero(
    /** PC 0.71: il ruolo della chat (Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio) e se il suo ramo è approvato. */
    val ruolo: RuoloChat? = null,
    val revisioneDi: String? = null,
    val approvata: Boolean = false,
    val id: String = "",
    /** "coordinatore" o "chat". */
    val tipo: String = "chat",
    val titolo: String = "",
    val stato: String = "",
    val parola: String = "",
    val ramo: String? = null,
    val cartella: String? = null,
    val cicli: Int = 0,
    val figli: List<NodoAlbero> = emptyList()
)

@Serializable
data class AutopilotaBreve(
    val id: String,
    val nome: String = "",
    /** intervista | pronto | lavoro | attesa | sospeso | finito | fallito */
    val stato: String = "",
    /** Colore/urgenza del LED, deciso dal desktop. */
    val led: String = "",
    val cicli: Int = 0,
    val strategia: String = "",
    val motivo: String = "",
    val cwd: String = "",
    val fatti: Int = 0,
    val criteri: Int = 0,
    /** Si vede sempre chi lavora (PC 0.69.0): le parole le decide il PC. */
    val dalVivo: StatoDalVivo? = null,
    /** PC 0.70: lo stato in una parola, i criteri, l'ultima azione, il verbo. */
    val vista: VistaAutopilotaApp? = null
)

@Serializable data class CriteriVistaApp(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—")
@Serializable data class VistaAutopilotaApp(
    val stato: StatoVistaDrive = StatoVistaDrive(), val criteri: CriteriVistaApp = CriteriVistaApp(),
    val ultima: String = "", val da: String = "", val azione: String = "nessuna"
)

/** La riga sotto il nome di un autopilota (PC 0.70): «da 6 min · criteri 0/1». */
fun sottoAutopilota(v: VistaAutopilotaApp): String = listOfNotNull(v.da.takeIf { it.isNotBlank() }?.let { "da $it" }, "criteri ${v.criteri.testo}").joinToString(" · ")

@Serializable
data class RigaAdesso(
    val id: String = "",
    val chi: String = "",
    val compito: String = "",
    val testo: String = "",
    /** lavoro | aspetta | pausa | ferma */
    val tono: String = "lavoro"
)

/**
 * Il riquadro «Adesso» (PC 0.81.0): cosa fa ogni chat dell'autopilota, da
 * quanto, e se è ferma perché. Le righe sono già scritte dal PC.
 */
@Serializable
data class Adesso(
    val righe: List<RigaAdesso> = emptyList(),
    val finite: Int = 0,
    val aiuto: String = ""
)

/** Lo stesso colore del PC (`COLORE_ADESSO`). */
fun coloreAdesso(tono: String): String = when (tono) {
    "ferma" -> "rosso"
    "aspetta" -> "ambra"
    "pausa" -> "quieto"
    else -> "verde"
}

/** «2 chat finite»: le finite non hanno una riga ciascuna. */
fun righeFinite(n: Int): String? = when {
    n <= 0 -> null
    n == 1 -> "1 chat finita"
    else -> "$n chat finite"
}

/** «al lavoro · da 12 min», l'ultima azione, «nessun segno da 10 min» (PC 0.69.0). */
@Serializable
data class StatoDalVivo(
    val etichetta: String = "",
    val da: String = "",
    val ultimaAzione: String = "",
    val senzaSegni: String? = null
)

/**
 * La parola di una chat governata (0.80.0, come `chatAlLavoro` del PC): segnata
 * «lavoro» ma con l'autopilota fermo non è al lavoro.
 */
fun parolaChatGovernata(statoAutopilota: String, statoChat: String): String = when (statoChat) {
    "lavoro" -> if (statoAutopilota == "lavoro" || statoAutopilota == "attesa" || statoAutopilota == "intervista") "al lavoro" else "ferma: l’autopilota è fermo"
    "bloccata" -> "ferma, aspetta una risposta"
    else -> "finita"
}

/** Il colore della parola dal vivo, come `COLORE_DAL_VIVO` del PC (0.80.0): «fermo» è rosso. */
fun tonoDalVivo(etichetta: String): String = when (etichetta) {
    "al lavoro" -> "verde"
    "aspetta te" -> "ambra"
    "fermo" -> "rosso"
    else -> "quieto"
}

// ─── /api/autopilota (dettaglio) = tutto l'autopilota + passaggi + misura ───
@Serializable
data class AutopilotaDettaglio(
    /** PC 0.74.0: il workspace dell'autopilota (per la Panoramica, PC 0.77.0). */
    val workspace: String? = null,
    /** PC 0.69.0: stato dal vivo e messaggi verso la chat. */
    val dalVivo: StatoDalVivo? = null,
    val messaggi: List<StatoMessaggio> = emptyList(),
    /** PC 0.81.0: il riquadro «Adesso», una riga per chat. Assente con un PC più vecchio. */
    val adesso: Adesso? = null,
    val id: String = "",
    val nome: String = "",
    /** L'obiettivo come l'ha capito lui (riscritto dalla preparazione). */
    val obiettivo: String = "",
    /** L'obiettivo come l'hai chiesto tu (assente = coincide con `obiettivo`). */
    val obiettivoTuo: String? = null,
    val stato: String = "",
    val cicli: Int = 0,
    val strategia: String? = null,
    val motivoSospensione: String? = null,
    /** Assente vale «sì». */
    val riprendiAlRiavvio: Boolean? = null,
    /** PC 0.72.0: la chat lavora senza riquadro sul PC, solo se l'ha chiesto Nicholas. Assente vale «no». */
    val sottofondo: Boolean? = null,
    val criteri: List<Criterio> = emptyList(),
    val decisioni: List<Decisione> = emptyList(),
    val passaggi: List<Passo> = emptyList(),
    val misura: MisuraPasso = MisuraPasso(),
    /** PC 0.71: i tempi dei giri in una riga («giro 12 s (criteri 2 s, supervisore 9 s) · 8 giri»). */
    val tempi: String? = null,
    /**
     * Il dialogo con lui (0.27.0): le tue battute e le sue risposte, dalla
     * scheda. Assente nei computer con una versione precedente.
     */
    val dialogo: List<ScambioDialogo> = emptyList(),
    /**
     * La chat con lui (0.29.0), composta dal computer: la stessa della sezione
     * sul PC. Vuota nei computer con una versione precedente: allora la
     * schermata mostra solo il dialogo di prima.
     */
    val chat: List<Battuta> = emptyList(),
    /** Ha una domanda aperta: quello che scrivi nella casella è la risposta. */
    val domanda: Boolean = false,
    val domandaId: String? = null,
    /** Sta pensando alla tua ultima battuta. */
    val pensa: Boolean = false,
    /** PC 0.75.4: ha promesso lavoro ed è fermo («L'autopilota è fermo: Riprendi»). */
    val fermoConPromessa: Boolean = false,
    val compitiDaFare: List<String> = emptyList(),
    val chats: List<ChatGovernataBreve> = emptyList(),
    /** Il coordinatore e le sue sotto-chat (0.36.0). Assente nei computer piu' vecchi. */
    val albero: NodoAlbero? = null,
    /** PC 0.73.0: gli specialisti, con ruolo, stato, ultima azione e la sessione per «Guarda». */
    val specialisti: Specialisti? = null,
    /** Il ramo principale in cui si uniscono i lavori delle chat. */
    val ramoBase: String? = null,
    /** La regola di pubblicazione del progetto: beta, stabile, unica. */
    val pubblicazione: String? = null,
    /** Le sue domande per la linguetta «Domande» (0.38.0), una per volta. */
    val domandeScheda: List<DomandaScheda> = emptyList()
)

/**
 * Una riga della chat con lui: `da` è "tu", "lui" o "nota" (la sua voce di
 * lavoro); `tono` colora la riga (domanda, pronto, decisione, correzione,
 * fine, fermo…); `volte` quante note uguali di fila.
 */
@Serializable
data class Battuta(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val dettaglio: String? = null,
    val tono: String? = null,
    val volte: Int? = null
)

/** Una chat che esegue per l'autopilota: `stato` è lavoro | bloccata | finita. */
@Serializable
data class ChatGovernataBreve(
    val id: String = "",
    val compito: String = "",
    val stato: String = "",
    val cicli: Int = 0
)

/** Una battuta del dialogo: `da` è "tu" o "lui"; `esito` dice cosa ne ha fatto. */
@Serializable
data class ScambioDialogo(
    val quando: String = "",
    val da: String = "",
    val testo: String = "",
    val esito: String? = null
)

@Serializable
data class Criterio(
    val descrizione: String = "",
    val comando: String? = null,
    val soddisfatto: Boolean = false,
    val raggiuntoIl: String? = null,
    /** Com'e' andata l'ultima misura del comando. Assente se non l'ha ancora provato. */
    val ultimaVerifica: UltimaVerifica? = null
)

/**
 * L'esito dell'ultima volta che un criterio e' stato misurato (`Verifica` in
 * `src/shared/autopilota.ts`): zero e' passato, qualunque altro codice e' come
 * e' uscito il comando, e `uscita` e' quello che ha stampato, gia' tagliato.
 */
@Serializable
data class UltimaVerifica(
    val quando: String = "",
    val codice: Int? = null,
    val uscita: String = ""
)

@Serializable
data class Decisione(val quando: String = "", val cosa: String = "")

@Serializable
data class Passo(
    /** fatto | corrente | attesa | fermo | davanti */
    val stato: String = "davanti",
    val nome: String = "",
    val nota: String? = null
)

@Serializable
data class MisuraPasso(
    val percento: Int = 0,
    /** preparazione | criteri */
    val di: String = "",
    val dettaglio: String = "",
    /** preparazione | lavoro | attesa | fermo */
    val tono: String = ""
)

// ─── /api/quaderno ───
@Serializable
data class Schede(val schede: List<SchedaBreve> = emptyList())

@Serializable
data class SchedaBreve(
    val file: String = "",
    val titolo: String = "",
    val quando: String = "",
    /** PC 0.70: i tag e la prima riga del corpo, per i filtri e la ricerca. */
    val tag: List<String> = emptyList(),
    val assaggio: String = ""
)

@Serializable
data class SchedaPiena(
    val file: String = "",
    val titolo: String = "",
    val corpo: String = "",
    val quando: String = ""
)
