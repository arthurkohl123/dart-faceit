import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';

export default function ImprintPage() {
  return <LegalPageShell eyebrow="Rechtliches" title="Impressum" intro="Angaben zum Anbieter gemäß § 5 DDG.">
    <LegalSection title="Angaben gemäß § 5 DDG"><p><strong>RankedDarts</strong><br />Arthur Berent<br />Milanstraße 16<br />14612 Falkensee<br />Deutschland</p></LegalSection>
    <LegalSection title="Kontakt"><p>E-Mail: <a className="font-bold text-emerald-200 hover:text-emerald-100" href="mailto:support@rankeddarts.de">support@rankeddarts.de</a></p></LegalSection>
    <LegalSection title="Umsatzsteuer"><p>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p></LegalSection>
    <LegalSection title="Verantwortlich für Inhalte"><p>Arthur Berent<br />Milanstraße 16<br />14612 Falkensee</p></LegalSection>
    <LegalSection title="Verbraucherstreitbeilegung"><p>Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, sofern nicht im Einzelfall eine gesetzliche Pflicht besteht.</p></LegalSection>
  </LegalPageShell>;
}
