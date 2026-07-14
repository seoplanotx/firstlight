import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodayActions } from './TodayActions';

describe('TodayActions', () => {
  it('shows a calm all-caught-up state when nothing needs attention', () => {
    render(<TodayActions needsReviewCount={0} matchingGapCount={0} discussCount={0} />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists a review step with a count and a link to the findings', () => {
    render(<TodayActions needsReviewCount={3} matchingGapCount={0} discussCount={0} />);
    expect(screen.getByText(/review 3 new findings/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /start reviewing/i });
    expect(link).toHaveAttribute('href', '#/findings');
  });

  it('surfaces the doctor-summary step only when findings are saved to discuss', () => {
    const { rerender } = render(<TodayActions needsReviewCount={0} matchingGapCount={0} discussCount={0} />);
    expect(screen.queryByText(/prepare your doctor summary/i)).not.toBeInTheDocument();

    rerender(<TodayActions needsReviewCount={0} matchingGapCount={0} discussCount={2} />);
    expect(screen.getByText(/prepare your doctor summary/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /prepare summary/i })).toHaveAttribute('href', '#/clinician');
  });

  it('uses singular copy for a single item', () => {
    render(<TodayActions needsReviewCount={1} matchingGapCount={1} discussCount={0} />);
    expect(screen.getByText(/review 1 new finding\b/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add details/i })).toHaveAttribute('href', '#/profile');
  });
});
