; Aggiunte all'installer di SierraDeck Aiutante (12/11).
;
; Firewall di Windows: gli altri PC della rete devono poter bussare
; all'Aiutante anche se la rete e' «Pubblica». Regola in ingresso per il
; programma installato, solo dalla rete locale: mai da internet. Il nome e'
; suo, diverso da quello del programma completo: installare o togliere uno
; dei due non tocca la regola dell'altro. Senza amministratore netsh
; fallisce e si va avanti.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="SierraDeck Aiutante (rete locale)"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="SierraDeck Aiutante (rete locale)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" remoteip=LocalSubnet profile=any enable=yes'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="SierraDeck Aiutante (rete locale)"'
  Pop $0
!macroend
