package it.ferrariconsulenze.sierradeck.nucleo

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * «Progetti» rifatto (PC 0.69.0, app 2.69.0). Nicholas, 12/10: «rifai il menu
 * Progetti!! non si capisce nulla». Come sul PC, adattato al telefono: un
 * elenco con lo stato in una parola e un colore, i gruppi (Su questo PC · Su
 * altri PC · Da sistemare · Tutti), la ricerca e l'ordine; il tocco apre il
 * dettaglio a tutto schermo. Lo stato, i gruppi e i testi li calcola il PC
 * (`vista`, src/shared/progetti-vista.ts): qui si disegnano. Da un PC di
 * prima della 0.69 si ricava il minimo (`vistaDi`).
 */
@Serializable data class StatoVistaDrive(val id: String = "a-posto", val parola: String = "a posto", val colore: String = "verde", val ragione: String? = null)