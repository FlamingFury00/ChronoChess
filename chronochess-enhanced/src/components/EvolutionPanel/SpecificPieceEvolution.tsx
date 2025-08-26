import React from 'react';
import { useGameStore } from '../../store';
import { Button } from '../common';
import { currencyDisplayMap } from '../../store/pieceEvolutionStore';
import type { PieceEvolutionData } from '../../store/pieceEvolutionStore';
import type { PieceType } from '../../engine/types';

import './SpecificPieceEvolution.css';
import './EvolutionPanel.css';

interface SpecificPieceEvolutionProps {
  className?: string;
  selectedPieceType?: PieceType;
}

export const SpecificPieceEvolution: React.FC<SpecificPieceEvolutionProps> = ({
  className = '',
  selectedPieceType = 'p',
}) => {
  const { resources, pieceEvolutions, evolvePieceAttribute, getPieceEvolutionCost } =
    useGameStore();

  const evolvePiece = (pieceType: keyof PieceEvolutionData, attribute: string, value?: any) => {
    evolvePieceAttribute(pieceType, attribute, value);
  };

  const formatValue = (_pieceType: keyof PieceEvolutionData, attribute: string, value: any) => {
    if (attribute.includes('Chance') || attribute.includes('Threshold')) {
      return `${(value * 100).toFixed(0)}%`;
    }
    if (attribute.includes('Bonus')) {
      return value.toFixed(1);
    }
    if (attribute === 'promotionPreference') {
      return value.toUpperCase();
    }
    return value.toString();
  };

  const getCost = (pieceType: keyof PieceEvolutionData, attribute: string) => {
    return getPieceEvolutionCost(pieceType, attribute);
  };

  const getCurrency = (attribute: string) => {
    const currencyMap = {
      marchSpeed: 'temporalEssence',
      resilience: 'mnemonicDust',
      setPromotionPreference: 'mnemonicDust',
      dashChance: 'mnemonicDust',
      dashCooldown: 'temporalEssence',
      snipeRange: 'mnemonicDust',
      consecrationTurns: 'temporalEssence',
      entrenchThreshold: 'temporalEssence',
      entrenchPower: 'mnemonicDust',
      dominanceAuraRange: 'mnemonicDust',
      manaRegenBonus: 'temporalEssence',
      royalDecreeUses: 'mnemonicDust',
      lastStandThreshold: 'temporalEssence',
    } as const;

    const currency = currencyMap[attribute as keyof typeof currencyMap];
    return currencyDisplayMap[currency as keyof typeof currencyDisplayMap] || '';
  };

  const getPieceDisplayName = (pieceType: PieceType): string => {
    const pieceNames = {
      p: 'Pawn',
      r: 'Rook',
      n: 'Knight',
      b: 'Bishop',
      q: 'Queen',
      k: 'King',
    };
    return pieceNames[pieceType] || 'Unknown';
  };

  const getPieceIcon = (pieceType: PieceType): string => {
    const pieceIcons = {
      p: '♟',
      r: '♜',
      n: '♞',
      b: '♝',
      q: '♛',
      k: '♚',
    };
    return pieceIcons[pieceType] || '?';
  };

  const renderPieceEvolution = (pieceType: PieceType) => {
    switch (pieceType) {
      case 'p':
        return (
          <div className="piece-evolution-section">
            <h4>Pawn Evolution</h4>
            <div className="piece-attr">
              March Speed:{' '}
              <span>{formatValue('pawn', 'marchSpeed', pieceEvolutions.pawn.marchSpeed)}</span> (
              {getCost('pawn', 'marchSpeed')} {getCurrency('marchSpeed')})
            </div>
            <Button onClick={() => evolvePiece('pawn', 'marchSpeed')} size="small">
              Upgrade Speed
            </Button>

            <div className="piece-attr">
              Resilience:{' '}
              <span>{formatValue('pawn', 'resilience', pieceEvolutions.pawn.resilience)}</span> (
              {getCost('pawn', 'resilience')} {getCurrency('resilience')})
            </div>
            <Button onClick={() => evolvePiece('pawn', 'resilience')} size="small">
              Upgrade Resilience
            </Button>

            <div className="piece-attr">
              Promo Pref:{' '}
              <span>
                {formatValue(
                  'pawn',
                  'promotionPreference',
                  pieceEvolutions.pawn.promotionPreference
                )}
              </span>{' '}
              ({getCost('pawn', 'setPromotionPreference')} {getCurrency('setPromotionPreference')})
            </div>
            <div className="promotion-buttons">
              <Button
                onClick={() => evolvePiece('pawn', 'setPromotionPreference', 'q')}
                size="small"
                variant={pieceEvolutions.pawn.promotionPreference === 'q' ? 'primary' : 'secondary'}
              >
                Q
              </Button>
              <Button
                onClick={() => evolvePiece('pawn', 'setPromotionPreference', 'n')}
                size="small"
                variant={pieceEvolutions.pawn.promotionPreference === 'n' ? 'primary' : 'secondary'}
              >
                N
              </Button>
              <Button
                onClick={() => evolvePiece('pawn', 'setPromotionPreference', 'r')}
                size="small"
                variant={pieceEvolutions.pawn.promotionPreference === 'r' ? 'primary' : 'secondary'}
              >
                R
              </Button>
              <Button
                onClick={() => evolvePiece('pawn', 'setPromotionPreference', 'b')}
                size="small"
                variant={pieceEvolutions.pawn.promotionPreference === 'b' ? 'primary' : 'secondary'}
              >
                B
              </Button>
            </div>
          </div>
        );

      case 'n':
        return (
          <div className="piece-evolution-section">
            <h4>Knight Evolution</h4>
            <div className="piece-attr">
              Dash Chance:{' '}
              <span>{formatValue('knight', 'dashChance', pieceEvolutions.knight.dashChance)}</span>{' '}
              ({getCost('knight', 'dashChance')} {getCurrency('dashChance')})
            </div>
            <Button onClick={() => evolvePiece('knight', 'dashChance')} size="small">
              Upgrade Dash Chance
            </Button>

            <div className="piece-attr">
              Dash Cooldown: <span>{pieceEvolutions.knight.dashCooldown}t</span> (
              {getCost('knight', 'dashCooldown')} {getCurrency('dashCooldown')})
            </div>
            <Button onClick={() => evolvePiece('knight', 'dashCooldown')} size="small">
              Reduce Dash CD
            </Button>
          </div>
        );

      case 'b':
        return (
          <div className="piece-evolution-section">
            <h4>Bishop Evolution</h4>
            <div className="piece-attr">
              Snipe Range: <span>{pieceEvolutions.bishop.snipeRange}</span> (
              {getCost('bishop', 'snipeRange')} {getCurrency('snipeRange')})
            </div>
            <Button onClick={() => evolvePiece('bishop', 'snipeRange')} size="small">
              Inc. Snipe Range
            </Button>

            <div className="piece-attr">
              Consecration Turns: <span>{pieceEvolutions.bishop.consecrationTurns}t</span> (
              {getCost('bishop', 'consecrationTurns')} {getCurrency('consecrationTurns')})
            </div>
            <Button onClick={() => evolvePiece('bishop', 'consecrationTurns')} size="small">
              Reduce Consec. Turns
            </Button>
          </div>
        );

      case 'r':
        return (
          <div className="piece-evolution-section">
            <h4>Rook Evolution</h4>
            <div className="piece-attr">
              Entrench Thresh: <span>{pieceEvolutions.rook.entrenchThreshold}t</span> (
              {getCost('rook', 'entrenchThreshold')} {getCurrency('entrenchThreshold')})
            </div>
            <Button onClick={() => evolvePiece('rook', 'entrenchThreshold')} size="small">
              Reduce Entrench Thresh.
            </Button>

            <div className="piece-attr">
              Entrench Power: <span>{pieceEvolutions.rook.entrenchPower}</span> (
              {getCost('rook', 'entrenchPower')} {getCurrency('entrenchPower')})
            </div>
            <Button onClick={() => evolvePiece('rook', 'entrenchPower')} size="small">
              Inc. Entrench Power
            </Button>
          </div>
        );

      case 'q':
        return (
          <div className="piece-evolution-section">
            <h4>Queen Evolution</h4>
            <div className="piece-attr">
              Dom Aura Range: <span>{pieceEvolutions.queen.dominanceAuraRange}</span> (
              {getCost('queen', 'dominanceAuraRange')} {getCurrency('dominanceAuraRange')})
            </div>
            <Button onClick={() => evolvePiece('queen', 'dominanceAuraRange')} size="small">
              Inc. Aura Range
            </Button>

            <div className="piece-attr">
              Mana Regen Bonus:{' '}
              <span>
                {formatValue('queen', 'manaRegenBonus', pieceEvolutions.queen.manaRegenBonus)} AM/s
              </span>{' '}
              ({getCost('queen', 'manaRegenBonus')} {getCurrency('manaRegenBonus')})
            </div>
            <Button onClick={() => evolvePiece('queen', 'manaRegenBonus')} size="small">
              Inc. Mana Bonus
            </Button>
          </div>
        );

      case 'k':
        return (
          <div className="piece-evolution-section">
            <h4>King Evolution</h4>
            <div className="piece-attr">
              Royal Decree Uses: <span>{pieceEvolutions.king.royalDecreeUses}</span> (
              {getCost('king', 'royalDecreeUses')} {getCurrency('royalDecreeUses')})
            </div>
            <Button onClick={() => evolvePiece('king', 'royalDecreeUses')} size="small">
              Inc. Decree Uses
            </Button>

            <div className="piece-attr">
              Last Stand Thresh:{' '}
              <span>
                {formatValue('king', 'lastStandThreshold', pieceEvolutions.king.lastStandThreshold)}
              </span>{' '}
              ({getCost('king', 'lastStandThreshold')} {getCurrency('lastStandThreshold')})
            </div>
            <Button onClick={() => evolvePiece('king', 'lastStandThreshold')} size="small">
              Inc. Last Stand Thresh.
            </Button>
          </div>
        );

      default:
        return (
          <div className="piece-evolution-section">
            <h4>No Evolution Available</h4>
            <p>This piece type doesn't have evolution options yet.</p>
          </div>
        );
    }
  };

  return (
    <div className={`specific-piece-evolution ${className}`}>
      <div className="evolution-panel__selected-piece">
        <h2>
          <span className="piece-icon">{getPieceIcon(selectedPieceType)}</span>
          {getPieceDisplayName(selectedPieceType)} Evolution
        </h2>
      </div>

      <div className="evolution-resources">
        <div className="resource-display">
          Temporal Essence (TE): <span>{Math.floor(resources.temporalEssence)}</span>
        </div>
        <div className="resource-display">
          Mnemonic Dust (MD): <span>{Math.floor(resources.mnemonicDust)}</span>
        </div>
        <div className="resource-display">
          Aether Shards (AS): <span>{Math.floor(resources.aetherShards)}</span>
        </div>
        <div className="resource-display">
          Arcane Mana (AM): <span>{resources.arcaneMana.toFixed(1)}</span>
        </div>
      </div>

      <h3>Evolution Options</h3>

      {renderPieceEvolution(selectedPieceType)}

      <hr style={{ borderColor: 'var(--border-color)', margin: '15px 0' }} />

      <div
        className="auto-save-info"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          background: 'rgba(76, 175, 80, 0.1)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          borderRadius: '6px',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
        }}
      >
        ✨ <strong>Auto-Save Active:</strong> Your progress is automatically saved as you play!
      </div>

      <div className="save-load-controls">
        <Button
          onClick={() => {
            // Reset game with confirmation
            if (confirm('Sure? This will delete all progress and cannot be undone.')) {
              const store = useGameStore.getState();
              store.reset();
              // Clear all save data
              localStorage.removeItem('chronochess_save');
              console.log('🔄 Game reset successfully!');
              alert('Game reset successfully!');
              // Reload to reflect changes
              window.location.reload();
            }
          }}
          variant="danger"
        >
          Reset Game
        </Button>
      </div>
    </div>
  );
};

export default SpecificPieceEvolution;
