import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_CLASSES,
  FORM_CONTROL_TEXT_CLASS,
  getFocusRailButtonClass,
  getMobileNavButtonClass
} from './layout-shell-helpers';

describe('layout shell helpers', () => {
  it('keeps header title on one line without truncation', () => {
    expect(APP_SHELL_CLASSES.brandTitle).not.toContain('truncate');
    expect(APP_SHELL_CLASSES.brandTitle).toContain('whitespace-nowrap');
  });

  it('enforces 44px minimum touch target for mobile nav buttons', () => {
    const activeClasses = getMobileNavButtonClass(true);
    const inactiveClasses = getMobileNavButtonClass(false);

    expect(activeClasses).toContain('min-h-[44px]');
    expect(inactiveClasses).toContain('min-h-[44px]');
  });

  it('uses a segmented focus rail button with 44px minimum touch target', () => {
    const classes = getFocusRailButtonClass(true, false);

    expect(classes).toContain('min-h-[44px]');
    expect(classes).toContain('w-11');
    expect(classes).toContain('border-b');
  });

  it('uses 16px text for form controls to avoid mobile auto zoom', () => {
    expect(FORM_CONTROL_TEXT_CLASS).toBe('text-base');
  });
});
