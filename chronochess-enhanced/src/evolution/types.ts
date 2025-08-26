import type { PieceType } from '../engine/types';

export type { PieceType };

// Core evolution data structures
export interface IPieceEvolution {
  id: string;
  pieceType: PieceType;
  attributes: PieceAttributes;
  unlockedAbilities: Ability[];
  visualModifications: VisualMod[];
  evolutionLevel: number;
  totalInvestment: ResourceCost;
  timeInvested: number; // For auto-promotion system
  createdAt: number;
  lastModified: number;
}

export interface PieceAttributes {
  // Movement attributes
  moveRange: number;
  moveSpeed: number;
  canJump: boolean;
  canMoveBackward: boolean;

  // Combat attributes
  attackPower: number;
  defense: number;
  captureBonus: number;

  // Special attributes
  eleganceMultiplier: number;
  resourceGeneration: number;
  synergyRadius: number;

  // Evolution-specific attributes
  evolutionEfficiency: number;
  abilitySlots: number;

  // Custom attributes for advanced evolutions
  custom: Record<string, number | string | boolean>;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  type: 'movement' | 'capture' | 'special' | 'passive' | 'synergy';
  effect: AbilityEffect;
  cooldown?: number;
  lastUsed?: number;
  requirements?: AbilityRequirement[];
  cost?: ResourceCost;
}

export interface AbilityEffect {
  type: string;
  value: number | string | boolean;
  duration?: number;
  target?: 'self' | 'enemy' | 'ally' | 'board';
  range?: number;
}

export interface AbilityRequirement {
  type: 'level' | 'attribute' | 'piece_count' | 'board_state';
  key: string;
  value: number | string | boolean;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
}

export interface VisualMod {
  type: 'color' | 'material' | 'size' | 'effect' | 'trail' | 'glow';
  value: string | number | boolean;
  intensity?: number;
  duration?: number;
}

export interface ResourceCost {
  temporalEssence?: number;
  mnemonicDust?: number;
  aetherShards?: number;
  arcaneMana?: number;
}

// Evolution tree structures
export interface Evolution {
  id: string;
  name: string;
  description: string;
  pieceType: PieceType;
  cost: ResourceCost;
  effects: EvolutionEffect[];
  requirements: EvolutionRequirement[];
  tier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export interface EvolutionEffect {
  type: 'attribute' | 'ability' | 'visual' | 'synergy';
  target: string;
  value: number | string | boolean | Ability | VisualMod;
  operation: 'add' | 'multiply' | 'set' | 'unlock';
}

export interface EvolutionRequirement {
  type: 'level' | 'evolution' | 'attribute' | 'time' | 'achievement';
  key: string;
  value: number | string;
  operator: '>' | '<' | '=' | '>=' | '<=';
}

export interface EvolutionNode {
  evolution: Evolution;
  children: EvolutionNode[];
  parent?: EvolutionNode;
  requirements: EvolutionRequirement[];
  unlocked: boolean;
  position: { x: number; y: number }; // For UI tree display
}

export interface EvolutionTree {
  pieceType: PieceType;
  rootNodes: EvolutionNode[];
  maxTier: number;
  totalNodes: number;
}

// Combination tracking for 10^12 variations
export interface EvolutionCombination {
  id: string;
  pieceEvolutions: Map<PieceType, IPieceEvolution>;
  combinationHash: string;
  synergyBonuses: SynergyBonus[];
  totalPower: number;
  discoveredAt: number;
}

export interface SynergyBonus {
  id: string;
  name: string;
  description: string;
  pieces: PieceType[];
  requirements: SynergyRequirement[];
  effects: SynergyEffect[];
  multiplier: number;
}

export interface SynergyRequirement {
  type: 'evolution_level' | 'attribute' | 'ability' | 'proximity';
  key: string;
  value: number | string;
  operator: '>' | '<' | '=' | '>=' | '<=';
}

export interface SynergyEffect {
  type: 'attribute_bonus' | 'ability_enhancement' | 'resource_bonus' | 'special';
  target: string;
  value: number | string;
  duration?: number;
}

// Cost calculation structures
export interface CostScaling {
  baseMultiplier: number;
  levelExponent: number;
  tierMultiplier: number;
  rarityMultiplier: Record<string, number>;
  timeDecayFactor: number;
}

export interface IEvolutionCostCalculator {
  calculateBaseCost(evolution: Evolution): ResourceCost;
  calculateScaledCost(evolution: Evolution, currentLevel: number): ResourceCost;
  calculateBulkDiscount(evolutions: Evolution[]): number;
  calculateTimeBonus(timeInvested: number): number;
}

// Save system structures
export interface EvolutionSaveData {
  version: string;
  evolutions: IPieceEvolution[];
  combinations: EvolutionCombination[];
  unlockedNodes: string[];
  synergyBonuses: SynergyBonus[];
  totalCombinations: string; // BigInt as string
  timestamp: number;
  checksum: string;
}

// Auto-promotion system
export interface AutoPromotionConfig {
  enabled: boolean;
  timeThreshold: number; // Minimum time invested in milliseconds
  attributeThresholds: Record<string, number>;
  requiredEvolutions: string[];
  promotionTarget: PieceType;
}

export interface PromotionCandidate {
  pieceEvolution: IPieceEvolution;
  timeInvested: number;
  meetsRequirements: boolean;
  promotionScore: number;
  recommendedTarget: PieceType;
}
