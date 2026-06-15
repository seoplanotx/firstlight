import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileForm } from './ProfileForm';

describe('ProfileForm', () => {
  it('offers curated cancer-type suggestions via a datalist without restricting input', () => {
    const { container } = render(<ProfileForm onSave={vi.fn()} />);
    const datalist = container.querySelector('#cancer-type-options');
    expect(datalist).not.toBeNull();
    expect((datalist?.querySelectorAll('option').length ?? 0)).toBeGreaterThan(5);
    expect(screen.getByLabelText('Cancer type')).toHaveAttribute('list', 'cancer-type-options');
  });

  it('shows an inline error and blocks save when cancer type is blank', async () => {
    const onSave = vi.fn();
    render(<ProfileForm onSave={onSave} />);
    // Fill the required profile name so submission reaches our own validation.
    await userEvent.type(screen.getAllByRole('textbox')[0], 'Mom');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cancer type/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts free-text cancer types that are not in the suggestion list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileForm onSave={onSave} />);
    await userEvent.type(screen.getAllByRole('textbox')[0], 'Dad');
    await userEvent.type(screen.getByLabelText('Cancer type'), 'a very rare custom tumor');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cancer_type).toBe('a very rare custom tumor');
  });

  it('reports its dirty state as the user edits', async () => {
    const onDirtyChange = vi.fn();
    render(<ProfileForm onSave={vi.fn()} onDirtyChange={onDirtyChange} />);
    // Starts clean.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(screen.getByLabelText('Cancer type'), 'breast cancer');
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });
});
