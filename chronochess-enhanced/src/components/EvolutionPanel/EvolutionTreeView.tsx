import React, { useState, useMemo } from 'react';
import { useToast } from '../common/ToastProvider';
import { useGameStore } from '../../store';
import { Button } from '../common';
import type { EvolutionTreeNode, PieceEvolutionTree } from '../../evolution/EvolutionTreeSystem';
import type { PieceType } from '../../engine/types';
import './EvolutionTreeView.css';

interface EvolutionTreeViewProps {
  pieceType: PieceType;
  tree: PieceEvolutionTree;
  className?: string;
}

// Helper functions for formatting
const formatEffectDescription = (effect: any): string => {
  const { type, target, operation, value } = effect;

  // User-friendly effect descriptions
  const effectDescriptions: Record<
    string,
    (target: string, operation: string, value: any) => string
  > = {
    attribute: (target, op, val) => {
      const attributeNames: Record<string, string> = {
        dashChance: 'Knight Dash Chance',
        dashCooldown: 'Knight Dash Cooldown',
        entrenchThreshold: 'Turns to Entrench',
        entrenchPower: 'Entrenchment Defense',
        consecrationTurns: 'Turns to Consecrate',
        snipeRange: 'Bishop Range',
        dominanceAuraRange: 'Queen Dominance Range',
        manaRegenBonus: 'Mana Regeneration',
        marchSpeed: 'Pawn Movement Speed',
        resilience: 'Pawn Toughness',
        royalDecreeUses: 'King Special Uses',
        lastStandThreshold: 'King Last Stand Health',
      };

      const friendlyName = attributeNames[target] || target;

      if (op === 'add') {
        return val > 0 ? `+${val} ${friendlyName}` : `${val} ${friendlyName}`;
      } else if (op === 'multiply') {
        return `×${val} ${friendlyName}`;
      } else if (op === 'set') {
        return `Sets ${friendlyName} to ${val}`;
      }
      return `${friendlyName} ${op} ${val}`;
    },
    ability: target => {
      const abilityNames: Record<string, string> = {
        phase_through: 'Phase Through Enemies',
        backstab: 'Backstab Damage',
        berserker_rage: 'Berserker Mode',
        protective_aura: 'Protect Allies',
        immobilize_resist: 'Resist Movement Lock',
        zone_control: 'Control Territory',
      };

      const friendlyName = abilityNames[target] || target;
      return `Unlocks: ${friendlyName}`;
    },
    passive: target => {
      return `Passive: ${target} enhanced`;
    },
    visual: target => {
      return `Visual: Enhanced ${target} effects`;
    },
  };

  const formatter = effectDescriptions[type];
  return formatter
    ? formatter(target, operation, value)
    : `${type}: ${target} ${operation} ${value}`;
};

interface TreeNodeProps {
  node: EvolutionTreeNode;
  isAvailable: boolean;
  isUnlocked: boolean;
  canAfford: boolean;
  onSelect: (node: EvolutionTreeNode) => void;
  onUnlock: (node: EvolutionTreeNode) => void;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  isAvailable,
  isUnlocked,
  canAfford,
  onSelect,
  onUnlock,
  isSelected,
  isExpanded,
  onToggleExpand,
}) => {
  const getRarityColor = (rarity: string): string => {
    const colors: Record<string, string> = {
      common: '#9ca3af',
      uncommon: '#10b981',
      rare: '#3b82f6',
      epic: '#8b5cf6',
      legendary: '#f59e0b',
    };
    return colors[rarity] || '#9ca3af';
  };

  const getThemeColor = (theme: string): string => {
    const colors: Record<string, string> = {
      offensive: '#ef4444',
      defensive: '#3b82f6',
      utility: '#f59e0b',
      hybrid: '#8b5cf6',
    };
    return colors[theme] || '#6b7280';
  };

  const formatCost = (cost: any): string => {
    return Object.entries(cost)
      .filter(([_, amount]) => amount && (amount as number) > 0)
      .map(([resource, amount]) => {
        const resourceMap: Record<string, string> = {
          temporalEssence: 'TE',
          mnemonicDust: 'MD',
          arcaneMana: 'AM',
          aetherShards: 'AS',
        };
        return `${amount} ${resourceMap[resource] || resource}`;
      })
      .join(', ');
  };

  const nodeStatus = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';
  const rarityColor = getRarityColor(node.rarity);
  const themeColor = getThemeColor(node.theme);

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
    onSelect(node);
  };

  const handleUnlockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUnlock(node);
  };

  if (!isExpanded) {
    // Compact node view
    return (
      <div
        className={`tree-node tree-node--compact tree-node--${nodeStatus} tree-node--${node.theme}`}
        style={
          {
            left: `${node.position.x}px`,
            top: `${node.position.y}px`,
            '--rarity-color': rarityColor,
            '--theme-color': themeColor,
          } as React.CSSProperties
        }
        onClick={handleNodeClick}
        title={node.name}
      >
        <div className="tree-node__compact-content">
          <div className="tree-node__tier-badge">T{node.tier}</div>
          <div
            className={`tree-node__rarity-indicator tree-node__rarity-indicator--${node.rarity}`}
            style={{ backgroundColor: rarityColor }}
          />
          <div className="tree-node__status-icon">
            {isUnlocked && <span className="tree-node__unlocked-icon">✓</span>}
            {!isUnlocked && isAvailable && <span className="tree-node__available-icon">◦</span>}
            {!isUnlocked && !isAvailable && <span className="tree-node__locked-icon">⚿</span>}
          </div>
        </div>
        <div className="tree-node__compact-pulse" />
      </div>
    );
  }

  // Expanded node view
  return (
    <div
      className={`tree-node tree-node--expanded tree-node--${nodeStatus} tree-node--${node.theme} ${isSelected ? 'tree-node--selected' : ''}`}
      style={
        {
          left: `${node.position.x - 120}px`, // Center the expanded view
          top: `${node.position.y - 40}px`,
          '--rarity-color': rarityColor,
          '--theme-color': themeColor,
        } as React.CSSProperties
      }
      onClick={e => e.stopPropagation()}
    >
      <div className="tree-node__expanded-header">
        <div className="tree-node__expanded-title">
          <h4 className="tree-node__name">{node.name}</h4>
          <button
            className="tree-node__close-btn"
            onClick={handleNodeClick}
            aria-label="Collapse node"
          >
            ×
          </button>
        </div>
        <div className="tree-node__expanded-meta">
          <span className={`tree-node__rarity-badge tree-node__rarity-badge--${node.rarity}`}>
            {node.rarity.charAt(0).toUpperCase() + node.rarity.slice(1)}
          </span>
          <span className="tree-node__tier-badge">Tier {node.tier}</span>
        </div>
      </div>

      <div className="tree-node__expanded-content">
        <p className="tree-node__description">{node.description}</p>

        <div className="tree-node__cost-section">
          <strong>Cost:</strong> <span className="tree-node__cost">{formatCost(node.cost)}</span>
        </div>

        <div className="tree-node__effects-section">
          <strong>Effects:</strong>
          <div className="tree-node__effects-list">
            {node.effects.map((effect, index) => (
              <div key={index} className="tree-node__effect-item">
                <span className="tree-node__effect-bullet">•</span>
                <span className="tree-node__effect-text">{formatEffectDescription(effect)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tree-node__expanded-footer">
        {isUnlocked && (
          <div className="tree-node__status tree-node__status--unlocked">✓ UNLOCKED</div>
        )}
        {!isUnlocked && isAvailable && (
          <Button
            size="small"
            variant={canAfford ? 'primary' : 'secondary'}
            disabled={!canAfford}
            onClick={() => handleUnlockClick({ stopPropagation: () => {} } as React.MouseEvent)}
            className="tree-node__unlock-btn"
          >
            {canAfford ? 'UNLOCK' : 'INSUFFICIENT RESOURCES'}
          </Button>
        )}
        {!isUnlocked && !isAvailable && (
          <div className="tree-node__status tree-node__status--locked">🔒 REQUIREMENTS NOT MET</div>
        )}
      </div>

      <div className="tree-node__expanded-glow" />
    </div>
  );
};

interface ConnectionLineProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  isActive: boolean;
}

const ConnectionLine: React.FC<ConnectionLineProps> = ({ from, to, isActive }) => {
  const nodeWidth = 180;
  const nodeHeight = 120;

  // Calculate connection points (center bottom to center top)
  const startX = from.x + nodeWidth / 2;
  const startY = from.y + nodeHeight;
  const endX = to.x + nodeWidth / 2;
  const endY = to.y;

  // Create path with curve
  const midY = (startY + endY) / 2;
  const path = `M ${startX} ${startY} Q ${startX} ${midY} ${endX} ${endY}`;

  return (
    <path
      d={path}
      className={`evolution-tree-connection ${isActive ? 'evolution-tree-connection--active' : 'evolution-tree-connection--inactive'}`}
      fill="none"
      strokeWidth="2"
      markerEnd="url(#arrowhead)"
    />
  );
};

const EvolutionTreeView: React.FC<EvolutionTreeViewProps> = ({ tree, className = '' }) => {
  const { resources, soloModeStats, unlockEvolution, isEvolutionUnlocked } = useGameStore();
  const [selectedNode, setSelectedNode] = useState<EvolutionTreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
        // If we're collapsing the selected node, clear selection
        if (selectedNode?.id === nodeId) {
          setSelectedNode(null);
        }
      } else {
        // Close other expanded nodes for cleaner view
        newSet.clear();
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleSelectNode = (node: EvolutionTreeNode) => {
    setSelectedNode(node);
  };

  // Close expanded nodes when clicking outside
  const handleContainerClick = () => {
    setExpandedNodes(new Set());
    setSelectedNode(null);
  };

  const formatEffectDescription = (effect: any): string => {
    const { type, target, operation, value } = effect;

    // User-friendly effect descriptions
    const effectDescriptions: Record<
      string,
      (target: string, operation: string, value: any) => string
    > = {
      attribute: (target, op, val) => {
        const attributeNames: Record<string, string> = {
          dashChance: 'Knight Dash Chance',
          dashCooldown: 'Knight Dash Cooldown',
          entrenchThreshold: 'Turns to Entrench',
          entrenchPower: 'Entrenchment Defense',
          consecrationTurns: 'Turns to Consecrate',
          snipeRange: 'Bishop Range',
          dominanceAuraRange: 'Queen Dominance Range',
          manaRegenBonus: 'Mana Regeneration',
          marchSpeed: 'Pawn Movement Speed',
          resilience: 'Pawn Toughness',
          royalDecreeUses: 'King Special Uses',
          lastStandThreshold: 'King Last Stand Health',
        };

        const friendlyName = attributeNames[target] || target;

        if (op === 'add') {
          return val > 0 ? `+${val} ${friendlyName}` : `${val} ${friendlyName}`;
        } else if (op === 'multiply') {
          return `×${val} ${friendlyName}`;
        } else if (op === 'set') {
          return `Sets ${friendlyName} to ${val}`;
        }
        return `${friendlyName} ${op} ${val}`;
      },
      ability: target => {
        const abilityNames: Record<string, string> = {
          phase_through: 'Phase Through Enemies',
          backstab: 'Backstab Damage',
          berserker_rage: 'Berserker Mode',
          protective_aura: 'Protect Allies',
          immobilize_resist: 'Resist Movement Lock',
          zone_control: 'Control Territory',
        };

        const friendlyName = abilityNames[target] || target;
        return `Unlocks: ${friendlyName}`;
      },
      passive: target => {
        return `Passive: ${target} enhanced`;
      },
      visual: target => {
        return `Visual: Enhanced ${target} effects`;
      },
    };

    const formatter = effectDescriptions[type];
    return formatter
      ? formatter(target, operation, value)
      : `${type}: ${target} ${operation} ${value}`;
  };

  const getGameplayImpactDescription = (effects: any[]): string => {
    const impacts: string[] = [];

    effects.forEach(effect => {
      const { type, target, value } = effect;

      if (type === 'attribute') {
        switch (target) {
          case 'dashChance':
            impacts.push(`🏃 ${(value * 100).toFixed(0)}% more knight dash opportunities per game`);
            break;
          case 'dashCooldown':
            impacts.push(`⚡ Knights can dash ${Math.abs(value)} turn(s) sooner`);
            break;
          case 'entrenchThreshold':
            impacts.push(`🛡️ Rooks entrench ${Math.abs(value)} turn(s) faster`);
            break;
          case 'entrenchPower':
            impacts.push(`💪 +${value * 25} AI evaluation bonus when entrenched`);
            break;
          case 'consecrationTurns':
            impacts.push(`✨ Bishops consecrate ${Math.abs(value)} turn(s) faster`);
            break;
          case 'dominanceAuraRange':
            impacts.push(`👑 Queen dominance affects ${value} more square(s)`);
            break;
          case 'snipeRange':
            impacts.push(`🎯 Bishops have +${value} enhanced targeting range`);
            break;
        }
      } else if (type === 'ability') {
        impacts.push(`🆕 Unlocks new ability: ${target}`);
      }
    });

    return impacts.join('\n');
  };

  // Use the real evolution tree system from the store
  // Include unlockedEvolutions in dependencies to trigger re-renders when evolutions are unlocked
  const unlockedEvolutions = useGameStore(state => state.unlockedEvolutions);

  const evolutionTreeSystemInstance = useMemo(() => {
    return {
      isEvolutionAvailable: (evolutionId: string) => {
        const node = tree.nodes.get(evolutionId);
        if (!node) return false;

        return node.requirements.every(req => {
          switch (req.type) {
            case 'evolution':
              // Check if parent evolution is unlocked
              return isEvolutionUnlocked(req.target);
            case 'encounters':
              const encounterValue = soloModeStats[req.target as keyof typeof soloModeStats] || 0;
              return encounterValue >= req.value;
            case 'resource':
              const resourceValue =
                (resources[req.target as keyof typeof resources] as number) || 0;
              return resourceValue >= req.value;
            default:
              return true;
          }
        });
      },
      getUnlockedEvolutions: () => {
        const unlockedSet = new Set<string>();
        tree.nodes.forEach(node => {
          if (isEvolutionUnlocked(node.id)) {
            unlockedSet.add(node.id);
          }
        });
        return unlockedSet;
      },
    };
  }, [tree, soloModeStats, resources, isEvolutionUnlocked, unlockedEvolutions]);

  const canAffordEvolution = (node: EvolutionTreeNode): boolean => {
    return Object.entries(node.cost).every(([resource, cost]) => {
      const available = resources[resource as keyof typeof resources] as number;
      return available >= (cost as number);
    });
  };

  const handleUnlockEvolution = (node: EvolutionTreeNode) => {
    const { showToast } = useToast();

    if (!canAffordEvolution(node)) {
      showToast(
        `Insufficient resources! Need: ${Object.entries(node.cost)
          .map(([res, cost]) => `${cost} ${res}`)
          .join(', ')}`,
        { level: 'error' }
      );
      return;
    }

    // Use the real evolution system from the store
    const success = unlockEvolution(node.id);

    if (success) {
      // UI-level toast suppressed: store will emit a concise aggregated toast for abilities/effects
      setSelectedNode(null);
    } else {
      showToast('❌ Failed to unlock evolution. Please check your resources and try again.', {
        level: 'error',
      });
    }
  };

  // Calculate connections between nodes
  const connections = useMemo(() => {
    const result: Array<{ from: EvolutionTreeNode; to: EvolutionTreeNode; isActive: boolean }> = [];

    tree.nodes.forEach(node => {
      if (node.parentId) {
        const parent = tree.nodes.get(node.parentId);
        if (parent) {
          const isActive = evolutionTreeSystemInstance.getUnlockedEvolutions().has(parent.id);
          result.push({ from: parent, to: node, isActive });
        }
      }
    });

    return result;
  }, [tree, evolutionTreeSystemInstance]);

  // Calculate tree bounds for container sizing
  const treeBounds = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    tree.nodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + 180); // Node width
      maxY = Math.max(maxY, node.position.y + 120); // Node height
    });

    return {
      width: maxX - minX + 40, // Padding
      height: maxY - minY + 40,
      offsetX: -minX + 20,
      offsetY: -minY + 20,
    };
  }, [tree]);

  return (
    <div className={`evolution-tree-view ${className}`}>
      <div className="evolution-tree-view__header">
        <div className="evolution-tree-view__header-top">
          <h3>{tree.name}</h3>
          <div className="evolution-tree-view__stats">
            <span>Tier {tree.maxTier} Available</span>
            <span>{tree.nodes.size} Evolutions</span>
          </div>
        </div>
        <div className="evolution-tree-view__help">
          <details>
            <summary>ℹ️ How Evolution Tree Works</summary>
            <div className="evolution-tree-view__help-content">
              <p>
                <strong>🎯 Real Gameplay Effects:</strong>
              </p>
              <ul>
                <li>
                  ⚡ <strong>Knight Dash:</strong> Extra moves per turn (stacks with chance)
                </li>
                <li>
                  🛡️ <strong>Rook Entrench:</strong> Defensive bonuses and faster activation
                </li>
                <li>
                  ✨ <strong>Bishop Consecrate:</strong> Buff nearby allies faster
                </li>
                <li>
                  👑 <strong>Queen Dominance:</strong> Larger debuff areas
                </li>
              </ul>
              <p>
                <strong>📊 AI Evaluation Impact:</strong>
              </p>
              <ul>
                <li>Entrenched rooks: +25 evaluation per power level</li>
                <li>Consecrated bishops: +15 source, +10 per ally</li>
                <li>Dominated enemies: -40 evaluation penalty each</li>
              </ul>
              <p>
                <strong>🎮 Works in ALL game modes!</strong>
              </p>
            </div>
          </details>
        </div>
      </div>

      <div
        className="evolution-tree-view__container"
        style={{
          width: `${treeBounds.width}px`,
          height: `${treeBounds.height}px`,
        }}
        onClick={handleContainerClick}
      >
        {/* SVG for connection lines */}
        <svg
          className="evolution-tree-view__connections"
          style={{
            width: `${treeBounds.width}px`,
            height: `${treeBounds.height}px`,
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent-primary)" />
            </marker>
          </defs>

          {connections.map((connection, index) => (
            <ConnectionLine
              key={index}
              from={{
                x: connection.from.position.x + treeBounds.offsetX,
                y: connection.from.position.y + treeBounds.offsetY,
              }}
              to={{
                x: connection.to.position.x + treeBounds.offsetX,
                y: connection.to.position.y + treeBounds.offsetY,
              }}
              isActive={connection.isActive}
            />
          ))}
        </svg>

        {/* Evolution nodes */}
        <div
          className="evolution-tree-view__nodes"
          style={{
            transform: `translate(${treeBounds.offsetX}px, ${treeBounds.offsetY}px)`,
          }}
        >
          {Array.from(tree.nodes.values()).map(node => {
            const isUnlocked = evolutionTreeSystemInstance.getUnlockedEvolutions().has(node.id);
            const isAvailable = evolutionTreeSystemInstance.isEvolutionAvailable(node.id);
            const canAfford = canAffordEvolution(node);

            return (
              <TreeNode
                key={node.id}
                node={node}
                isUnlocked={isUnlocked}
                isAvailable={isAvailable}
                canAfford={canAfford}
                onSelect={handleSelectNode}
                onUnlock={handleUnlockEvolution}
                isSelected={selectedNode?.id === node.id}
                isExpanded={expandedNodes.has(node.id)}
                onToggleExpand={handleToggleExpand}
              />
            );
          })}
        </div>
      </div>

      {/* Selected node details */}
      {selectedNode && (
        <div className="evolution-tree-view__details">
          <div className="evolution-tree-view__details-header">
            <h4>{selectedNode.name}</h4>
            <Button size="small" variant="secondary" onClick={() => setSelectedNode(null)}>
              ✕
            </Button>
          </div>

          <div className="evolution-tree-view__details-content">
            <p>
              <strong>Description:</strong> {selectedNode.description}
            </p>

            <div className="evolution-tree-view__details-info">
              <span>
                <strong>Tier:</strong> {selectedNode.tier}
              </span>
              <span>
                <strong>Rarity:</strong> {selectedNode.rarity}
              </span>
              <span>
                <strong>Theme:</strong> {selectedNode.theme}
              </span>
            </div>

            <div className="evolution-tree-view__details-cost">
              <strong>Cost:</strong>
              {Object.entries(selectedNode.cost).map(([resource, cost]) => (
                <span key={resource} className="evolution-tree-view__cost-item">
                  {cost} {resource}
                </span>
              ))}
            </div>

            <div className="evolution-tree-view__details-effects">
              <strong>Gameplay Effects:</strong>
              <div className="evolution-tree-view__effects-list">
                {selectedNode.effects.map((effect, index) => (
                  <div key={index} className="evolution-tree-view__effect-detail">
                    <span className="evolution-tree-view__effect-icon">
                      {effect.type === 'attribute' ? '📈' : effect.type === 'ability' ? '🆕' : '✨'}
                    </span>
                    <span className="evolution-tree-view__effect-text">
                      {formatEffectDescription(effect)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="evolution-tree-view__gameplay-impact">
                <strong>Battlefield Impact:</strong>
                <div className="evolution-tree-view__impact-text">
                  {getGameplayImpactDescription(selectedNode.effects)}
                </div>
              </div>
            </div>

            {selectedNode.requirements.length > 0 && (
              <div className="evolution-tree-view__details-requirements">
                <strong>Requirements:</strong>
                {selectedNode.requirements.map((req, index) => (
                  <div key={index} className="evolution-tree-view__requirement">
                    {req.type}: {req.target} {req.operator} {req.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EvolutionTreeView;

// Also export as named export for flexibility
export { EvolutionTreeView };
