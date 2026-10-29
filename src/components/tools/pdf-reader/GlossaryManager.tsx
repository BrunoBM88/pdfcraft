'use client';

import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Pencil, Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { saveBlobFile } from '@/lib/tauri-bridge';
import {
    exportGlossary,
    getGlossary,
    getServerGlossary,
    glossaryKey,
    importGlossary,
    subscribeGlossary,
} from '@/lib/storage/glossary';
import { GlossaryEntryForm } from './GlossaryEntryForm';

export interface GlossaryManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * GlossaryManager Component
 *
 * Lists the personal glossary with search, and lets the user add, edit,
 * delete, export and import entries.
 */
export function GlossaryManager({ isOpen, onClose }: GlossaryManagerProps) {
    const t = useTranslations('tools.pdfReader.glossary');
    const entries = useSyncExternalStore(subscribeGlossary, getGlossary, getServerGlossary);
    const [query, setQuery] = useState('');
    // null = list view, '' = new entry, otherwise the term being edited
    const [editing, setEditing] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const key = glossaryKey(query);
        if (!key) return entries;
        return entries.filter((entry) =>
            glossaryKey(entry.term).includes(key) || glossaryKey(entry.definition).includes(key)
        );
    }, [entries, query]);

    const handleExport = async () => {
        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([exportGlossary()], { type: 'application/json' });
        if (await saveBlobFile(blob, `glossario-${date}.json`)) {
            setMessage(t('exported', { count: entries.length }));
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const count = importGlossary(await file.text());
            setMessage(t('imported', { count }));
        } catch {
            setMessage(t('importError'));
        }
    };

    const editingEntry = editing ? entries.find((entry) => entry.term === editing) : undefined;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('managerTitle')} size="lg">
            <div className="space-y-3 py-2">
                {editing !== null ? (
                    <GlossaryEntryForm
                        initialTerm={editingEntry?.term ?? query}
                        initialDefinition={editingEntry?.definition ?? ''}
                        editingTerm={editingEntry?.term}
                        onDone={() => setEditing(null)}
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[180px]">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--color-muted-foreground))]" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <Button variant="primary" size="sm" className="gap-1" onClick={() => { setMessage(null); setEditing(''); }}>
                                <Plus className="w-3.5 h-3.5" />
                                {t('newTerm')}
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={!entries.length}>
                                <Download className="w-3.5 h-3.5" />
                                {t('export')}
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-3.5 h-3.5" />
                                {t('import')}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={handleImport}
                            />
                        </div>

                        {message && (
                            <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{message}</p>
                        )}

                        <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                            {t('count', { count: entries.length })} · {t('backupHint')}
                        </p>

                        <div className="max-h-[50vh] overflow-y-auto divide-y divide-[hsl(var(--color-border))] border border-[hsl(var(--color-border))] rounded-md">
                            {filtered.length === 0 ? (
                                <p className="p-4 text-sm text-center text-[hsl(var(--color-muted-foreground))]">
                                    {entries.length ? t('noResults') : t('empty')}
                                </p>
                            ) : filtered.map((entry) => (
                                <div key={entry.term} className="flex items-start justify-between gap-2 p-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm">{entry.term}</p>
                                        <p className="text-sm whitespace-pre-line text-[hsl(var(--color-muted-foreground))]">
                                            {entry.definition}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setMessage(null); setEditing(entry.term); }}
                                        className="p-1 rounded hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] flex-shrink-0"
                                        aria-label={t('edit')}
                                        title={t('edit')}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

export default GlossaryManager;
