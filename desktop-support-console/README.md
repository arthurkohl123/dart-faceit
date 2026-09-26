# RankedDarts Support Console

Eigenständige Windows-Oberfläche für den bestehenden RankedDarts-Live-Support.

## Sicherheit

Die Console verwendet ausschließlich die öffentliche Supabase-URL und den öffentlichen
Publishable/Anon-Key. Jede Aktion läuft mit der Sitzung des angemeldeten Mitarbeiters;
die vorhandenen Datenbankfunktionen prüfen weiterhin die Admin-Berechtigung. Ein
`SUPABASE_SERVICE_ROLE_KEY` darf niemals in diese App, ihre Konfigurationsdatei oder
einen Release gelangen.

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

## Enthaltene Arbeitsabläufe

- Anmeldung über das reguläre RankedDarts-Konto
- Berechtigungsprüfung über die vorhandenen Live-Support-RPCs
- Online/Offline-Schalter und Heartbeat im Hintergrund
- Eingang für wartende und aktive Gespräche
- Übernehmen, Antworten und Schließen von Gesprächen
- Desktop-Hinweis bei einer neu eingehenden Anfrage
- Tray-Modus: Schließen blendet die Console aus, statt den Support versehentlich zu beenden
