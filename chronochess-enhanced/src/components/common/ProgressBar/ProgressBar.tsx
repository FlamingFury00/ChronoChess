import React from 'react';
import './ProgressBar.css';

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showValue?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'resource';
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
  className?: string;
  formatValue?: (value: number, max: number) => string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  label,
  showValue = true,
  variant = 'default',
  size = 'medium',
  animated = true,
  className = '',
  formatValue,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const formatDisplayValue = () => {
    if (formatValue) {
      return formatValue(value, max);
    }
    return `${Math.floor(value)} / ${Math.floor(max)}`;
  };
  const displayValue = formatDisplayValue();

  const progressClass = [
    'progress-bar',
    `progress-bar--${variant}`,
    `progress-bar--${size}`,
    animated && 'progress-bar--animated',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={progressClass}>
      {(label || showValue) && (
        <div className="progress-bar__header">
          {label && <span className="progress-bar__label">{label}</span>}
          {showValue && (
            <span className="progress-bar__value" title={displayValue}>
              {displayValue}
            </span>
          )}
        </div>
      )}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label || 'Progress'}
          aria-valuetext={displayValue}
        >
          {animated && <div className="progress-bar__shine" />}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
export { ProgressBar };
