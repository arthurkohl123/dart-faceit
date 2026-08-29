# Datenschutz-Betriebscheckliste

Diese interne Checkliste ergänzt die öffentliche Datenschutzerklärung. Sie ist kein Ersatz für Rechtsberatung oder die Prüfung durch eine fachkundige Person.

## Vor dem weiteren Wachstum

- [ ] Für Supabase den passenden Auftragsverarbeitungsvertrag/Datenschutz-Nachtrag im Account prüfen und dokumentieren.
- [ ] Für Vercel prüfen, ob der gewählte Tarif vom Data Processing Addendum abgedeckt ist, und die Annahme dokumentieren.
- [ ] Stripe-DPA und die eigene Rolle für Zahlungsdaten im Stripe-Account dokumentieren.
- [ ] Mit STRATO klären, ob und in welcher Form ein Auftragsverarbeitungsvertrag für die Support-Mail erforderlich bzw. verfügbar ist.
- [ ] Projektregionen, Subprozessoren und gegebenenfalls Drittlandtransfers der tatsächlich genutzten Tarife in einer Dienstleisterliste festhalten.

## Verzeichnis der Verarbeitungstätigkeiten

Für mindestens diese Tätigkeiten intern Zweck, Datenkategorien, Empfänger, Rechtsgrundlage, Löschfrist und Schutzmaßnahmen festhalten:

1. Registrierung, Anmeldung und Kontoverwaltung
2. Matchmaking, Ranglisten und öffentliche Spielerprofile
3. Turnierverwaltung und Preisgelder
4. Premium-Abonnements und Rechnungs-/Zahlungsstatus
5. Support-Tickets und E-Mail-Kommunikation
6. Telefonverifikation, Fair-Play-Prüfungen und Sperrentscheidungen
7. Betrieb, Fehlerprotokolle, Backups und Sicherheitsüberwachung

## Laufender Betrieb

- [ ] Mindestens jährlich prüfen, ob neue Analyse-, Marketing-, Social-Media- oder Video-Dienste eingebunden wurden. Bei nicht notwendigen Cookies oder ähnlichen Technologien vor Aktivierung eine Einwilligungslösung einrichten.
- [ ] Bei neuen Tabellen, API-Routen oder Dienstleistern Datenschutzerklärung und Verzeichnis der Verarbeitungstätigkeiten aktualisieren.
- [ ] Rollen, Supabase-RLS-Regeln und Vercel-Umgebungsvariablen mindestens quartalsweise prüfen.
- [ ] Supportfälle regelmäßig auf nicht mehr erforderliche personenbezogene Daten prüfen und nach einem dokumentierten Löschkonzept entfernen bzw. anonymisieren.
- [ ] Sicherstellen, dass der Datenexport und die Kontolöschung weiterhin funktionieren.

## Datenschutzvorfall

1. Vorfall dokumentieren, Systeme absichern und Umfang feststellen.
2. Betroffene Daten, Personen, Empfänger und Risiken bewerten.
3. Falls meldepflichtig, die zuständige Aufsichtsbehörde innerhalb der gesetzlichen Frist informieren.
4. Betroffene Personen informieren, wenn ein hohes Risiko für ihre Rechte und Freiheiten besteht.
5. Ursache, Korrekturmaßnahme und Wiederholungsprüfung dokumentieren.
