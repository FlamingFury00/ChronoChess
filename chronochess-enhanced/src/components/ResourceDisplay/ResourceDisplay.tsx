import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store';
import ProgressBar from '../common/ProgressBar/ProgressBar';
import './ResourceDisplay.css';

interface ResourceDisplayProps {
  compact?: boolean;
  showGenerationRates?: boolean;
  showProgressBars?: boolean;
  className?: string;
}

interface ResourceAnimation {
  id: string;
  type: 'gain' | 'spend';
  amount: number;
  resourceType: string;
  timestamp: number;
}

const ResourceDisplay: React.FC<ResourceDisplayProps> = ({
  compact = false,
  showGenerationRates = true,
  showProgressBars = false,
  className = '',
}) => {
  const { resources } = useGameStore();
  const [animations, setAnimations] = useState<ResourceAnimation[]>([]);
  const [previousResources, setPreviousResources] = useState(resources);
  const animationIdRef = useRef(0);

  // Track resource changes and create animations
  useEffect(() => {
    const newAnimations: ResourceAnimation[] = [];

    Object.entries(resources).forEach(([key, value]) => {
      if (
        typeof value === 'number' &&
        typeof previousResources[key as keyof typeof previousResources] === 'number'
      ) {
        const previousValue = previousResources[key as keyof typeof previousResources] as number;
        const difference = value - previousValue;

        if (Math.abs(difference) > 0.01) {
          // Only animate significant changes
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
      setAnimations(prev => [...prev, ...newAnimations]);

      // Remove animations after 2 seconds
      setTimeout(() => {
        setAnimations(prev =>
          prev.filter(anim => !newAnimations.some(newAnim => newAnim.id === anim.id))
        );
      }, 2000);
    }

    setPreviousResources(resources);
  }, [resources, previousResources]);

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

  const resourceDisplayClass = [
    'resource-display',
    compact && 'resource-display--compact',
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
              style={{ '--resource-color': getResourceColor(resourceType) } as React.CSSProperties}
            >
              <div className="resource-display__header">
                <span className="resource-display__icon" aria-hidden="true">
                  {getResourceIcon(resourceType)}
                </span>
                {!compact && (
                  <span className="resource-display__name">{getResourceName(resourceType)}</span>
                )}
              </div>

              <div className="resource-display__value">
                <span className="resource-display__amount">{formatResourceValue(value)}</span>
                {showGenerationRates && effectiveRate > 0 && (
                  <span className="resource-display__rate">
                    {formatGenerationRate(effectiveRate)}
                  </span>
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
            if (multiplier > 1) {
              return (
                <div key={resourceType} className="resource-display__multiplier">
                  <span className="resource-display__multiplier-icon">
                    {getResourceIcon(resourceType)}
                  </span>
                  <span className="resource-display__multiplier-value">
                    ×{multiplier.toFixed(1)}
                  </span>
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
