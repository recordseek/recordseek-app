import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Announcement } from './Announcement';

describe('Announcement', () => {
  beforeEach(() => localStorage.clear());

  it('shows the Chrome news and stays dismissed once closed', async () => {
    const { unmount } = render(<Announcement />);
    expect(screen.getByRole('status')).toHaveTextContent('RecordSeek is back on Chrome, Edge, Firefox and more!');
    expect(screen.getByRole('status')).toHaveTextContent('Safari and mobile apps are coming soon');
    expect(screen.getByRole('link', { name: 'See our new website' })).toHaveAttribute('href', 'https://recordseek.com/');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    render(<Announcement />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
