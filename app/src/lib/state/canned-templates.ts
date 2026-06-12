import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Canned reply templates the user can insert into the composer.
 *
 * Two sources:
 *   - 4 built-in templates (BUILT_IN_TEMPLATES) — always present, can't be deleted
 *   - User custom templates — added/edited/deleted by the user, persisted to MMKV
 *
 * MMKV (not SQLite) because:
 *   - Tiny dataset (~10 templates max in practice)
 *   - Synchronous reads work great with Zustand's `persist` middleware
 *   - No relational queries needed
 */

export type CannedTemplate = {
  id: string;
  title: string;          // shown in picker chips
  body: string;           // inserted into the composer
  builtIn: boolean;
};

export const BUILT_IN_TEMPLATES: CannedTemplate[] = [
  {
    id: 'builtin-thanks',
    title: 'Thanks!',
    body:
      "Thanks so much for the kind words and for taking the time to leave a review — it really means a lot. " +
      "If you ever run into trouble or have ideas for what we should build next, drop us a note at support@example.com.",
    builtIn: true,
  },
  {
    id: 'builtin-bug-ack',
    title: 'Bug acknowledged',
    body:
      "Thanks for flagging this — we're really sorry you ran into it. We've reproduced the issue and a fix is in the next update, " +
      "which should ship within a week. If you'd like a heads-up when it's live, email support@example.com and we'll let you know.",
    builtIn: true,
  },
  {
    id: 'builtin-feature-request',
    title: 'Feature request',
    body:
      "Thanks for the suggestion — we genuinely read every idea and this one is going onto our roadmap. " +
      "If you have more details on exactly how you'd use it, we'd love to hear them at support@example.com.",
    builtIn: true,
  },
  {
    id: 'builtin-sorry',
    title: 'Sorry to hear',
    body:
      "We're really sorry the app hasn't worked the way you hoped. We'd love a chance to fix this for you — " +
      "could you email support@example.com with a bit more detail about what went wrong? We'll get back to you within a day.",
    builtIn: true,
  },
];

type State = {
  customTemplates: CannedTemplate[];
};

type Actions = {
  addCustom: (title: string, body: string) => string;
  updateCustom: (id: string, title: string, body: string) => void;
  removeCustom: (id: string) => void;
};

const storage = createMMKV({ id: 'release-pilot.canned-templates' });

export const useCannedTemplatesStore = create<State & Actions>()(
  persist(
    (set) => ({
      customTemplates: [],
      addCustom: (title, body) => {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((s) => ({
          customTemplates: [...s.customTemplates, { id, title, body, builtIn: false }],
        }));
        return id;
      },
      updateCustom: (id, title, body) =>
        set((s) => ({
          customTemplates: s.customTemplates.map((t) =>
            t.id === id ? { ...t, title, body } : t,
          ),
        })),
      removeCustom: (id) =>
        set((s) => ({
          customTemplates: s.customTemplates.filter((t) => t.id !== id),
        })),
    }),
    {
      name: 'canned-templates',
      storage: createJSONStorage(() => ({
        getItem: (k) => storage.getString(k) ?? null,
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.remove(k),
      })),
    },
  ),
);

/**
 * Selector that combines built-in + custom in the order users expect:
 * built-ins first, custom after.
 */
export function useAllTemplates(): CannedTemplate[] {
  const custom = useCannedTemplatesStore((s) => s.customTemplates);
  return [...BUILT_IN_TEMPLATES, ...custom];
}
