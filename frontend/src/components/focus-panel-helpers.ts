export type FocusPanelTab = 'focus' | 'ideas' | 'people' | 'inbox' | 'recent' | 'calendar';
export type CalendarViewMode = 'list' | 'board';

export const FOCUS_PANEL_TAB_STORAGE_KEY = 'justdo-focus-panel-tab';
export const CALENDAR_VIEW_MODE_STORAGE_KEY = 'justdo-calendar-view-mode';

export const getVisibleItems = <T>(items: T[], expanded: boolean, maxItems: number): T[] => {
  if (expanded) return items;
  return items.slice(0, maxItems);
};

export const shouldShowExpandToggle = (totalItems: number, maxItems: number): boolean => {
  return totalItems > maxItems;
};

export const parseFocusPanelTab = (value: string | null | undefined): FocusPanelTab | null => {
  if (!value) return null;
  switch (value) {
    case 'focus':
    case 'ideas':
    case 'people':
    case 'inbox':
    case 'recent':
    case 'calendar':
      return value;
    default:
      return null;
  }
};

export const parseCalendarViewMode = (value: string | null | undefined): CalendarViewMode | null => {
  if (!value) return null;
  switch (value) {
    case 'list':
    case 'board':
      return value;
    default:
      return null;
  }
};
