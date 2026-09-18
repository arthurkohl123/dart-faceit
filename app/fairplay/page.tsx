import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';

export default function FairPlayPage() {
  return <LegalPageShell eyebrow="Fair Play & Kontoschutz" title="Fair spielen. Fair geprüft." intro="RankedDarts schützt den Wettbewerb mit nachvollziehbaren Regeln. Auffälligkeiten sind kein automatischer Vorwurf – sie werden zuerst intern und fair geprüft.">
    <LegalSection title="Was wir schützen">
      <p>Jeder Ranked-Account steht für eine Person und eine faire Chance auf der Ladder. Mehrfachkonten, absichtliche Niederlagen, Ergebnisabsprachen, falsche Resultate und die Umgehung technischer Schutzmaßnahmen verzerren diese Grundlage und sind nicht erlaubt.</p>
    </LegalSection>
    <LegalSection title="Wie eine Prüfung abläuft">
      <p>Wir werten nur Informationen aus, die für den Spielbetrieb erforderlich sind: etwa bestätigte Matches, wiederkehrende Paarungen, Ergebnisverläufe und gemeldete Streitfälle. Auffällige Muster führen nicht automatisch zu einer Sperre und werden anderen Spielern nicht angezeigt.</p>
      <p>Bevor eine Maßnahme erfolgt, prüft das Team den konkreten Verlauf. Ein gutes Spiel, eine hohe Winrate oder ein neuer Account allein sind kein Regelverstoß.</p>
    </LegalSection>
    <LegalSection title="Mögliche Maßnahmen">
      <p>Je nach Fall können wir eine Verwarnung aussprechen, ein Ergebnis korrigieren oder aufheben, die Turnierteilnahme einschränken, eine befristete Queue-Sperre setzen oder einen Account zeitweise bzw. dauerhaft sperren. Bei Preisgeldern kann eine Auszahlung bis zur abgeschlossenen Prüfung zurückgestellt werden.</p>
    </LegalSection>
    <LegalSection title="Deine Möglichkeit zur Klärung">
      <p>Wenn dein Account eingeschränkt wurde oder du eine Entscheidung klären möchtest, nutze bitte den Support und schildere den Fall mit Matchzeit, Gegner und relevanten Informationen. Wir entscheiden nachvollziehbar, einzelfallbezogen und ohne automatische Sanktionen allein aufgrund eines Signals.</p>
    </LegalSection>
  </LegalPageShell>;
}
