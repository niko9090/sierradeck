package it.ferrariconsulenze.sierradeck.schermate.notifiche

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneAvvisi

/**
 * GUSCIO (ramo m-app-schermate): la schermata vera sta nel ramo delle
 * notifiche (m-app-notifiche), che all'unione sostituisce questo file.
 */
@Composable
fun SchermataNotifiche() {
    Column(Modifier.verticalScroll(rememberScrollState())) { SezioneAvvisi() }
}
