import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameStore } from '../../store';
import { Button } from '../common';
import type { EvolutionTreeNode, PieceEvolutionTree } from '../../evolution/EvolutionTreeSystem';
import type { PieceType } from '../../engine/types';
import './GameEvolutionTree.css';

// Custom Node Component
interface EvolutionNodeData {
  node: EvolutionTreeNode;
  isUnlocked: boolean;
  isAvailable: boolean;
  canAfford: boolean;
  onUnlock: (node: EvolutionTreeNode) => void;
  isExpanded: boolean;
  onToggleExpanded: (nodeId: string) => void;
  isEvolutionUnlocked: (evolutionId: string) => boolean;
  tree: PieceEvolutionTree;
}

const EvolutionNode: React.FC<{ data: EvolutionNodeData }> = ({ data }) => {
  const {
    node,
    isUnlocked,
    isAvailable,
    canAfford,
    onUnlock,
    isExpanded,
    onToggleExpanded,
    isEvolutionUnlocked,
    tree,
  } = data;

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

  const formatEffectDescription = (effect: any): string => {
    const { type, target, operation, value } = effect;

    const effectDescriptions: Record<
      string,
      (target: string, operation: string, value: any) => string
    > = {
      attribute: (target, op, val) => {
        const attributeNames: Record<string, string> = {
          dashChance: 'Dash Chance',
          dashCooldown: 'Dash Cooldown',
          entrenchThreshold: 'Entrench Time',
          entrenchPower: 'Entrench Power',
          consecrationTurns: 'Consecration Time',
          snipeRange: 'Snipe Range',
          dominanceAuraRange: 'Dominance Range',
          manaRegenBonus: 'Mana Regen',
          marchSpeed: 'Movement Speed',
          resilience: 'Resilience',
          royalDecreeUses: 'Decree Uses',
          lastStandThreshold: 'Last Stand HP',
        };

        const friendlyName = attributeNames[target] || target;

        if (op === 'add') {
          return val > 0 ? `+${val} ${friendlyName}` : `${val} ${friendlyName}`;
        } else if (op === 'multiply') {
          return `×${val} ${friendlyName}`;
        } else if (op === 'set') {
          return `${friendlyName} = ${val}`;
        }
        return `${friendlyName} ${op} ${val}`;
      },
      ability: target => `Unlocks: ${target.replace(/_/g, ' ')}`,
      passive: target => `Passive: ${target}`,
      visual: target => `Visual: ${target}`,
    };

    const formatter = effectDescriptions[type];
    return formatter ? formatter(target, operation, value) : `${type}: ${target}`;
  };

  const formatRequirement = (req: any): string => {
    switch (req.type) {
      case 'evolution':
        // Find the evolution name from the tree
        for (const node of tree.nodes.values()) {
          if (node.id === req.target) {
            return `Unlock "${node.name}" first`;
          }
        }
        return `Unlock evolution "${req.target}" first`;
      case 'encounters':
        return `Win ${req.value} encounters`;
      case 'resource':
        const resourceNames: Record<string, string> = {
          temporalEssence: 'Temporal Essence',
          mnemonicDust: 'Mnemonic Dust',
          arcaneMana: 'Arcane Mana',
          aetherShards: 'Aether Shards',
        };
        return `Have ${req.value} ${resourceNames[req.target] || req.target}`;
      case 'level':
        return `Reach level ${req.value}`;
      default:
        return `Requirement: ${req.type} ${req.target} ${req.operator} ${req.value}`;
    }
  };

  const nodeStatus = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';
  const rarityColor = getRarityColor(node.rarity);

  // Determine if this node has unmet evolution requirements
  const hasUnmetEvolutionRequirements =
    !isUnlocked && !isAvailable && node.requirements.some(req => req.type === 'evolution');

  // Get the first unmet evolution requirement for display
  let firstUnmetEvolutionName = '';
  if (hasUnmetEvolutionRequirements) {
    const unmetReq = node.requirements.find(
      req => req.type === 'evolution' && !isEvolutionUnlocked(req.target)
    );
    if (unmetReq) {
      // Find the evolution name from the tree
      for (const treeNode of tree.nodes.values()) {
        if (treeNode.id === unmetReq.target) {
          firstUnmetEvolutionName = treeNode.name;
          break;
        }
      }
    }
  }

  return (
    <div
      className={`evolution-node evolution-node--${nodeStatus} evolution-node--${node.rarity} ${hasUnmetEvolutionRequirements ? 'evolution-node--requires-evolution' : ''}`}
      style={{ '--rarity-color': rarityColor } as React.CSSProperties}
      onClick={() => onToggleExpanded(node.id)}
      title={
        hasUnmetEvolutionRequirements ? `Requires unlocking "${firstUnmetEvolutionName}" first` : ''
      }
    >
      {/* Input Handle (for edges coming into this node) */}
      <Handle type="target" position={Position.Top} id="top" style={{ background: rarityColor }} />

      {/* Node Core */}
      <div className="evolution-node__core">
        <div className="evolution-node__tier">T{node.tier}</div>
        <div className="evolution-node__status-icon">
          {isUnlocked && (
            <span className="evolution-node__icon evolution-node__icon--unlocked">✓</span>
          )}
          {!isUnlocked && isAvailable && (
            <span className="evolution-node__icon evolution-node__icon--available">◦</span>
          )}
          {!isUnlocked && !isAvailable && (
            <span className="evolution-node__icon evolution-node__icon--locked">🔒</span>
          )}
        </div>
        {hasUnmetEvolutionRequirements && firstUnmetEvolutionName && (
          <div
            className="evolution-node__requirement-preview"
            title={`Requires unlocking "${firstUnmetEvolutionName}" first`}
          >
            <span className="evolution-node__requirement-icon">⚠</span>
          </div>
        )}
        <div className="evolution-node__rarity-indicator" />
      </div>

      {/* Output Handle (for edges going out from this node) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ background: rarityColor }}
      />

      {/* Expanded Details */}
      {isExpanded && (
        <div className="evolution-node__details" onClick={e => e.stopPropagation()}>
          <div className="evolution-node__header">
            <h4 className="evolution-node__name">{node.name}</h4>
            <span
              className={`evolution-node__rarity-badge evolution-node__rarity-badge--${node.rarity}`}
            >
              {node.rarity}
            </span>
          </div>

          <p className="evolution-node__description">{node.description}</p>

          <div className="evolution-node__cost">
            <strong>Cost:</strong> {formatCost(node.cost)}
          </div>

          {node.requirements.length > 0 && (
            <div className="evolution-node__requirements">
              <strong>Requirements:</strong>
              {node.requirements.map((req, index) => (
                <div key={index} className="evolution-node__requirement">
                  • {formatRequirement(req)}
                </div>
              ))}
            </div>
          )}

          <div className="evolution-node__effects">
            <strong>Effects:</strong>
            {node.effects.map((effect, index) => (
              <div key={index} className="evolution-node__effect">
                • {formatEffectDescription(effect)}
              </div>
            ))}
          </div>

          <div className="evolution-node__actions">
            {isUnlocked && (
              <div className="evolution-node__status-text evolution-node__status-text--unlocked">
                ✓ UNLOCKED
              </div>
            )}
            {!isUnlocked && isAvailable && (
              <Button
                size="small"
                variant={canAfford ? 'primary' : 'secondary'}
                disabled={!canAfford}
                onClick={() => onUnlock(node)}
                className="evolution-node__unlock-btn"
              >
                {canAfford ? 'UNLOCK' : 'INSUFFICIENT RESOURCES'}
              </Button>
            )}
            {!isUnlocked && !isAvailable && (
              <div className="evolution-node__status-text evolution-node__status-text--locked">
                {hasUnmetEvolutionRequirements
                  ? '🔒 EVOLUTION REQUIRED'
                  : '🔒 REQUIREMENTS NOT MET'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Glow Effects */}
      <div className="evolution-node__glow" />
      {isAvailable && !isUnlocked && <div className="evolution-node__pulse" />}
    </div>
  );
};

// Node types for ReactFlow
const nodeTypes = {
  evolutionNode: EvolutionNode,
};

interface GameEvolutionTreeProps {
  pieceType: PieceType;
  tree: PieceEvolutionTree;
  className?: string;
}

export const GameEvolutionTree: React.FC<GameEvolutionTreeProps> = ({
  pieceType,
  tree,
  className = '',
}) => {
  // Add a key based on pieceType to ensure re-rendering when piece type changes
  const treeKey = `${pieceType}-${tree.pieceType}`;
  const { resources, soloModeStats, unlockEvolution, isEvolutionUnlocked } = useGameStore();
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  // Get unlocked evolutions to trigger re-renders when they change
  const unlockedEvolutions = useGameStore(state => state.unlockedEvolutions);

  const handleToggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodeId(current => (current === nodeId ? null : nodeId));
  }, []);

  const handleUnlockEvolution = useCallback(
    (node: EvolutionTreeNode) => {
      const canAfford = Object.entries(node.cost).every(([resource, cost]) => {
        const available = resources[resource as keyof typeof resources] as number;
        return available >= (cost as number);
      });

      if (!canAfford) {
        alert(
          `Insufficient resources! Need: ${Object.entries(node.cost)
            .map(([res, cost]) => `${cost} ${res}`)
            .join(', ')}`
        );
        return;
      }

      const success = unlockEvolution(node.id);

      if (success) {
        const pieceTypeName =
          {
            p: 'Pawns',
            n: 'Knights',
            b: 'Bishops',
            r: 'Rooks',
            q: 'Queens',
            k: 'Kings',
          }[pieceType] || 'Pieces';

        alert(
          `🎆 EVOLUTION UNLOCKED: ${node.name}\nApplied to: ${pieceTypeName}\n✅ Active in all game modes!`
        );
        // Close the expanded node after successful unlock
        setExpandedNodeId(null);
      } else {
        alert('❌ Failed to unlock evolution. Please check your resources and try again.');
      }
    },
    [resources, unlockEvolution, pieceType]
  );

  // Convert evolution tree to ReactFlow nodes and edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Group nodes by tier for better layout
    const nodesByTier: Map<number, EvolutionTreeNode[]> = new Map();
    Array.from(tree.nodes.values()).forEach(node => {
      if (!nodesByTier.has(node.tier)) {
        nodesByTier.set(node.tier, []);
      }
      nodesByTier.get(node.tier)!.push(node);
    });

    // Create nodes with hierarchical layout
    Array.from(tree.nodes.values()).forEach(node => {
      const isUnlocked = isEvolutionUnlocked(node.id);
      const isAvailable = node.requirements.every(req => {
        switch (req.type) {
          case 'evolution':
            return isEvolutionUnlocked(req.target);
          case 'encounters': {
            const encounterValue = soloModeStats[req.target as keyof typeof soloModeStats] || 0;
            return encounterValue >= req.value;
          }
          case 'resource': {
            const resourceValue = (resources[req.target as keyof typeof resources] as number) || 0;
            return resourceValue >= req.value;
          }
          default:
            return true;
        }
      });

      const canAfford = Object.entries(node.cost).every(([resource, cost]) => {
        const available = resources[resource as keyof typeof resources] as number;
        return available >= (cost as number);
      });

      // Calculate position based on tier and index within tier
      const tierNodes = nodesByTier.get(node.tier) || [];
      const indexInTier = tierNodes.indexOf(node);
      const tierWidth = tierNodes.length * 200;
      const startX = -tierWidth / 2;

      nodes.push({
        id: node.id,
        type: 'evolutionNode',
        position: {
          x: startX + indexInTier * 200 + 100,
          y: (node.tier - 1) * 180 + 50,
        },
        data: {
          node,
          isUnlocked,
          isAvailable,
          canAfford,
          onUnlock: handleUnlockEvolution,
          isExpanded: expandedNodeId === node.id,
          onToggleExpanded: handleToggleExpanded,
          isEvolutionUnlocked,
          tree,
        },
        draggable: false,
      });
    });

    // Create edges
    Array.from(tree.nodes.values()).forEach(node => {
      if (node.parentId) {
        const isActive = isEvolutionUnlocked(node.parentId);
        edges.push({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'smoothstep',
          animated: isActive,
          style: {
            stroke: isActive ? '#3b82f6' : '#6b7280',
            strokeWidth: isActive ? 3 : 2,
            opacity: isActive ? 1 : 0.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isActive ? '#3b82f6' : '#6b7280',
          },
        });
      }
    });

    return { nodes, edges };
  }, [
    tree,
    resources,
    soloModeStats,
    isEvolutionUnlocked,
    expandedNodeId,
    handleUnlockEvolution,
    handleToggleExpanded,
    unlockedEvolutions,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when evolution state changes
  React.useEffect(() => {
    setNodes(nodes =>
      nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          isUnlocked: isEvolutionUnlocked(n.id),
          isAvailable: n.data.node.requirements.every((req: any) => {
            switch (req.type) {
              case 'evolution':
                return isEvolutionUnlocked(req.target);
              case 'encounters': {
                const encounterValue = soloModeStats[req.target as keyof typeof soloModeStats] || 0;
                return encounterValue >= req.value;
              }
              case 'resource': {
                const resourceValue =
                  (resources[req.target as keyof typeof resources] as number) || 0;
                return resourceValue >= req.value;
              }
              default:
                return true;
            }
          }),
          canAfford: Object.entries(n.data.node.cost).every(([resource, cost]) => {
            const available = resources[resource as keyof typeof resources] as number;
            return available >= (cost as number);
          }),
          isExpanded: expandedNodeId === n.id,
          onToggleExpanded: handleToggleExpanded,
          isEvolutionUnlocked,
          tree,
        },
      }))
    );

    setEdges(edges =>
      edges.map(edge => {
        const isEdgeActive = isEvolutionUnlocked(edge.source);
        return {
          ...edge,
          animated: isEdgeActive,
          style: {
            ...edge.style,
            stroke: isEdgeActive ? '#3b82f6' : '#6b7280',
            strokeWidth: isEdgeActive ? 3 : 2,
            opacity: isEdgeActive ? 1 : 0.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isEdgeActive ? '#3b82f6' : '#6b7280',
          },
        };
      })
    );
  }, [
    resources,
    soloModeStats,
    isEvolutionUnlocked,
    expandedNodeId,
    handleToggleExpanded,
    setNodes,
    setEdges,
    unlockedEvolutions,
    tree,
  ]);

  return (
    <div className={`game-evolution-tree ${className}`}>
      <div className="game-evolution-tree__header">
        <h3>{tree.name}</h3>
        <div className="game-evolution-tree__stats">
          <span>Max Tier: {tree.maxTier}</span>
          <span>Evolutions: {tree.nodes.size}</span>
        </div>
      </div>

      <div className="game-evolution-tree__container">
        <ReactFlow
          key={treeKey}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Strict}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.5}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          onPaneClick={() => setExpandedNodeId(null)}
        >
          <Background color="#1e293b" gap={20} />
          <Controls />
          <Panel position="top-right" className="game-evolution-tree__legend">
            <div className="legend-item">
              <span className="legend-icon legend-icon--unlocked">✓</span>
              <span>Unlocked</span>
            </div>
            <div className="legend-item">
              <span className="legend-icon legend-icon--available">◦</span>
              <span>Available</span>
            </div>
            <div className="legend-item">
              <span className="legend-icon legend-icon--locked">🔒</span>
              <span>Locked</span>
            </div>
            <div className="legend-item">
              <span className="legend-icon legend-icon--requires-evolution">⚠</span>
              <span>Requires Evolution</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
};

export default GameEvolutionTree;
