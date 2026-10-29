'use client';

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { normalizeLookupWord } from '@/lib/dictionary';
import type { DictionaryAnchor } from './DictionaryPopup';

export interface ViewerLookup {
    word: string;
    anchor: DictionaryAnchor;
}

/**
 * Double-click dictionary for a PDF.js viewer iframe (same origin).
 *
 * Attaches to the iframe's document every time it loads, so it keeps working
 * when the viewer is reloaded with a new file. Pass `reloadKey` (e.g. the PDF
 * URL) so the hook re-binds when the iframe element is mounted or replaced.
 */
export function useViewerDictionary(
    iframeRef: RefObject<HTMLIFrameElement | null>,
    enabled: boolean,
    reloadKey: unknown
) {
    const [lookup, setLookup] = useState<ViewerLookup | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const closeLookup = useCallback(() => setLookup(null), []);

    useEffect(() => {
        if (!enabled) setLookup(null);
    }, [enabled]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        let detach: (() => void) | null = null;

        const attach = () => {
            detach?.();
            detach = null;
            let doc: Document | null = null;
            let win: Window | null = null;
            try {
                doc = iframe.contentDocument;
                win = iframe.contentWindow;
            } catch {
                return;
            }
            if (!doc || !win) return;
            const viewerWindow = win;

            const handleDoubleClick = () => {
                if (!enabledRef.current) return;
                const sel = viewerWindow.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const word = normalizeLookupWord(sel.toString());
                if (!word) return;
                const iframeRect = iframe.getBoundingClientRect();
                const rect = sel.getRangeAt(0).getBoundingClientRect();
                setLookup({
                    word,
                    anchor: {
                        left: iframeRect.left + rect.left,
                        top: iframeRect.top + rect.top,
                        bottom: iframeRect.top + rect.bottom,
                    },
                });
            };
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') closeLookup();
            };
            // Clicks and scrolling inside the viewer do not reach the host document.
            // pdf.js scrolls #viewerContainer, which may not exist yet, so listen in the capture phase.
            doc.addEventListener('dblclick', handleDoubleClick);
            doc.addEventListener('mousedown', closeLookup);
            doc.addEventListener('keydown', handleKeyDown);
            doc.addEventListener('scroll', closeLookup, { capture: true, passive: true });

            const boundDoc = doc;
            detach = () => {
                boundDoc.removeEventListener('dblclick', handleDoubleClick);
                boundDoc.removeEventListener('mousedown', closeLookup);
                boundDoc.removeEventListener('keydown', handleKeyDown);
                boundDoc.removeEventListener('scroll', closeLookup, { capture: true });
            };
        };

        iframe.addEventListener('load', attach);
        // The iframe may have finished loading before this effect ran
        try {
            if (iframe.contentDocument?.readyState === 'complete' && iframe.contentWindow?.location.href !== 'about:blank') {
                attach();
            }
        } catch {
            // Cross-origin document: nothing to attach to
        }

        return () => {
            iframe.removeEventListener('load', attach);
            detach?.();
        };
    }, [iframeRef, reloadKey, closeLookup]);

    return { lookup, closeLookup };
}
