import React from 'react';
import './Panel.css';

export interface PanelProps {
  children: React.ReactNode;
  title?: string;
  onClose?: () => void;
  className?: string;
  variant?: 'default' | 'glass' | 'solid';
  size?: 'small' | 'medium' | 'large' | 'full';
  position?: 'left' | 'right' | 'center';
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Panel: React.FC<PanelProps> = ({
  children,
  title,
  onClose,
  className = '',
  variant = 'glass',
  size = 'medium',
  position = 'center',
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
}) => {
  const panelClass = [
    'panel',
    `panel--${variant}`,
    `panel--${size}`,
    `panel--${position}`,
    collapsed && 'panel--collapsed',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClass}>
      {title && (
        <div className="panel__header">
          <h3 className="panel__title">{title}</h3>
          <div className="panel__controls">
            {collapsible && (
              <button
                className="panel__control-btn"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <span
                  className={`panel__collapse-icon ${collapsed ? 'panel__collapse-icon--collapsed' : ''}`}
                >
                  ▼
                </span>
              </button>
            )}
            {onClose && (
              <button
                className="panel__control-btn panel__close-btn"
                onClick={onClose}
                aria-label="Close panel"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`panel__content ${collapsed ? 'panel__content--collapsed' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default Panel;
export { Panel };
