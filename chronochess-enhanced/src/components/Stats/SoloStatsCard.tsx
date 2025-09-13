import React from 'react';

export type SoloStats = {
  encountersWon: number;
  encountersLost: number;
  totalEncounters: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
};

type FieldKey =
  | 'victories'
  | 'totalBattles'
  | 'winRate'
  | 'currentStreak'
  | 'bestStreak'
  | 'losses';

export interface SoloStatsCardProps {
  stats: SoloStats;
  // Which fields to render, in order
  fields?: FieldKey[];
  // Prefix for BEM-style classNames to blend into different scenes (e.g. 'solo-mode-scene', 'profile-scene')
  classNamePrefix?: string; // default: 'solo-mode-scene'
  title?: string; // optional header title
  wrapInCard?: boolean; // when false, renders items inline without card/grid wrapper
  labels?: Partial<Record<FieldKey, string>>; // optional label overrides per field
}

const SoloStatsCard: React.FC<SoloStatsCardProps> = ({
  stats,
  fields = ['victories', 'totalBattles', 'winRate'],
  classNamePrefix = 'solo-mode-scene',
  title,
  wrapInCard = true,
  labels = {},
}) => {
  const winRate =
    stats.totalEncounters > 0 ? Math.round((stats.encountersWon / stats.totalEncounters) * 100) : 0;

  const cn = (suffix: string) => `${classNamePrefix}__${suffix}`;

  const renderField = (key: FieldKey) => {
    const labelFor = (k: FieldKey, fallback: string) => labels[k] ?? fallback;
    switch (key) {
      case 'victories':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{stats.encountersWon}</span>
            <span className={cn('stat-label')}>{labelFor('victories', 'Victories')}</span>
          </div>
        );
      case 'totalBattles':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{stats.totalEncounters}</span>
            <span className={cn('stat-label')}>{labelFor('totalBattles', 'Total Battles')}</span>
          </div>
        );
      case 'winRate':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{winRate}%</span>
            <span className={cn('stat-label')}>{labelFor('winRate', 'Win Rate')}</span>
          </div>
        );
      case 'currentStreak':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{stats.currentWinStreak ?? 0}</span>
            <span className={cn('stat-label')}>{labelFor('currentStreak', 'Current Streak')}</span>
          </div>
        );
      case 'bestStreak':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{stats.bestWinStreak ?? 0}</span>
            <span className={cn('stat-label')}>{labelFor('bestStreak', 'Best Streak')}</span>
          </div>
        );
      case 'losses':
        return (
          <div className={cn('stat-item')} key={key}>
            <span className={cn('stat-value')}>{stats.encountersLost}</span>
            <span className={cn('stat-label')}>{labelFor('losses', 'Losses')}</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (!wrapInCard) {
    return <>{fields.map(renderField)}</>;
  }

  return (
    <div className={cn('stats-card')}>
      {title && <h3>{title}</h3>}
      <div className={cn('stats-grid')}>{fields.map(renderField)}</div>
    </div>
  );
};

export default SoloStatsCard;
