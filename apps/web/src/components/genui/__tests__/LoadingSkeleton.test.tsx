/**
 * Tests for GenUI loading skeleton.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GenUILoadingSkeleton } from '../LoadingSkeleton';

describe('GenUILoadingSkeleton', () => {
  it('renders with pulse animation', () => {
    const { container } = render(<GenUILoadingSkeleton />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders a card-like structure with rounded borders', () => {
    const { container } = render(<GenUILoadingSkeleton />);
    expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
  });

  it('renders header, content, and footer skeleton sections', () => {
    const { container } = render(<GenUILoadingSkeleton />);
    // Header gradient skeleton
    expect(container.querySelector('.bg-gradient-to-r')).toBeInTheDocument();
    // Footer border
    expect(container.querySelector('.border-t')).toBeInTheDocument();
  });

  it('renders placeholder album card skeletons', () => {
    const { container } = render(<GenUILoadingSkeleton />);
    // 4 placeholder album card boxes (120x120)
    const boxes = container.querySelectorAll('.rounded-xl');
    expect(boxes.length).toBeGreaterThanOrEqual(4);
  });
});
