import Link from 'next/link';
import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';

const mailClass = 'font-bold text-emerald-200 hover:text-emerald-100';

export default function PrivacyPage() {
  return <LegalPageShell eyebrow="Datenschutz · Stand 02.11.2026" title="Datenschutzerklärung" intro="Informationen zur Verarbeitung personenbezogener Daten bei der Nutzung von RankedDarts.">
    <LegalSection title="1. Verantwortliche Stelle">
      <p>Verantwortlich für die Datenverarbeitung ist RankedDarts – Arthur Berent, c/o Autorenglück #54742, Albert-Einstein-Str. 47, 02977 Hoyerswerda, E-Mail: <a className={mailClass} href="mailto:support@rankeddarts.de">support@rankeddarts.de</a>.</p>
    </LegalSection>
    <LegalSection title="2. Konto, Registrierung und Profil">
      <p>Bei der Registrierung und Kontonutzung verarbeiten wir E-Mail-Adresse, Nutzername, Authentifizierungs-ID, Kontostatus, Sicherheits- und Verifizierungsdaten sowie die von dir freiwillig hinterlegten Scolia-, DartCounter- und AutoDarts-Namen. Soweit die Telefonverifizierung aktiviert ist, verarbeiten wir außerdem Telefonnummer und Verifizierungsstatus. Die Verarbeitung dient der Bereitstellung des Kontos, der Missbrauchsprävention und der Nutzung der Plattform. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; für Sicherheitsmaßnahmen zusätzlich Art. 6 Abs. 1 lit. f DSGVO.</p>
    </LegalSection>
    <LegalSection title="3. Matchmaking, Turniere und öffentliche Spielinformationen">
      <p>Für Matchmaking und Turniere verarbeiten wir Spielpaarungen, Ergebnisse, Elo-Werte, Siege, Match- und Turnierhistorie, Durchschnittswerte, eingetragene Statistiken sowie Zeitpunkte und technische Statusinformationen. Nutzername, Rang, Elo, Saisonwerte und ausgewählte Spiel- bzw. Turnierinformationen können auf öffentlichen Spielerprofilen, Ranglisten und Turnierseiten sichtbar sein. Dies ist für die Durchführung der kompetitiven Plattform und die transparente Wertung erforderlich (Art. 6 Abs. 1 lit. b DSGVO).</p>
    </LegalSection>
    <LegalSection title="4. Fair Play, Sicherheit und Missbrauchsprävention">
      <p>Wir verarbeiten Sicherheitsprotokolle, Rate-Limit-Informationen, Verifizierungsstatus, No-Show- und Sperrinformationen sowie Hinweise auf Mehrfachkonten oder mögliche Matchmanipulation. Diese Daten dienen der Erkennung, Untersuchung und Verhinderung von Missbrauch sowie dem Schutz fairer Wettbewerbe (Art. 6 Abs. 1 lit. f DSGVO). Verdachtsmerkmale lösen keine ausschließlich automatisierte endgültige Entscheidung über eine Sperre aus; Maßnahmen werden durch das Admin-Team geprüft.</p>
    </LegalSection>
    <LegalSection title="5. Premium, Zahlungen und Auszahlungen">
      <p>Für Premium-Abonnements leiten wir zum Stripe-Checkout weiter. Zahlungs- und Zahlungsmitteldaten werden nicht auf unseren Servern gespeichert. Wir verarbeiten von Stripe übermittelte Vertrags- und Statusdaten, etwa Kunden- und Abonnementkennung, Zahlungsstatus, Laufzeit und Kündigungsstatus, um den Premium-Zugang bereitzustellen. Für Preisgeldauszahlungen können wir nach gesonderter Anforderung Zahlungsdaten wie IBAN oder PayPal-Adresse verarbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; gesetzliche Aufbewahrungspflichten bleiben unberührt.</p>
    </LegalSection>
    <LegalSection title="6. Support und Kommunikation">
      <p>Wenn du ein Ticket eröffnest oder uns kontaktierst, verarbeiten wir deine Kontaktangaben, Nachricht, Anhänge und den Bearbeitungsverlauf zur Bearbeitung deines Anliegens (Art. 6 Abs. 1 lit. b oder lit. f DSGVO). Das Postfach <a className={mailClass} href="mailto:support@rankeddarts.de">support@rankeddarts.de</a> wird über STRATO betrieben. Für transaktionale System-E-Mails, etwa zur Passwort-Zurücksetzung, E-Mail-Bestätigung oder zu deinem Konto, setzen wir Resend ein. Dabei werden insbesondere E-Mail-Adresse, E-Mail-Inhalt sowie technische Zustellinformationen verarbeitet.</p>
    </LegalSection>
    <LegalSection title="7. Hosting und technischer Betrieb">
      <p>RankedDarts wird auf einem von <strong>Webtropia</strong> bereitgestellten virtuellen Server betrieben. Dort werden die für den Betrieb erforderlichen Konto-, Profil-, Spiel-, Turnier- und Supportdaten verarbeitet. Außerdem fallen technisch notwendige Serverprotokolle an, insbesondere IP-Adresse, Zeitpunkt des Zugriffs, aufgerufene Adresse, Browser- bzw. Geräteinformationen sowie Status- und Fehlermeldungen. Die Verarbeitung dient der Auslieferung der Plattform, der Sicherheit, der Fehleranalyse und dem Schutz vor Missbrauch (Art. 6 Abs. 1 lit. b und lit. f DSGVO).</p>
      <p>Authentifizierung, Datenbank und Realtime-Funktionen betreiben wir selbst auf diesem Server. Für diese Funktionen setzen wir im Produktivbetrieb keinen extern verwalteten Plattformdienst ein.</p>
    </LegalSection>
    <LegalSection title="8. Eingesetzte Dienstleister und Datenübermittlungen">
      <p><strong>Webtropia</strong> stellt die Hosting-Infrastruktur für RankedDarts bereit. <strong>Stripe</strong> stellt die Zahlungsdienste für Premium-Abonnements bereit. <strong>Resend</strong> versendet die in Abschnitt 6 genannten transaktionalen E-Mails. <strong>STRATO</strong> wird für das Support-Postfach eingesetzt. Soweit ein Dienstleister Daten außerhalb der EU bzw. des EWR verarbeitet, erfolgt die Übermittlung nur bei Vorliegen der gesetzlichen Voraussetzungen, etwa auf Grundlage eines Angemessenheitsbeschlusses, des EU-US Data Privacy Frameworks oder von EU-Standardvertragsklauseln. Ergänzende Datenschutzhinweise der jeweiligen Dienstleister gelten neben dieser Erklärung.</p>
    </LegalSection>
    <LegalSection title="9. Cookies und ähnliche Technologien">
      <p>RankedDarts verwendet derzeit nur technisch notwendige Speicher- und Cookie-Funktionen, insbesondere für Anmeldung, Sitzungsverwaltung, Sicherheit und die von dir angeforderten Plattformfunktionen. Wir setzen nach aktuellem Stand keine Werbe- oder Analyse-Tracker ein. Sollte dies künftig geändert werden, informieren wir vorab und holen, soweit erforderlich, eine Einwilligung ein.</p>
    </LegalSection>
    <LegalSection title="10. Speicherdauer">
      <p>Kontodaten sowie Match- und Turnierdaten speichern wir grundsätzlich für die Dauer des Nutzerkontos. Nach einer Kontolöschung werden personenbezogene Profildaten entfernt oder anonymisiert; nicht personenbezogene bzw. anonymisierte Matchwerte können zur Integrität von Ranglisten und Gegnerhistorien erhalten bleiben. Supportdaten speichern wir nur, solange sie für die Bearbeitung, Nachvollziehbarkeit oder gesetzliche Pflichten erforderlich sind. Vertrags- und Abrechnungsunterlagen bewahren wir entsprechend gesetzlicher Aufbewahrungspflichten auf.</p>
    </LegalSection>
    <LegalSection title="11. Deine Rechte und Beschwerderecht">
      <p>Du hast – soweit die gesetzlichen Voraussetzungen vorliegen – das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Erteilte Einwilligungen kannst du mit Wirkung für die Zukunft widerrufen. Einen Datenexport oder die Kontolöschung kannst du nach Login unter <Link className={mailClass} href="/account">Account & Daten</Link> anfordern bzw. ausführen. Datenschutzanfragen richtest du an <a className={mailClass} href="mailto:support@rankeddarts.de">support@rankeddarts.de</a>.</p>
      <p>Du hast außerdem das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren. Für den Verantwortlichen mit Sitz in Sachsen ist regelmäßig die Sächsische Datenschutz- und Transparenzbeauftragte zuständig.</p>
    </LegalSection>
  </LegalPageShell>;
}
