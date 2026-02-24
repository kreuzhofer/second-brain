import { cn } from '@/lib/utils';

export const FORM_CONTROL_TEXT_CLASS = 'text-base';

export const APP_SHELL_CLASSES = {
  appRoot: 'min-h-dvh h-dvh flex flex-col bg-background',
  header: 'border-b',
  headerInner: 'w-full px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4 lg:py-2.5',
  headerRow: 'flex items-center justify-between gap-2 min-w-0 flex-nowrap',
  brandWrap: 'flex items-center gap-2 min-w-0',
  brandTitle: 'text-base sm:text-lg lg:text-xl font-bold leading-none whitespace-nowrap',
  headerSearchWrap: 'flex items-center gap-2 w-full justify-end min-w-0',
  mobileSearchPanelWrap: 'mt-1.5 lg:hidden',
  main: 'w-full flex-1 min-h-0 pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0',
  contentGrid: 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-0 h-full min-h-0',
  chatColumn: 'hidden lg:flex flex-col min-h-0 border-r',
  desktopFocusColumn: 'hidden lg:flex flex-col min-h-0 lg:overflow-y-auto',
  bottomNav: 'fixed bottom-0 left-0 right-0 lg:hidden border-t bg-background/95 supports-[backdrop-filter]:bg-background/90 backdrop-blur',
  bottomNavInner: 'grid grid-cols-2 items-stretch gap-1 px-1 pt-1 pb-[calc(4px+env(safe-area-inset-bottom))]'
} as const;

export function getMobileNavButtonClass(active: boolean): string {
  return cn(
    'min-h-[44px] rounded-md flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
    active ? 'text-foreground bg-muted/60' : 'text-muted-foreground'
  );
}

export function getFocusRailButtonClass(active: boolean, isLast: boolean): string {
  return cn(
    'flex items-center justify-center min-h-[44px] w-11 sm:w-12 px-1 py-2 text-[10px] uppercase tracking-wider transition-colors',
    active ? 'bg-foreground text-background' : 'bg-background text-muted-foreground',
    !isLast && 'border-b border-border'
  );
}
