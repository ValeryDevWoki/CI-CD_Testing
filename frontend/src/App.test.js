import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login page title', () => {
  render(<App />);
  expect(screen.getByText(/ברוכים הבאים לירדנה/i)).toBeInTheDocument();
});
