import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store';
import ProgressBar from '../common/ProgressBar/ProgressBar';
import './ResourceDisplay.css';

interface ResourceDisplayProps {
  compact?: boolean;
  showGenerationRates?: boolean;
  showProgressBars?: boolean;
  className?: string;
  variant?: 'horizontal' | 'vertical' | 'grid' | 'menu';
}

interface ResourceAnimation {
  id: string;
  type: 'gain' | 'spend';
  amount: number;
  resourceType: string;
  timestamp: number;
}

const ResourceDisplay: React.FC<ResourceDisplayProps> = ({
  compact = true,
  showGenerationRates = true,
  showProgressBars = false,
  className = '',
  variant = 'horizontal',
}) => {
  // Subscribe specifically to the `resources` slice so this component
  // reliably rerenders when resources change across the app.
  // Note: some tests/mock setups return an object wrapper (e.g. { resources: {...} })
  // instead of selector behavior; normalize both shapes here for robustness.
  const _resourcesRaw = useGameStore(state => state.resources as any);
  const resources =
    _resourcesRaw && typeof (_resourcesRaw as any).resources !== 'undefined'
      ? (_resourcesRaw as any).resources
      : (_resourcesRaw as any);
  const [animations, setAnimations] = useState<ResourceAnimation[]>([]);
  // Keep a ref to the previous resources snapshot so updates here don't trigger
  // a rerender — using state for this was causing useEffect to re-run repeatedly.
  const previousResourcesRef = useRef(resources);
  // Track timeout IDs so we can clear them if the component unmounts or
  // if the effect re-runs before timeouts fire.
  const animationTimeoutsRef = useRef<number[]>([]);
  const animationIdRef = useRef(0);
  const generationPulseIntervalRef = useRef<number | null>(null);

  // Track resource changes and create animations
  useEffect(() => {
    const newAnimations: ResourceAnimation[] = [];
    const prev = previousResourcesRef.current || {};

    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value === 'number' && typeof prev[key as keyof typeof prev] === 'number') {
        const previousValue = prev[key as keyof typeof prev] as number;
        const difference = value - previousValue;

        // Animate even small generation ticks so numeric generation is visible.
        if (Math.abs(difference) > 0.01) {
          newAnimations.push({
            id: `${key}-${animationIdRef.current++}`,
            type: difference > 0 ? 'gain' : 'spend',
            amount: Math.abs(difference),
            resourceType: key,
            timestamp: Date.now(),
          });
        }
      }
    });

    if (newAnimations.length > 0) {
      setAnimations(prevArr => [...prevArr, ...newAnimations]);

      // Remove animations after 2 seconds
      const timeoutId = window.setTimeout(() => {
        setAnimations(prevArr =>
          prevArr.filter(anim => !newAnimations.some(newAnim => newAnim.id === anim.id))
        );
      }, 2000);

      animationTimeoutsRef.current.push(timeoutId as unknown as number);
    }

    // Update the ref snapshot — store a shallow clone (including nested maps)
    // so we compare stable primitive values instead of potentially shared
    // object references coming from the store. This ensures we detect
    // numeric changes even if the store re-uses object references.
    previousResourcesRef.current = {
      ...resources,
      generationRates: { ...(resources.generationRates || {}) },
      bonusMultipliers: { ...(resources.bonusMultipliers || {}) },
    } as typeof resources;
    // Only depend on `resources` so this runs when resources change.
  }, [resources]);

  // Global cleanup on unmount: clear all animation timeouts.
  useEffect(() => {
    return () => {
      animationTimeoutsRef.current.forEach(id => window.clearTimeout(id));
      animationTimeoutsRef.current = [];
      if (generationPulseIntervalRef.current != null) {
        window.clearInterval(generationPulseIntervalRef.current as number);
        generationPulseIntervalRef.current = null;
      }
    };
  }, []);

  // No generation pulse: numeric generation animations come from diffs above.

  const formatResourceValue = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return Math.floor(value).toString();
  };

  const formatGenerationRate = (rate: number): string => {
    if (rate >= 1) {
      return `+${rate.toFixed(1)}/s`;
    }
    return `+${(rate * 60).toFixed(1)}/min`;
  };

  const getResourceIcon = (resourceType: string): string => {
    const icons: Record<string, string> = {
      temporalEssence: '⏳',
      mnemonicDust: '✨',
      aetherShards: '💎',
      arcaneMana: '🔮',
    };
    return icons[resourceType] || '●';
  };

  const getResourceColor = (resourceType: string): string => {
    const colors: Record<string, string> = {
      temporalEssence: 'var(--accent-primary)',
      mnemonicDust: 'var(--accent-quaternary)',
      aetherShards: 'var(--accent-highlight)',
      arcaneMana: 'var(--accent-tertiary)',
    };
    return colors[resourceType] || 'var(--text-primary)';
  };

  const getResourceName = (resourceType: string): string => {
    const names: Record<string, string> = {
      temporalEssence: 'Temporal Essence',
      mnemonicDust: 'Mnemonic Dust',
      aetherShards: 'Aether Shards',
      arcaneMana: 'Arcane Mana',
    };
    return names[resourceType] || resourceType;
  };

  const getResourceAbbr = (resourceType: string): string => {
    const abbr: Record<string, string> = {
      temporalEssence: 'TE',
      mnemonicDust: 'MD',
      aetherShards: 'AS',
      arcaneMana: 'AM',
    };
    return abbr[resourceType] || resourceType.slice(0, 2).toUpperCase();
  };

  const resourceDisplayClass = [
    'resource-display',
    compact && 'resource-display--compact',
    `resource-display--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const mainResources = ['temporalEssence', 'mnemonicDust', 'aetherShards', 'arcaneMana'];

  return (
    <div className={resourceDisplayClass}>
      <div className="resource-display__container">
        {mainResources.map(resourceType => {
          const value = resources[resourceType as keyof typeof resources] as number;
          const generationRate = resources.generationRates?.[resourceType] || 0;
          const multiplier = resources.bonusMultipliers?.[resourceType] || 1;
          const effectiveRate = generationRate * multiplier;

          return (
            <div
              key={resourceType}
              className="resource-display__item"
              data-resource={resourceType}
              style={{ '--resource-color': getResourceColor(resourceType) } as React.CSSProperties}
              tabIndex={0}
              role="button"
              aria-label={`${getResourceName(resourceType)}: ${formatResourceValue(value)}`}
            >
              <div className="resource-display__header">
                <span className="resource-display__icon" aria-hidden="true">
                  {getResourceIcon(resourceType)}
                </span>
                <span className="resource-display__name">{getResourceName(resourceType)}</span>
                {/* Short abbreviation shown on mobile to save horizontal space */}
                <span className="resource-display__abbr" aria-hidden="true">
                  {getResourceAbbr(resourceType)}
                </span>
              </div>

              <div className="resource-display__value">
                <span
                  className="resource-display__amount"
                  data-value={formatResourceValue(value)}
                  title={`Exact amount: ${value}`}
                >
                  {formatResourceValue(value)}
                </span>
                {showGenerationRates && effectiveRate > 0 && (
                  <span
                    className="resource-display__rate"
                    title={`Generation rate: ${formatGenerationRate(effectiveRate)} per second${multiplier > 1 ? ` (${multiplier}x multiplier)` : ''}`}
                  >
                    {formatGenerationRate(effectiveRate)}
                  </span>
                )}
                {/* Persistent CSS-only pulse indicator for active generation (decoupled from JS updates) */}
                {effectiveRate > 0 && (
                  <span
                    className="resource-display__pulse"
                    aria-hidden="true"
                    title="Actively generating"
                  />
                )}
              </div>

              {showProgressBars && (
                <ProgressBar
                  value={value}
                  max={Math.max(value * 1.5, 100)}
                  variant="resource"
                  size="small"
                  showValue={false}
                  animated={true}
                />
              )}

              {/* Resource change animations */}
              <div className="resource-display__animations">
                {animations
                  .filter(anim => anim.resourceType === resourceType)
                  .map(anim => (
                    <div
                      key={anim.id}
                      className={`resource-display__animation resource-display__animation--${anim.type}`}
                      data-animation-type={anim.type}
                      data-resource={anim.resourceType}
                      role="status"
                      aria-live="polite"
                      aria-label={`${anim.type === 'gain' ? 'Gained' : 'Spent'} ${formatResourceValue(anim.amount)} ${getResourceName(anim.resourceType)}`}
                    >
                      {anim.type === 'gain' ? '+' : '-'}
                      {formatResourceValue(anim.amount)}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Multiplier indicators */}
      {!compact && (
        <div className="resource-display__multipliers">
          {Object.entries(resources.bonusMultipliers || {}).map(([resourceType, multiplier]) => {
            const m = Number(multiplier as any) || 0;
            if (m > 1) {
              return (
                <div
                  key={resourceType}
                  className="resource-display__multiplier"
                  title={`${getResourceName(resourceType)} generation multiplier: ${m.toFixed(1)}x`}
                  tabIndex={0}
                  role="button"
                >
                  <span className="resource-display__multiplier-icon">
                    {getResourceIcon(resourceType)}
                  </span>
                  <span className="resource-display__multiplier-value">×{m.toFixed(1)}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
};

export default ResourceDisplay;
