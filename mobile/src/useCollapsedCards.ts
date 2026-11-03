import { useState } from "react";

const STORAGE_KEY = "ack-deck.mobile-collapsed-cards.v1";

export function useCollapsedCards() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const toggle = (cardId: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [cardId]: !prev[cardId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isCollapsed = (cardId: string) => Boolean(collapsed[cardId]);

  return { collapsed, toggle, isCollapsed };
}
