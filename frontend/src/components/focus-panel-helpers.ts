export const getVisibleItems = <T>(items: T[], expanded: boolean, maxItems: number): T[] => {
  if (expanded) return items;
  return items.slice(0, maxItems);
};

export const shouldShowExpandToggle = (totalItems: number, maxItems: number): boolean => {
  return totalItems > maxItems;
};
