import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';

export default function ImprintPage() {
  return <LegalPageShell eyebrow="Rechtliches" title="Impressum" intro="Angaben zum Anbieter gemäß § 5 DDG.">
    <LegalSection title="Angaben gemäß § 5 DDG"><p><strong>RankedDarts – Arthur Berent</strong><br />c/o Autorenglück #54742<br />Albert-Einstein-Str. 47<br />02977 Hoyerswerda<br />Deutschland</p></LegalSection>
    <LegalSection title="Kontakt"><p>E-Mail: <a className="font-bold text-emerald-200 hover:text-emerald-100" href="mailto:support@rankeddarts.de">support@rankeddarts.de</a></p></LegalSection>
    <LegalSection title="Umsatzsteuer"><p>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p></LegalSection>
    <LegalSection title="Verantwortlich für Inhalte"><p>RankedDarts – Arthur Berent<br />c/o Autorenglück #54742<br />Albert-Einstein-Str. 47<br />02977 Hoyerswerda</p></LegalSection>
    <LegalSection title="Verbraucherstreitbeilegung"><p>Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, sofern nicht im Einzelfall eine gesetzliche Pflicht besteht.</p></LegalSection>
  </LegalPageShell>;
}
