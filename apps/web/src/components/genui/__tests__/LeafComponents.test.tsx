/**
 * Tests for GenUI leaf (content) components:
 * TextBlock, Stat, BadgeGroup, Divider
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextBlock } from '../TextBlock';
import { Stat } from '../Stat';
import { BadgeGroup } from '../BadgeGroup';
import { Divider } from '../Divider';

// ------------------------------------------------------------------
// TextBlock
// ------------------------------------------------------------------

describe('TextBlock', () => {
  it('renders text content', () => {
    render(<TextBlock type="text" content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('applies heading style class', () => {
    const { container } = render(<TextBlock type="text" content="Title" style="heading" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('font-semibold');
  });

  it('applies caption style class', () => {
    const { container } = render(<TextBlock type="text" content="Note" style="caption" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-ink-3');
  });

  it('defaults to body style', () => {
    const { container } = render(<TextBlock type="text" content="Body text" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-ink-2');
  });
});

// ------------------------------------------------------------------
// Stat
// ------------------------------------------------------------------

describe('Stat', () => {
  it('renders value and label', () => {
    render(<Stat type="stat" value="42" label="Albums" />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Albums')).toBeInTheDocument();
  });

  it('renders with large value styling', () => {
    const { container } = render(<Stat type="stat" value="100" label="Tracks" />);
    const value = container.querySelector('.text-2xl');
    expect(value).toBeInTheDocument();
    expect(value?.textContent).toBe('100');
  });
});

// ------------------------------------------------------------------
// BadgeGroup
// ------------------------------------------------------------------

describe('BadgeGroup', () => {
  it('renders all badges', () => {
    render(
      <BadgeGroup
        type="badge-group"
        badges={[
          { label: 'Jazz' },
          { label: 'Bebop' },
          { label: 'Fusion' },
        ]}
      />
    );
    expect(screen.getByText('Jazz')).toBeInTheDocument();
    expect(screen.getByText('Bebop')).toBeInTheDocument();
    expect(screen.getByText('Fusion')).toBeInTheDocument();
  });

  it('applies custom color via inline style', () => {
    const { container } = render(
      <BadgeGroup
        type="badge-group"
        badges={[{ label: 'Rock', color: '#ff0000' }]}
      />
    );
    const badge = container.querySelector('span');
    expect(badge).toHaveStyle({ color: '#ff0000' });
  });

  it('applies default color classes when no custom color', () => {
    const { container } = render(
      <BadgeGroup
        type="badge-group"
        badges={[{ label: 'Pop' }]}
      />
    );
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-chip');
  });

  it('renders empty when no badges', () => {
    const { container } = render(
      <BadgeGroup type="badge-group" badges={[]} />
    );
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// Divider
// ------------------------------------------------------------------

describe('Divider', () => {
  it('renders a horizontal line', () => {
    const { container } = render(<Divider />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('hairline-t');
  });
});

