import { describe, it, expect } from 'vitest';
import { buttonVariants } from './button';

describe('buttonVariants', () => {
  it('uses a clearly visible hover state for default buttons', () => {
    const classes = buttonVariants();
    expect(classes).toContain('hover:bg-primary/80');
    expect(classes).toContain('hover:shadow-sm');
  });

  it('uses a stronger hover state for ghost buttons', () => {
    const classes = buttonVariants({ variant: 'ghost' });
    expect(classes).toContain('hover:bg-accent/60');
  });
});
