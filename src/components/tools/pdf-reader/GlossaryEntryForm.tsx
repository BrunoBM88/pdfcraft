'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { saveGlossaryEntry, deleteGlossaryEntry, findGlossaryEntry, glossaryKey } from '@/lib/storage/glossary';

export interface GlossaryEntryFormProps {
    initialTerm: string;
    initialDefinition: string;
    /** Term of the entry being edited; omit when creating a new one */
    editingTerm?: string;
    onDone: () => void;
}

const inputClassName = 'w-full px-2 py-1.5 text-sm rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

/**
 * Form to add, edit or delete a personal glossary entry
 */
export function GlossaryEntryForm({ initialTerm, initialDefinition, editingTerm, onDone }: GlossaryEntryFormProps) {
    const t = useTranslations('tools.pdfReader.glossary');
    const [term, setTerm] = useState(initialTerm);
    const [definition, setDefinition] = useState(initialDefinition);
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        if (!term.trim() || !definition.trim()) {
            setError(t('required'));
            return;
        }
        // Creating, or renaming onto, a term that already exists would silently overwrite it
        const existing = findGlossaryEntry(term);
        const isSameEntry = editingTerm && glossaryKey(editingTerm) === glossaryKey(existing?.term ?? '');
        if (existing && glossaryKey(existing.term) === glossaryKey(term) && !isSameEntry) {
            setError(t('duplicate', { term: existing.term }));
            return;
        }
        try {
            saveGlossaryEntry(term, definition, editingTerm);
            onDone();
        } catch {
            setError(t('saveError'));
        }
    };

    const handleDelete = () => {
        if (!editingTerm || !window.confirm(t('deleteConfirm', { term: editingTerm }))) return;
        deleteGlossaryEntry(editingTerm);
        onDone();
    };

    return (
        <div className="space-y-2">
            <div>
                <label className="block text-xs font-semibold text-[hsl(var(--color-muted-foreground))] mb-1">
                    {t('termLabel')}
                </label>
                <input
                    type="text"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className={inputClassName}
                />
            </div>
            <div>
                <label className="block text-xs font-semibold text-[hsl(var(--color-muted-foreground))] mb-1">
                    {t('definitionLabel')}
                </label>
                <textarea
                    value={definition}
                    onChange={(e) => setDefinition(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder={t('definitionPlaceholder')}
                    className={`${inputClassName} resize-y`}
                />
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex items-center justify-between gap-2">
                {editingTerm ? (
                    <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 dark:text-red-400">
                        {t('delete')}
                    </Button>
                ) : <span />}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onDone}>
                        {t('cancel')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleSave}>
                        {t('save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default GlossaryEntryForm;
