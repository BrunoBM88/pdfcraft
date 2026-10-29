'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { BookOpen, BookmarkPlus, ExternalLink, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { openExternalUrl } from '@/lib/tauri-bridge';
import { getDicioUrl, lookupWord, type DictionaryEntry } from '@/lib/dictionary';
import { findGlossaryEntry, getGlossary, getServerGlossary, subscribeGlossary } from '@/lib/storage/glossary';
import { GlossaryEntryForm } from './GlossaryEntryForm';

export interface DictionaryAnchor {
    /** Viewport coordinates of the looked-up word */
    left: number;
    top: number;
    bottom: number;
}

export interface DictionaryPopupProps {
    word: string;
    anchor: DictionaryAnchor;
    onClose: () => void;
}

const POPUP_WIDTH = 360;
const POPUP_MAX_HEIGHT = 420;
const MARGIN = 8;

type LookupState =
    | { status: 'loading' }
    | { status: 'found'; entry: DictionaryEntry }
    | { status: 'not-found' }
    | { status: 'error' };

/**
 * Suggested text for a new glossary entry: the first Wiktionary section,
 * without its leading syllable/gender line ("pre.clu.são, feminino").
 */
function suggestDefinition(state: LookupState): string {
    if (state.status !== 'found') return '';
    const lines = state.entry.sections[0]?.lines ?? [];
    const withoutSyllables = /^[\p{L}.]+,/u.test(lines[0] ?? '') ? lines.slice(1) : lines;
    return withoutSyllables.join('\n');
}

/**
 * DictionaryPopup Component
 *
 * Small floating card shown next to a double-clicked word, with the user's
 * own glossary entry (if any), its Wiktionary definition and a link to Dicio.
 */
export function DictionaryPopup({ word, anchor, onClose }: DictionaryPopupProps) {
    const t = useTranslations('tools.pdfReader.dictionary');
    const tGlossary = useTranslations('tools.pdfReader.glossary');
    const popupRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<LookupState>({ status: 'loading' });
    const [isEditing, setIsEditing] = useState(false);
    const glossary = useSyncExternalStore(subscribeGlossary, getGlossary, getServerGlossary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const glossaryEntry = useMemo(() => findGlossaryEntry(word), [word, glossary]);
    const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + MARGIN });

    useEffect(() => {
        const controller = new AbortController();
        setState({ status: 'loading' });
        lookupWord(word, controller.signal)
            .then((entry) => setState(entry ? { status: 'found', entry } : { status: 'not-found' }))
            .catch(() => {
                if (!controller.signal.aborted) setState({ status: 'error' });
            });
        return () => controller.abort();
    }, [word]);

    // Keep the card inside the viewport: below the word, or above it if there is no room
    useLayoutEffect(() => {
        const height = popupRef.current?.offsetHeight ?? POPUP_MAX_HEIGHT;
        const width = Math.min(POPUP_WIDTH, window.innerWidth - MARGIN * 2);
        const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN));
        const fitsBelow = anchor.bottom + MARGIN + height <= window.innerHeight - MARGIN;
        const top = fitsBelow ? anchor.bottom + MARGIN : Math.max(MARGIN, anchor.top - MARGIN - height);
        setPosition({ left, top });
    }, [anchor, state, isEditing, glossaryEntry]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        const handleMouseDown = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) onClose();
        };
        // The card is fixed to the viewport, so it would drift away from the word on scroll
        const handleScroll = (event: Event) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('scroll', handleScroll, { capture: true });
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={popupRef}
            role="dialog"
            aria-label={t('title', { word })}
            className="fixed z-50 flex flex-col rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] shadow-xl"
            style={{ left: position.left, top: position.top, width: POPUP_WIDTH, maxWidth: `calc(100vw - ${MARGIN * 2}px)`, maxHeight: POPUP_MAX_HEIGHT }}
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[hsl(var(--color-border))]">
                <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                    <span className="font-semibold truncate">{word}</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))]"
                    aria-label={t('close')}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed">
                {isEditing ? (
                    <GlossaryEntryForm
                        initialTerm={glossaryEntry?.term ?? word.toLowerCase()}
                        initialDefinition={glossaryEntry?.definition ?? suggestDefinition(state)}
                        editingTerm={glossaryEntry?.term}
                        onDone={() => setIsEditing(false)}
                    />
                ) : (
                <>
                {glossaryEntry && (
                    <div className="mb-3 p-2 rounded-md bg-primary/10 border border-primary/30">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                {tGlossary('myGlossary')}
                                {glossaryEntry.term.toLowerCase() !== word.toLowerCase() && ` · ${glossaryEntry.term}`}
                            </p>
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="p-1 rounded hover:bg-primary/20 text-primary"
                                aria-label={tGlossary('edit')}
                                title={tGlossary('edit')}
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line">{glossaryEntry.definition}</p>
                    </div>
                )}
                {state.status === 'loading' && (
                    <div className="flex items-center gap-2 text-[hsl(var(--color-muted-foreground))]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('loading')}</span>
                    </div>
                )}
                {state.status === 'not-found' && (
                    <p className="text-[hsl(var(--color-muted-foreground))]">{t('notFound')}</p>
                )}
                {state.status === 'error' && (
                    <p className="text-[hsl(var(--color-muted-foreground))]">{t('error')}</p>
                )}
                {state.status === 'found' && state.entry.sections.map((section, index) => (
                    <div key={`${section.heading}-${index}`} className="mb-2 last:mb-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-foreground))]">
                            {section.heading}
                        </p>
                        {section.lines.map((line, lineIndex) => (
                            <p key={lineIndex} className="mt-0.5">{line}</p>
                        ))}
                    </div>
                ))}
                {state.status === 'found' && (
                    <button
                        type="button"
                        onClick={() => openExternalUrl(state.entry.sourceUrl)}
                        className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))] hover:underline"
                    >
                        {t('source')}
                    </button>
                )}
                </>
                )}
            </div>

            {!isEditing && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[hsl(var(--color-border))]">
                    {!glossaryEntry ? (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setIsEditing(true)}>
                            <BookmarkPlus className="w-3.5 h-3.5" />
                            {tGlossary('saveToGlossary')}
                        </Button>
                    ) : <span />}
                    <Button variant="primary" size="sm" className="gap-1" onClick={() => openExternalUrl(getDicioUrl(word))}>
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t('openDicio')}
                    </Button>
                </div>
            )}
        </div>,
        document.body
    );
}

export default DictionaryPopup;
