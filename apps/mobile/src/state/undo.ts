// KIT-032: one pending "Undo" at a time, shown for 5 seconds after finishing or discarding an item.
import { create } from "zustand";

export const UNDO_MS = 5000;

type Pending = { id: number; message: string; undo: () => Promise<void> };

type UndoState = {
  pending: Pending | null;
  offer: (message: string, undo: () => Promise<void>) => void;
  clear: (id: number) => void;
};

let nextId = 1;

export const useUndo = create<UndoState>((set, get) => ({
  pending: null,
  offer: (message, undo) => {
    const id = nextId++;
    set({ pending: { id, message, undo } });
    setTimeout(() => get().clear(id), UNDO_MS);
  },
  clear: (id) => {
    if (get().pending?.id === id) set({ pending: null });
  },
}));
