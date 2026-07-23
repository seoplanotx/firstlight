import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import { api } from '../lib/api';
import type { PatientProfile } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getActiveProfile: vi.fn(),
    getProfiles: vi.fn(),
    updateProfile: vi.fn(),
    createProfile: vi.fn(),
    activateProfile: vi.fn(),
    extractProfileFromText: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

const profile: PatientProfile = {
  id: 1,
  profile_name: 'Mom',
  cancer_type: 'breast cancer',
  would_consider: [],
  would_not_consider: [],
  is_active: true,
  biomarkers: [],
  therapy_history: []
};

function renderInRouter() {
  const router = createMemoryRouter(
    [
      { path: '/profile', element: <ProfilePage /> },
      { path: '/other', element: <div>Other page</div> }
    ],
    { initialEntries: ['/profile'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ProfilePage unsaved-changes guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getActiveProfile.mockResolvedValue(profile);
    mockedApi.getProfiles.mockResolvedValue([profile]);
  });

  it('blocks router navigation with an in-app dialog when edits are pending and the user cancels', async () => {
    const router = renderInRouter();
    await screen.findByDisplayValue('breast cancer');

    await userEvent.type(screen.getByLabelText('Cancer type'), ' (HER2+)');

    await act(async () => {
      await router.navigate('/other');
    });

    // An in-app confirm dialog appears (no native window.confirm) and navigation is held.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Other page')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.queryByText('Other page')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets navigation proceed when the user confirms leaving', async () => {
    const router = renderInRouter();
    await screen.findByDisplayValue('breast cancer');

    await userEvent.type(screen.getByLabelText('Cancer type'), ' (HER2+)');

    await act(async () => {
      await router.navigate('/other');
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /leave without saving/i }));
    await waitFor(() => expect(screen.getByText('Other page')).toBeInTheDocument());
  });

  it('allows navigation when there are no pending edits', async () => {
    const router = renderInRouter();
    await screen.findByDisplayValue('breast cancer');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      await router.navigate('/other');
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Other page')).toBeInTheDocument());
  });
});
