# RankedDarts Operations Console

Eigenständiger Windows-Arbeitsplatz für den RankedDarts-Live-Support und die täglichen Operations-Aufgaben.

## Sicherheit

Die Console verwendet ausschließlich die öffentliche Supabase-URL und den öffentlichen
Publishable/Anon-Key. Jede Aktion läuft mit der Sitzung des angemeldeten Mitarbeiters;
die vorhandenen Datenbankfunktionen prüfen weiterhin die Admin-Berechtigung. Der
Operations-Bereich prüft zusätzlich das Adminprofil und verlangt eine AAL2-MFA-Sitzung.
Ein `SUPABASE_SERVICE_ROLE_KEY` darf niemals in diese App, ihre Konfigurationsdatei oder einen Release gelangen.

## Lokal starten

```powershell
cd desktop-support-console
npm install
npm run configure
npm run dev
```

`npm run configure` liest nur die beiden öffentlichen `NEXT_PUBLIC_SUPABASE_*`-Werte aus
der RankedDarts-Umgebung und erzeugt eine lokale, git-ignorierte `src/runtime-config.js`.

## Windows-Setup bauen

```powershell
npm run configure
npm run package:win
```

Danach liegt die Setup-Datei in `desktop-support-console/release/`.

## Browser-Adminzugang abschalten

Erst nachdem ein Besitzer den neuen Desktop-Build getestet hat, in Vercel die Variable
`RANKEDDARTS_DESKTOP_OPERATIONS_ONLY=1` setzen und neu deployen. Danach liefern
`/admin` und `/admin/*` absichtlich eine nicht cachebare 404-Antwort. Für einen
Notfallzugang kann die Variable vorübergehend entfernt bzw. auf einen anderen Wert gesetzt und erneut deployed werden.

## Enthaltene Arbeitsabläufe

- Anmeldung über das reguläre RankedDarts-Konto
- Berechtigungsprüfung über die vorhandenen Live-Support-RPCs
- Online/Offline-Schalter und Heartbeat im Hintergrund
- Eingang für wartende und aktive Gespräche
- Übernehmen, Antworten und Schließen von Gesprächen
- Desktop-Hinweis bei einer neu eingehenden Anfrage
- Tray-Modus: Schließen blendet die Console aus, statt den Support versehentlich zu beenden
- Operations-Leitstand: offene Fälle, Fairplay-Signale, Turniere, Auszahlungen und Queue-Puls
- Spieler-360-Suche über die bestehenden, serverseitig geschützten Admin-RPCs
- MFA-Schranke vor Operations-Daten und -Aktionen
