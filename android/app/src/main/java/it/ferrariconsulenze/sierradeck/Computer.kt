package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Quella che era la scheda «Computer» (fino all'app 2.60) si è divisa: dalla
 * 2.61.0 in parti per voce del menu, dalla 2.83.0 in sezioni che leggono dal
 * PC solo mentre si vedono (prima `/api/aggiornamento` ogni 2 secondi in tutte
 * e quattro le parti, anche dove non si vedeva):
 *
 * - Chat › Workspace: `SezioneWorkspaceChat`;
 * - Progetti › Drive: qui sotto, `DriveECode`;
 * - Altro: `AltriComputer`, `SezioneConsumi`, `SezioneSalute`, `SezioneAggiornamenti`,
 *   `SezioneAccount`, `SezioneAspetto`, `SezioneAvvisi`, `SezioneInfo` (vedi `Altro.kt`).
 */
@Composable
fun DriveECode(api: Api, stato: Stato?) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // Il contenuto del Drive: già aperto (2.83.0), prima stava dietro «Apri».
        Sezione("Drive")
        SezioneDrive(api, apertoDaSubito = true)
        Divisore()
        // Le code dei progetti: un comando in fila per progetto.
        CodeProgetti(api, stato)
        Spacer(Modifier.height(24.dp))
    }
}
