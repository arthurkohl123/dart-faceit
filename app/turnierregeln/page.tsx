import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';

export default function TournamentRulesPage() {
  return <LegalPageShell eyebrow="Competitive Integrity" title="Turnierregeln" intro="Ein nachvollziehbarer Rahmen für faire, kompetitive RankedDarts-Turniere.">
    <LegalSection title="1. Teilnahme"><p>Teilnehmen darf, wer mindestens 18 Jahre alt ist, ein aktives RankedDarts-Konto besitzt und die auf der Turnierkarte veröffentlichten Voraussetzungen erfüllt. Dazu können Premium-Status, maximale oder minimale AVG, Teilnehmerzahl und Anmeldeschluss gehören.</p></LegalSection>
    <LegalSection title="2. Anmeldung und Check-in"><p>Mit der Anmeldung bestätigst du, zum angesetzten Startzeitpunkt spielbereit zu sein. Ein nicht angetretener Spieler kann vom Turnier ausgeschlossen werden. Der Veranstalter kann bei technischen Problemen angemessene Check-in-Fristen setzen.</p></LegalSection>
    <LegalSection title="3. Modus und Wertung"><p>Der Turnierbaum, das Best-of-Format und die Paarungen werden auf der jeweiligen Turnierseite angezeigt. Ergebnisse werden im Matchroom eingetragen und nach den dort vorgesehenen Bestätigungen gewertet. Bei Streitfällen entscheidet das Admin-Team auf Basis der vorliegenden Informationen.</p></LegalSection>
    <LegalSection title="4. Fair Play"><p>Absprachen, absichtliche Niederlagen, falsche Resultate, Identitätstäuschung oder technische Manipulationen führen zum Ausschluss. Admins dürfen betroffene Ergebnisse aufheben, korrigieren oder Matches wiederholen lassen.</p></LegalSection>
    <LegalSection title="5. Disconnects und technische Probleme"><p>Ein Verbindungsabbruch ist unverzüglich im Matchroom bzw. über den Support zu melden. Die Entscheidung über Wiederholung, Fortsetzung oder Wertung trifft das Admin-Team unter Berücksichtigung der konkreten Situation und des Turnierstands.</p></LegalSection>
    <LegalSection title="6. Verhalten"><p>Respektvolle Kommunikation ist Pflicht. Beleidigungen, Diskriminierung und wiederholtes Stören können zu Matchstrafen, Turnierausschluss oder Plattform-Sperren führen.</p></LegalSection>
    <LegalSection title="7. Preise und Änderungen"><p>Preisgelder oder Sachpreise bestehen nur, wenn sie auf der jeweiligen Turnierseite ausdrücklich angekündigt sind. Turnierspezifische Regeln auf der jeweiligen Turnierseite gehen diesen allgemeinen Regeln vor. Bei unvorhergesehenen Fällen trifft das Admin-Team eine faire, nachvollziehbare Entscheidung.</p></LegalSection>
  </LegalPageShell>;
}
