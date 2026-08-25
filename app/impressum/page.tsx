import { LegalPageShell, LegalSection, PlaceholderNotice } from '@/components/legal-page-shell';

export default function ImprintPage() {
  return <LegalPageShell eyebrow="Rechtliches" title="Impressum" intro="Angaben zum Anbieter gemäß § 5 DDG.">
    <PlaceholderNotice />
    <LegalSection title="Angaben gemäß § 5 DDG"><p><strong>RankedDarts</strong><br />[Vor- und Nachname / Firmenname]<br />[Straße und Hausnummer]<br />[PLZ Ort]<br />Deutschland</p></LegalSection>
    <LegalSection title="Kontakt"><p>E-Mail: [kontakt@deine-domain.de]<br />Telefon: [Telefonnummer – falls vorhanden]</p></LegalSection>
    <LegalSection title="Vertretungsberechtigte Person"><p>[Vor- und Nachname], sofern RankedDarts als Gesellschaft betrieben wird.</p></LegalSection>
    <LegalSection title="Register- und Steuerangaben"><p>Registergericht und Registernummer: [nur falls vorhanden]<br />Umsatzsteuer-ID / Wirtschafts-ID: [nur falls vorhanden]</p></LegalSection>
    <LegalSection title="Verantwortlich für Inhalte"><p>[Vor- und Nachname]<br />[vollständige Anschrift]</p></LegalSection>
    <LegalSection title="Verbraucherstreitbeilegung"><p>Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, sofern nicht im Einzelfall eine gesetzliche Pflicht besteht.</p></LegalSection>
  </LegalPageShell>;
}
