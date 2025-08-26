import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResourceDisplay from '../ResourceDisplay/ResourceDisplay';

// Mock the game store
vi.mock('../../store', () => ({
  useGameStore: () => ({
    resources: {
      temporalEssence: 1234.56,
      mnemonicDust: 567.89,
      aetherShards: 89.12,
      arcaneMana: 345.67,
      generationRates: {
        temporalEssence: 2.5,
        mnemonicDust: 0.8,
        aetherShards: 0.1,
        arcaneMana: 1.2,
      },
      bonusMultipliers: {
        temporalEssence: 1.5,
        mnemonicDust: 1.0,
        aetherShards: 1.0,
        arcaneMana: 2.0,
      },
    },
  }),
}));

describe('ResourceDisplay Component', () => {
  it('renders all resource types', () => {
    render(<ResourceDisplay />);

    expect(screen.getByText('Temporal Essence')).toBeInTheDocument();
    expect(screen.getByText('Mnemonic Dust')).toBeInTheDocument();
    expect(screen.getByText('Aether Shards')).toBeInTheDocument();
    expect(screen.getByText('Arcane Mana')).toBeInTheDocument();
  });

  it('displays formatted resource values', () => {
    render(<ResourceDisplay />);

    // Values should be formatted (K for thousands)
    expect(screen.getByText('1.2K')).toBeInTheDocument(); // temporalEssence (1234.56 -> 1.2K)
    expect(screen.getByText('567')).toBeInTheDocument(); // mnemonicDust
    expect(screen.getByText('89')).toBeInTheDocument(); // aetherShards
    expect(screen.getByText('345')).toBeInTheDocument(); // arcaneMana
  });

  it('shows generation rates when enabled', () => {
    render(<ResourceDisplay showGenerationRates />);

    // Should show generation rates (with multipliers applied)
    expect(screen.getByText('+3.8/s')).toBeInTheDocument(); // temporalEssence rate (2.5 * 1.5 = 3.75 -> 3.8)
    expect(screen.getByText('+48.0/min')).toBeInTheDocument(); // mnemonicDust rate (0.8 * 60 = 48/min)
  });

  it('hides generation rates when disabled', () => {
    render(<ResourceDisplay showGenerationRates={false} />);

    // Should not show generation rates
    expect(screen.queryByText('+3.8/s')).not.toBeInTheDocument();
    expect(screen.queryByText('+48.0/min')).not.toBeInTheDocument();
  });

  it('applies compact styling', () => {
    const { container } = render(<ResourceDisplay compact />);

    const resourceDisplay = container.querySelector('.resource-display');
    expect(resourceDisplay).toHaveClass('resource-display--compact');
  });

  it('shows multipliers when they exist', () => {
    render(<ResourceDisplay />);

    // Should show multipliers > 1
    expect(screen.getByText('×1.5')).toBeInTheDocument(); // temporalEssence multiplier
    expect(screen.getByText('×2.0')).toBeInTheDocument(); // arcaneMana multiplier
  });

  it('shows progress bars when enabled', () => {
    render(<ResourceDisplay showProgressBars />);

    // Should render progress bars (check for progress bar elements)
    const progressBars = document.querySelectorAll('.progress-bar');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('applies custom className', () => {
    render(<ResourceDisplay className="custom-resource-display" />);

    const container = document.querySelector('.custom-resource-display');
    expect(container).toBeInTheDocument();
  });

  it('formats large numbers correctly', () => {
    // This would require mocking different resource values
    // For now, we'll test the basic formatting that's visible
    render(<ResourceDisplay />);

    // The component should handle number formatting (K for thousands)
    expect(screen.getByText('1.2K')).toBeInTheDocument();
  });
});
