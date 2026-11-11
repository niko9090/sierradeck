package it.ferrariconsulenze.sierradeck.schermate.comune

import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import it.ferrariconsulenze.sierradeck.rete.Api
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Il «⋯» di una chat (app 11/11): Rinomina e Chiudi, con conferma. Lo usano
 * «Tutte le chat» e il dettaglio della chat. [onEsito] riceve una frase
 * corta; [onChiusa] parte dopo che il PC ha chiuso la chat.
 */
@Composable
fun TastoAzioniChat(api: Api?, id: String, titolo: String, onEsito: (String) -> Unit, onChiusa: () -> Unit = {}) {
    var menu by remember { mutableStateOf(false) }
    var rinomina by remember { mutableStateOf(false) }
    var chiudi by remember { mutableStateOf(false) }
    val ambito = rememberCoroutineScope()
    fun fai(cosa: suspend () -> Unit, dopo: () -> Unit = {}) = ambito.launch {
        try { cosa(); onEsito("Fatto."); dopo() }
        catch (e: CancellationException) { throw e }
        catch (e: Api.Errore) { onEsito("Il computer non l’ha presa.") }
        catch (e: Exception) { onEsito("Il computer non risponde. Riprova fra poco.") }
    }
    Box {
        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Altro per questa chat") }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text("Rinomina") }, onClick = { menu = false; rinomina = true })
            DropdownMenuItem(text = { Text("Chiudi") }, onClick = { menu = false; chiudi = true })
        }
    }
    if (rinomina) {
        var nome by remember(id) { mutableStateOf(titolo) }
        AlertDialog(
            onDismissRequest = { rinomina = false },
            title = { Text("Rinomina") },
            text = { OutlinedTextField(nome, { nome = it }, singleLine = true) },
            confirmButton = { Button(onClick = { rinomina = false; val n = nome.trim(); if (n.isNotEmpty() && api != null) fai({ api.rinominaChat(id, n) }) }) { Text("Salva") } },
            dismissButton = { TextButton(onClick = { rinomina = false }) { Text("Annulla") } }
        )
    }
    if (chiudi) AlertDialog(
        onDismissRequest = { chiudi = false },
        title = { Text("Chiudere «$titolo»?") },
        text = { Text("Il lavoro salvato resta; la chat si riapre dal PC.") },
        confirmButton = { Button(onClick = { chiudi = false; if (api != null) fai({ api.chiudiChat(id) }, onChiusa) }) { Text("Chiudi") } },
        dismissButton = { TextButton(onClick = { chiudi = false }) { Text("Annulla") } }
    )
}
