'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { RankBadge } from '@/components/RankBadge';
import { getRankForElo } from '@/lib/ranks';

type SearchPlayer = {
  username: string;
  elo: number;
  season_games_played: number;
};

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 8;

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function sortPlayersForQuery(players: SearchPlayer[], query: string) {
  const normalizedQuery = query.toLocaleLowerCase('de-DE');
  return [...players].sort((left, right) => {
    const leftName = left.username.toLocaleLowerCase('de-DE');
    const rightName = right.username.toLocaleLowerCase('de-DE');
    const leftScore = leftName === normalizedQuery ? 0 : leftName.startsWith(normalizedQuery) ? 1 : 2;
    const rightScore = rightName === normalizedQuery ? 0 : rightName.startsWith(normalizedQuery) ? 1 : 2;
    return leftScore - rightScore || leftName.localeCompare(rightName, 'de-DE');
  });
}

export function GlobalPlayerSearch() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedQuery = query.trim();
  const canSearch = normalizedQuery.length >= MIN_QUERY_LENGTH;

  const openSearch = useCallback(() => {
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setResolvedQuery('');
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
      if (event.key === 'Escape' && open) closeSearch();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSearch, open, openSearch]);

  useEffect(() => {
    if (!open || !canSearch) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const { data, error: requestError } = await supabase
        .from('public_visible_profiles')
        .select('username, elo, season_games_played')
        .ilike('username', `%${escapeIlikePattern(normalizedQuery)}%`)
        .order('username', { ascending: true })
        .limit(RESULT_LIMIT);

      if (!active) return;
      if (requestError) {
        setResults([]);
        setError('Die Spielersuche ist gerade nicht verfügbar.');
      } else {
        setResults(sortPlayersForQuery((data ?? []) as SearchPlayer[], normalizedQuery));
      }
      setResolvedQuery(normalizedQuery);
      setLoading(false);
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canSearch, normalizedQuery, open, supabase]);

  const isSearching = canSearch && (loading || resolvedQuery !== normalizedQuery);
  const visibleResults = resolvedQuery === normalizedQuery ? results : [];
  const visibleError = resolvedQuery === normalizedQuery ? error : null;

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        className="fixed right-4 top-[5.25rem] z-[80] inline-flex h-10 items-center gap-2 border border-white/15 bg-[#0b0f0d]/95 px-3 text-xs font-black uppercase tracking-[0.13em] text-zinc-100 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-emerald-300/45 hover:bg-emerald-300/[0.09] hover:text-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 lg:right-72 lg:top-3 lg:h-12 lg:px-4"
        aria-label="Spieler suchen"
      >
        <Search className="h-4 w-4 text-emerald-200" />
        <span className="hidden sm:inline">Suche</span>
        <span className="hidden border-l border-white/10 pl-2 text-[9px] tracking-[0.08em] text-zinc-500 lg:inline">Strg + K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[130] overflow-y-auto bg-[#050807]/[0.97] px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-8" role="dialog" aria-modal="true" aria-labelledby="player-search-title">
          <div className="mx-auto w-full max-w-4xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">RankedDarts · Spielerverzeichnis</p>
                <h2 id="player-search-title" className="mt-2 text-2xl font-black tracking-[-0.05em] text-white sm:text-3xl">Spieler finden.</h2>
              </div>
              <button type="button" onClick={closeSearch} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.07] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70" aria-label="Suche schließen"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 border border-emerald-300/25 bg-[#0b100e] shadow-2xl shadow-black/40">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
                <Search className="h-5 w-5 shrink-0 text-emerald-200" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Spielername eingeben"
                  autoComplete="off"
                  maxLength={32}
                  className="min-w-0 flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder:text-zinc-600 sm:text-xl"
                  aria-describedby="player-search-help"
                />
                {query ? <button type="button" onClick={() => setQuery('')} className="grid h-8 w-8 shrink-0 place-items-center text-zinc-500 transition hover:text-white" aria-label="Eingabe löschen"><X className="h-4 w-4" /></button> : null}
              </div>

              <div className="min-h-56 p-3 sm:p-4">
                {!canSearch ? (
                  <div className="grid min-h-48 place-items-center px-5 text-center">
                    <div>
                      <span className="mx-auto grid h-12 w-12 place-items-center border border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"><Search className="h-5 w-5" /></span>
                      <p className="mt-4 text-sm font-black text-zinc-200">Wen suchst du?</p>
                      <p id="player-search-help" className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Gib mindestens zwei Zeichen ein. Es werden nur öffentliche Spielerprofile angezeigt.</p>
                    </div>
                  </div>
                ) : isSearching ? (
                  <div className="grid min-h-48 place-items-center text-sm font-bold text-zinc-400"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-emerald-200" /> Suche läuft …</span></div>
                ) : visibleError ? (
                  <div className="grid min-h-48 place-items-center px-5 text-center text-sm font-bold text-rose-200">{visibleError}</div>
                ) : visibleResults.length === 0 ? (
                  <div className="grid min-h-48 place-items-center px-5 text-center"><div><p className="text-sm font-black text-zinc-200">Kein Spieler gefunden.</p><p className="mt-2 text-sm text-zinc-500">Für „{normalizedQuery}“ gibt es kein öffentliches Profil.</p></div></div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between px-2 pb-3 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500"><span>Spieler</span><span>{visibleResults.length} Treffer</span></div>
                    <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                      {visibleResults.map((player) => {
                        const rank = getRankForElo(player.elo);
                        return <Link key={player.username} href={`/players/${encodeURIComponent(player.username)}`} onClick={closeSearch} className="group flex items-center gap-3 px-3 py-3.5 transition hover:bg-emerald-300/[0.06] sm:px-4">
                          <RankBadge level={rank.level} size="xs" />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white group-hover:text-emerald-100 sm:text-base">{player.username}</span><span className={`mt-1 block text-[10px] font-bold ${rank.color}`}>Level {rank.level} · {rank.name}</span></span>
                          <span className="hidden text-right sm:block"><span className="block text-sm font-black text-emerald-200">{player.elo} Elo</span><span className="mt-1 block text-[10px] font-bold text-zinc-500">{player.season_games_played} Season-Spiele</span></span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-200" />
                        </Link>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-600"><span>Direkt zum öffentlichen Spielerprofil</span><span>Strg + K zum Öffnen</span></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
