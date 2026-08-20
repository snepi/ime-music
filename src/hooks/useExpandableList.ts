import { useEffect, useState } from 'react';

export const ARTIST_SECTION_PREVIEW = 7;

export function useExpandableList<T>(items: T[], pageSize = ARTIST_SECTION_PREVIEW, resetKey?: string) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  const visible = expanded ? items : items.slice(0, pageSize);

  return {
    visible,
    expanded,
    hasMore: !expanded && items.length > pageSize,
    hiddenCount: Math.max(0, items.length - pageSize),
    total: items.length,
    showAll: () => setExpanded(true),
  };
}
