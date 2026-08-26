import Link from 'next/link';
import { CalendarClock, CircleHelp, CreditCard } from 'lucide-react';
import { LegalPageShell, LegalSection } from '@/components/legal-page-shell';
import { PremiumCancellationActions } from '@/components/premium-cancellation-actions';

export default function PremiumCancellationPage() {
  return <LegalPageShell eyebrow="Premium · Vertrag & Kündigung" title="Premium kündigen" intro="Hier findest du die wichtigsten Informationen zu Abrechnung, Laufzeit und dem Kündigungsweg für RankedDarts Premium.">
    <PremiumCancellationActions />
    <LegalSection title="Abrechnung und Laufzeit"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><CreditCard className="h-5 w-5 text-amber-200" /><p className="mt-3 font-black text-white">Preis vor Abschluss</p><p className="mt-1 text-sm text-zinc-400">Preis, Zahlungsart und Abrechnungsintervall werden im Stripe-Checkout klar angezeigt, bevor du zahlungspflichtig abschließt.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><CalendarClock className="h-5 w-5 text-cyan-300" /><p className="mt-3 font-black text-white">Ende der Verlängerung</p><p className="mt-1 text-sm text-zinc-400">Nach einer Kündigung läuft Premium grundsätzlich bis zum Ende des bereits bezahlten Abrechnungszeitraums weiter, soweit im Checkout nichts Abweichendes steht.</p></div></div></LegalSection>
    <LegalSection title="Was passiert nach der Kündigung?"><p>Bis zum Ende des laufenden Zeitraums bleiben die Premium-Vorteile aktiv. Danach wird dein Konto als kostenloses Konto weitergeführt; dein Account, deine Matchhistorie und deine Profildaten bleiben erhalten, sofern du keine Löschung beantragst.</p></LegalSection>
    <LegalSection title="Hilfe bei Zahlungsthemen"><p>Bei einer unbekannten Abbuchung, einer fehlerhaften Zahlung oder Problemen mit dem Kündigungsweg nutze ebenfalls den Support. Halte keinen vollständigen Karten- oder Zahlungsdaten im Ticket fest.</p><Link href="/support" className="inline-flex items-center gap-2 font-black text-emerald-200 transition hover:text-emerald-100">Premium-Support öffnen <CircleHelp className="h-4 w-4" /></Link></LegalSection>
    <LegalSection title="Hinweis zur rechtlichen Prüfung"><p>Der Online-Kündigungsweg ist technisch eingerichtet. Bitte lasse Preisangaben, Vertragsbedingungen, Bestätigungs-E-Mails und die konkrete Ausgestaltung dieses Ablaufs vor dem Live-Betrieb rechtlich prüfen, insbesondere wenn du Verbraucherverträge anbietest.</p></LegalSection>
  </LegalPageShell>;
}
