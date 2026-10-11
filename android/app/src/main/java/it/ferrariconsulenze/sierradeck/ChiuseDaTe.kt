package it.ferrariconsulenze.sierradeck

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Le chat chiuse da te sul computer (PC 0.60.9), le stesse regole di
 * `src/shared/chiuse.ts`: solo la chiusura voluta (la ×, «Chiudi») le scrive;
 * un riavvio o un guasto no. Se la chat che stai guardando sparisce perché
 * l'hai chiusa tu là, l'app torna all'elenco e lo dice, con l'ora.
 */
object ChiuseDaTe {
    /** La chiusura della chat che si guardava, se il computer dice che l'hai chiusa tu. */
    fun chiusaDi(vista: Chat?, chatOra: List<Chat>, chiuse: List<ChiusaDaTe>): ChiusaDaTe? {
        if (vista == null || chatOra.any { it.id == vista.id }) return null
        val s = vista.sessione ?: return null
        return chiuse.firstOrNull { it.sessione == s }
    }

    /** La riga che si legge sopra l'elenco. */
    fun avviso(titolo: String, chiusa: ChiusaDaTe, zona: ZoneId = ZoneId.systemDefault()): String {
        val ora = try {
            DateTimeFormatter.ofPattern("HH:mm").withZone(zona).format(Instant.parse(chiusa.il))
        } catch (e: Exception) { null }
        val nome = titolo.ifBlank { "La chat" }
        return "«$nome» l’hai chiusa sul computer${if (ora != null) " alle $ora" else ""}: si chiude anche qui. " +
            "La conversazione non è cancellata: la ritrovi in «Riprendi una conversazione»."
    }
}
