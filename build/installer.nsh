; Aggiunte all'installer di electron-builder (0.57.0).
;
; Nella 0.57.0 l'appId, che Windows usa come AppUserModelID, è cambiato.
; L'installer rifà da solo i collegamenti del menu Start e del desktop con quello
; nuovo, ma non tocca il collegamento che l'utente ha fissato sulla barra delle
; applicazioni: resterebbe con quello vecchio, e la finestra aperta comparirebbe
; come un'icona a parte. Qui lo si aggiorna, se c'è.
!macro customInstall
  ${if} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
    WinShell::SetLnkAUMI "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}

  ; Firewall di Windows: il telefono sul wifi di casa deve poter bussare al PC
  ; anche se la rete e' «Pubblica». Regola in ingresso per il programma installato
  ; (copre le porte configurabili del Client e l'mDNS), solo dalla rete locale:
  ; mai da internet. Prima si toglie la regola con lo stesso nome, cosi' un
  ; aggiornamento non lascia doppioni. Senza amministratore netsh fallisce e si
  ; va avanti: il programma mostra il comando di ripiego.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="SierraDeck (rete locale)"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="SierraDeck (rete locale)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" remoteip=LocalSubnet profile=any enable=yes'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="SierraDeck (rete locale)"'
  Pop $0
!macroend
