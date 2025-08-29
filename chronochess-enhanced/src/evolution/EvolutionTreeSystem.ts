/**
 * Evolution Tree System for ChronoChess
 * Manages hierarchical piece evolution paths with prerequisites and unlocks
 */

import type { PieceType, PieceAbility } from '../engine/types';
import { showToast } from '../components/common/toastService';
import { progressTracker } from '../save/ProgressTracker';
import type { ResourceCost } from '../resources/types';

export interface EvolutionTreeNode {
  id: string;
  name: string;
  description: string;
  pieceType: PieceType;
  tier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  cost: ResourceCost;

  // Prerequisites
  requirements: EvolutionRequirement[];

  // Effects when unlocked
  effects: EvolutionEffect[];

  // Tree structure
  parentId?: string;
  childrenIds: string[];

  // Position in tree visualization
  position: { x: number; y: number };

  // Visual theming
  theme: 'offensive' | 'defensive' | 'utility' | 'hybrid';

  // Unlock status
  isUnlocked?: boolean;
  isAvailable?: boolean; // Can be unlocked (prerequisites met)
}

export interface EvolutionRequirement {
  type: 'evolution' | 'resource' | 'level' | 'encounters' | 'achievement';
  target: string;
  value: number;
  operator: '>=' | '>' | '==' | '<=' | '<';
}

export interface EvolutionEffect {
  type: 'attribute' | 'ability' | 'visual' | 'passive';
  target: string;
  value: any;
  operation: 'add' | 'multiply' | 'set' | 'unlock';
}

export interface PieceEvolutionTree {
  pieceType: PieceType;
  name: string;
  rootNodes: string[]; // Starting evolutions
  nodes: Map<string, EvolutionTreeNode>;
  maxTier: number;
}

export class EvolutionTreeSystem {
  private trees: Map<PieceType, PieceEvolutionTree>;
  private playerUnlocks: Set<string>; // Unlocked evolution IDs

  constructor() {
    this.trees = new Map();
    this.playerUnlocks = new Set();
    this.initializeEvolutionTrees();
    this.loadUnlocksFromStorage();
  }

  private initializeEvolutionTrees(): void {
    // Initialize all piece evolution trees
    this.createPawnEvolutionTree();
    this.createKnightEvolutionTree();
    this.createBishopEvolutionTree();
    this.createRookEvolutionTree();
    this.createQueenEvolutionTree();
    this.createKingEvolutionTree();
  }

  private createPawnEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    // Tier 1 - Basic Enhancements
    nodes.set('pawn_swift_march', {
      id: 'pawn_swift_march',
      name: 'Swift March',
      description: 'Increases movement speed and initial advance capability',
      pieceType: 'p',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 25, mnemonicDust: 10 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'marchSpeed', value: 1, operation: 'add' },
        { type: 'attribute', target: 'initialAdvance', value: 3, operation: 'set' },
      ],
      parentId: undefined,
      childrenIds: ['pawn_vanguard', 'pawn_scout'],
      position: { x: 100, y: 50 },
      theme: 'offensive',
      isUnlocked: false,
      isAvailable: true,
    });

    nodes.set('pawn_resilient_core', {
      id: 'pawn_resilient_core',
      name: 'Resilient Core',
      description: 'Enhances defensive capabilities and survival instincts',
      pieceType: 'p',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 20, mnemonicDust: 15 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'resilience', value: 1, operation: 'add' },
        { type: 'attribute', target: 'defense', value: 0.5, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['pawn_guardian', 'pawn_fortress'],
      position: { x: 300, y: 50 },
      theme: 'defensive',
      isUnlocked: false,
      isAvailable: true,
    });

    // Tier 2 - Specialized Paths
    nodes.set('pawn_vanguard', {
      id: 'pawn_vanguard',
      name: 'Vanguard Leader',
      description: 'Leads the charge with enhanced offensive capabilities',
      pieceType: 'p',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 50, mnemonicDust: 25, arcaneMana: 10 },
      requirements: [{ type: 'evolution', target: 'pawn_swift_march', value: 1, operator: '>=' }],
      effects: [
        { type: 'attribute', target: 'attackPower', value: 1.5, operation: 'multiply' },
        // Historical tests expect the Vanguard to unlock a 'charge_attack'
        // ability; keep ability ids stable for test contracts.
        { type: 'ability', target: 'charge_attack', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_swift_march',
      childrenIds: ['pawn_berserker'],
      position: { x: 50, y: 120 },
      theme: 'offensive',
    });

    nodes.set('pawn_scout', {
      id: 'pawn_scout',
      name: 'Battlefield Scout',
      description: 'Enhanced mobility and reconnaissance abilities',
      pieceType: 'p',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 45, mnemonicDust: 30 },
      requirements: [{ type: 'evolution', target: 'pawn_swift_march', value: 1, operator: '>=' }],
      effects: [
        { type: 'attribute', target: 'moveRange', value: 2, operation: 'add' },
        { type: 'ability', target: 'breakthrough', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_swift_march',
      childrenIds: ['pawn_infiltrator'],
      position: { x: 150, y: 120 },
      theme: 'utility',
    });

    nodes.set('pawn_guardian', {
      id: 'pawn_guardian',
      name: 'Shield Guardian',
      description: 'Protects adjacent allies with defensive auras',
      pieceType: 'p',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 40, mnemonicDust: 35, arcaneMana: 15 },
      requirements: [
        { type: 'evolution', target: 'pawn_resilient_core', value: 1, operator: '>=' },
      ],
      effects: [
        { type: 'attribute', target: 'synergyRadius', value: 1, operation: 'set' },
        { type: 'ability', target: 'protective-aura', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_resilient_core',
      childrenIds: ['pawn_paladin'],
      position: { x: 250, y: 120 },
      theme: 'defensive',
    });

    nodes.set('pawn_fortress', {
      id: 'pawn_fortress',
      name: 'Mobile Fortress',
      description: 'Becomes a defensive anchor point',
      pieceType: 'p',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 35, mnemonicDust: 40, arcaneMana: 5 },
      requirements: [
        { type: 'evolution', target: 'pawn_resilient_core', value: 1, operator: '>=' },
      ],
      effects: [
        { type: 'attribute', target: 'defense', value: 2, operation: 'add' },
        { type: 'ability', target: 'immobilize-resist', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_resilient_core',
      childrenIds: ['pawn_citadel'],
      position: { x: 350, y: 120 },
      theme: 'defensive',
    });

    // Tier 3 - Elite Specializations
    nodes.set('pawn_berserker', {
      id: 'pawn_berserker',
      name: 'Temporal Berserker',
      description: 'Unleashes devastating attacks with temporal fury',
      pieceType: 'p',
      tier: 3,
      rarity: 'rare',
      cost: { temporalEssence: 100, mnemonicDust: 50, arcaneMana: 25, aetherShards: 2 },
      requirements: [
        { type: 'evolution', target: 'pawn_vanguard', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 10, operator: '>=' },
      ],
      effects: [
        { type: 'attribute', target: 'attackPower', value: 2, operation: 'multiply' },
        { type: 'ability', target: 'berserker-rage', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_vanguard',
      childrenIds: [],
      position: { x: 50, y: 200 },
      theme: 'offensive',
    });

    nodes.set('pawn_infiltrator', {
      id: 'pawn_infiltrator',
      name: 'Shadow Infiltrator',
      description: 'Masters stealth and behind-enemy-lines tactics',
      pieceType: 'p',
      tier: 3,
      rarity: 'rare',
      cost: { temporalEssence: 80, mnemonicDust: 60, arcaneMana: 40, aetherShards: 1 },
      requirements: [
        { type: 'evolution', target: 'pawn_scout', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 8, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'phase-through', value: true, operation: 'unlock' },
        { type: 'ability', target: 'backstab', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_scout',
      childrenIds: [],
      position: { x: 150, y: 200 },
      theme: 'utility',
    });

    nodes.set('pawn_paladin', {
      id: 'pawn_paladin',
      name: 'Chronos Paladin',
      description: 'Divine protector with time-based healing abilities',
      pieceType: 'p',
      tier: 3,
      rarity: 'rare',
      cost: { temporalEssence: 75, mnemonicDust: 75, arcaneMana: 50, aetherShards: 2 },
      requirements: [
        { type: 'evolution', target: 'pawn_guardian', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 12, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'heal-allies', value: true, operation: 'unlock' },
        { type: 'ability', target: 'time-ward', value: true, operation: 'unlock' },
      ],
      parentId: 'pawn_guardian',
      childrenIds: [],
      position: { x: 250, y: 200 },
      theme: 'hybrid',
    });

    nodes.set('pawn_citadel', {
      id: 'pawn_citadel',
      name: 'Temporal Citadel',
      description: 'Ultimate defensive structure that controls battlefield zones',
      pieceType: 'p',
      tier: 3,
      rarity: 'epic',
      cost: { temporalEssence: 120, mnemonicDust: 80, arcaneMana: 30, aetherShards: 3 },
      requirements: [
        { type: 'evolution', target: 'pawn_fortress', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 15, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'zone-control', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'synergyRadius', value: 2, operation: 'set' },
      ],
      parentId: 'pawn_fortress',
      childrenIds: [],
      position: { x: 350, y: 200 },
      theme: 'defensive',
    });

    this.trees.set('p', {
      pieceType: 'p',
      name: 'Pawn Evolution Tree',
      rootNodes: ['pawn_swift_march', 'pawn_resilient_core'],
      nodes,
      maxTier: 3,
    });
  }

  private createKnightEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    // Tier 1 - Base Enhancements
    nodes.set('knight_dash_master', {
      id: 'knight_dash_master',
      name: 'Dash Master',
      description: 'Enhances leap ability with improved dash mechanics',
      pieceType: 'n',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 30, mnemonicDust: 20 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'dashChance', value: 0.1, operation: 'add' },
        { type: 'attribute', target: 'dashCooldown', value: -1, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['knight_blitz', 'knight_cavalry'],
      position: { x: 100, y: 50 },
      theme: 'offensive',
    });

    nodes.set('knight_tactical_mind', {
      id: 'knight_tactical_mind',
      name: 'Tactical Mind',
      description: 'Develops strategic thinking and battlefield awareness',
      pieceType: 'n',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 25, mnemonicDust: 25 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'strategicValue', value: 1, operation: 'add' },
        { type: 'ability', target: 'predict-moves', value: true, operation: 'unlock' },
      ],
      parentId: undefined,
      childrenIds: ['knight_commander', 'knight_scout'],
      position: { x: 300, y: 50 },
      theme: 'utility',
    });

    // Tier 2 specializations
    nodes.set('knight_blitz', {
      id: 'knight_blitz',
      name: 'Blitz Striker',
      description: 'Lightning-fast attacks with multiple strike capability',
      pieceType: 'n',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 60, mnemonicDust: 40, arcaneMana: 20 },
      requirements: [{ type: 'evolution', target: 'knight_dash_master', value: 1, operator: '>=' }],
      effects: [
        { type: 'ability', target: 'knight-dash', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'attackSpeed', value: 1.5, operation: 'multiply' },
      ],
      parentId: 'knight_dash_master',
      childrenIds: ['knight_tempest'],
      position: { x: 50, y: 120 },
      theme: 'offensive',
    });

    nodes.set('knight_cavalry', {
      id: 'knight_cavalry',
      name: 'Cavalry Unit',
      description: 'Enhanced mobility with extended range',
      pieceType: 'n',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 55, mnemonicDust: 45 },
      requirements: [{ type: 'evolution', target: 'knight_dash_master', value: 1, operator: '>=' }],
      effects: [
        { type: 'ability', target: 'extended-range', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'movementRange', value: 1, operation: 'add' },
      ],
      parentId: 'knight_dash_master',
      childrenIds: ['knight_champion'],
      position: { x: 150, y: 120 },
      theme: 'offensive',
    });

    nodes.set('knight_commander', {
      id: 'knight_commander',
      name: 'Battle Commander',
      description: 'Leadership abilities that enhance nearby allies',
      pieceType: 'n',
      tier: 2,
      rarity: 'rare',
      cost: { temporalEssence: 70, mnemonicDust: 50, arcaneMana: 25 },
      requirements: [
        { type: 'evolution', target: 'knight_tactical_mind', value: 1, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'command-aura', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'allyBonus', value: 1.2, operation: 'multiply' },
      ],
      parentId: 'knight_tactical_mind',
      childrenIds: ['knight_general'],
      position: { x: 250, y: 120 },
      theme: 'hybrid',
    });

    nodes.set('knight_scout', {
      id: 'knight_scout',
      name: 'Reconnaissance Expert',
      description: 'Enhanced vision and battlefield awareness',
      pieceType: 'n',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 50, mnemonicDust: 35, arcaneMana: 15 },
      requirements: [
        { type: 'evolution', target: 'knight_tactical_mind', value: 1, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'enhanced-vision', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'visionRange', value: 2, operation: 'add' },
      ],
      parentId: 'knight_tactical_mind',
      childrenIds: ['knight_infiltrator'],
      position: { x: 350, y: 120 },
      theme: 'utility',
    });

    // Tier 3 - Elite Specializations
    nodes.set('knight_tempest', {
      id: 'knight_tempest',
      name: 'Tempest Knight',
      description: 'Unleashes devastating area attacks',
      pieceType: 'n',
      tier: 3,
      rarity: 'epic',
      cost: { temporalEssence: 120, mnemonicDust: 80, arcaneMana: 40, aetherShards: 2 },
      requirements: [
        { type: 'evolution', target: 'knight_blitz', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 15, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'area-strike', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'splashDamage', value: 1.5, operation: 'multiply' },
      ],
      parentId: 'knight_blitz',
      childrenIds: [],
      position: { x: 50, y: 200 },
      theme: 'offensive',
    });

    nodes.set('knight_champion', {
      id: 'knight_champion',
      name: 'Champion Knight',
      description: 'Master of combat with enhanced survivability',
      pieceType: 'n',
      tier: 3,
      rarity: 'rare',
      cost: { temporalEssence: 90, mnemonicDust: 70, arcaneMana: 35 },
      requirements: [
        { type: 'evolution', target: 'knight_cavalry', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 12, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'resilient-stance', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'defense', value: 2, operation: 'add' },
      ],
      parentId: 'knight_cavalry',
      childrenIds: [],
      position: { x: 150, y: 200 },
      theme: 'defensive',
    });

    nodes.set('knight_general', {
      id: 'knight_general',
      name: 'Grand General',
      description: 'Supreme commander with battlefield control',
      pieceType: 'n',
      tier: 3,
      rarity: 'legendary',
      cost: { temporalEssence: 150, mnemonicDust: 100, arcaneMana: 60, aetherShards: 5 },
      requirements: [
        { type: 'evolution', target: 'knight_commander', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 20, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'battlefield-command', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'commandRadius', value: 3, operation: 'add' },
      ],
      parentId: 'knight_commander',
      childrenIds: [],
      position: { x: 250, y: 200 },
      theme: 'hybrid',
    });

    nodes.set('knight_infiltrator', {
      id: 'knight_infiltrator',
      name: 'Shadow Infiltrator',
      description: 'Master of stealth and surprise attacks',
      pieceType: 'n',
      tier: 3,
      rarity: 'epic',
      cost: { temporalEssence: 100, mnemonicDust: 75, arcaneMana: 50, aetherShards: 3 },
      requirements: [
        { type: 'evolution', target: 'knight_scout', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 18, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'stealth-mode', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'criticalChance', value: 0.2, operation: 'add' },
      ],
      parentId: 'knight_scout',
      childrenIds: [],
      position: { x: 350, y: 200 },
      theme: 'utility',
    });

    this.trees.set('n', {
      pieceType: 'n',
      name: 'Knight Evolution Tree',
      rootNodes: ['knight_dash_master', 'knight_tactical_mind'],
      nodes,
      maxTier: 3,
    });
  }

  private createBishopEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    nodes.set('bishop_consecration', {
      id: 'bishop_consecration',
      name: 'Consecration Master',
      description: 'Masters the art of battlefield consecration',
      pieceType: 'b',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 35, arcaneMana: 25 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'consecrationTurns', value: -1, operation: 'add' },
        { type: 'attribute', target: 'snipeRange', value: 1, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['bishop_divine'],
      position: { x: 100, y: 50 },
      theme: 'utility',
    });

    nodes.set('bishop_divine', {
      id: 'bishop_divine',
      name: 'Divine Power',
      description: 'Channels divine energy for enhanced abilities',
      pieceType: 'b',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 60, arcaneMana: 40 },
      requirements: [
        { type: 'evolution', target: 'bishop_consecration', value: 1, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'bishop-consecrate', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'manaRegen', value: 1.5, operation: 'multiply' },
      ],
      parentId: 'bishop_consecration',
      childrenIds: ['bishop_archangel'],
      position: { x: 100, y: 120 },
      theme: 'utility',
    });

    nodes.set('bishop_archangel', {
      id: 'bishop_archangel',
      name: 'Archangel',
      description: 'Ascended being with divine powers',
      pieceType: 'b',
      tier: 3,
      rarity: 'epic',
      cost: { temporalEssence: 120, arcaneMana: 80, aetherShards: 3 },
      requirements: [
        { type: 'evolution', target: 'bishop_divine', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 15, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'divine-intervention', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'healPower', value: 2, operation: 'multiply' },
      ],
      parentId: 'bishop_divine',
      childrenIds: [],
      position: { x: 100, y: 200 },
      theme: 'hybrid',
    });

    this.trees.set('b', {
      pieceType: 'b',
      name: 'Bishop Evolution Tree',
      rootNodes: ['bishop_consecration'],
      nodes,
      maxTier: 3,
    });
  }

  private createRookEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    nodes.set('rook_entrenchment', {
      id: 'rook_entrenchment',
      name: 'Entrenchment Specialist',
      description: 'Masters defensive positioning and area control',
      pieceType: 'r',
      tier: 1,
      rarity: 'common',
      cost: { temporalEssence: 40, mnemonicDust: 30 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'entrenchThreshold', value: -1, operation: 'add' },
        { type: 'attribute', target: 'entrenchPower', value: 1, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['rook_fortress'],
      position: { x: 100, y: 50 },
      theme: 'defensive',
    });

    nodes.set('rook_fortress', {
      id: 'rook_fortress',
      name: 'Fortress Core',
      description: 'Becomes an immovable defensive anchor',
      pieceType: 'r',
      tier: 2,
      rarity: 'uncommon',
      cost: { temporalEssence: 70, mnemonicDust: 50, arcaneMana: 20 },
      requirements: [{ type: 'evolution', target: 'rook_entrenchment', value: 1, operator: '>=' }],
      effects: [
        { type: 'ability', target: 'rook-entrench', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'territoryControl', value: 1, operation: 'add' },
      ],
      parentId: 'rook_entrenchment',
      childrenIds: ['rook_citadel'],
      position: { x: 100, y: 120 },
      theme: 'defensive',
    });

    nodes.set('rook_citadel', {
      id: 'rook_citadel',
      name: 'Citadel Guardian',
      description: 'Controls entire sections of the battlefield',
      pieceType: 'r',
      tier: 3,
      rarity: 'rare',
      cost: { temporalEssence: 100, mnemonicDust: 75, arcaneMana: 40, aetherShards: 2 },
      requirements: [
        { type: 'evolution', target: 'rook_fortress', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 12, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'zone-control', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'controlRadius', value: 2, operation: 'add' },
      ],
      parentId: 'rook_fortress',
      childrenIds: [],
      position: { x: 100, y: 200 },
      theme: 'defensive',
    });

    this.trees.set('r', {
      pieceType: 'r',
      name: 'Rook Evolution Tree',
      rootNodes: ['rook_entrenchment'],
      nodes,
      maxTier: 3,
    });
  }

  private createQueenEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    nodes.set('queen_dominance', {
      id: 'queen_dominance',
      name: 'Dominance Aura',
      description: 'Expands influence over the battlefield',
      pieceType: 'q',
      tier: 1,
      rarity: 'uncommon',
      cost: { temporalEssence: 60, arcaneMana: 40 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'dominanceAuraRange', value: 1, operation: 'add' },
        { type: 'attribute', target: 'manaRegenBonus', value: 0.1, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['queen_empress'],
      position: { x: 100, y: 50 },
      theme: 'hybrid',
    });

    nodes.set('queen_empress', {
      id: 'queen_empress',
      name: 'Empress Command',
      description: 'Commands with absolute authority',
      pieceType: 'q',
      tier: 2,
      rarity: 'rare',
      cost: { temporalEssence: 90, arcaneMana: 60, aetherShards: 1 },
      requirements: [{ type: 'evolution', target: 'queen_dominance', value: 1, operator: '>=' }],
      effects: [
        { type: 'ability', target: 'queen-dominance', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'commandStrength', value: 1.5, operation: 'multiply' },
      ],
      parentId: 'queen_dominance',
      childrenIds: ['queen_goddess'],
      position: { x: 100, y: 120 },
      theme: 'hybrid',
    });

    nodes.set('queen_goddess', {
      id: 'queen_goddess',
      name: 'Goddess Ascension',
      description: 'Ascends to divine status with ultimate power',
      pieceType: 'q',
      tier: 3,
      rarity: 'legendary',
      cost: { temporalEssence: 150, arcaneMana: 100, aetherShards: 5 },
      requirements: [
        { type: 'evolution', target: 'queen_empress', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 20, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'divine-authority', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'ultimatePower', value: 3, operation: 'multiply' },
      ],
      parentId: 'queen_empress',
      childrenIds: [],
      position: { x: 100, y: 200 },
      theme: 'hybrid',
    });

    this.trees.set('q', {
      pieceType: 'q',
      name: 'Queen Evolution Tree',
      rootNodes: ['queen_dominance'],
      nodes,
      maxTier: 3,
    });
  }

  private createKingEvolutionTree(): void {
    const nodes = new Map<string, EvolutionTreeNode>();

    nodes.set('king_decree', {
      id: 'king_decree',
      name: 'Royal Decree',
      description: 'Commands with greater authority and frequency',
      pieceType: 'k',
      tier: 1,
      rarity: 'rare',
      cost: { temporalEssence: 80, mnemonicDust: 60, aetherShards: 1 },
      requirements: [],
      effects: [
        { type: 'attribute', target: 'royalDecreeUses', value: 1, operation: 'add' },
        { type: 'attribute', target: 'lastStandThreshold', value: 0.05, operation: 'add' },
      ],
      parentId: undefined,
      childrenIds: ['king_emperor'],
      position: { x: 100, y: 50 },
      theme: 'hybrid',
    });

    nodes.set('king_emperor', {
      id: 'king_emperor',
      name: 'Emperor Ascension',
      description: 'Ascends to imperial status with enhanced protection',
      pieceType: 'k',
      tier: 2,
      rarity: 'epic',
      cost: { temporalEssence: 120, mnemonicDust: 90, arcaneMana: 50, aetherShards: 3 },
      requirements: [{ type: 'evolution', target: 'king_decree', value: 1, operator: '>=' }],
      effects: [
        { type: 'ability', target: 'imperial-guard', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'protectionRadius', value: 2, operation: 'add' },
      ],
      parentId: 'king_decree',
      childrenIds: ['king_divine'],
      position: { x: 100, y: 120 },
      theme: 'defensive',
    });

    nodes.set('king_divine', {
      id: 'king_divine',
      name: 'Divine King',
      description: 'Ascends to divine status with ultimate protection',
      pieceType: 'k',
      tier: 3,
      rarity: 'legendary',
      cost: { temporalEssence: 200, mnemonicDust: 150, arcaneMana: 100, aetherShards: 10 },
      requirements: [
        { type: 'evolution', target: 'king_emperor', value: 1, operator: '>=' },
        { type: 'encounters', target: 'wins', value: 25, operator: '>=' },
      ],
      effects: [
        { type: 'ability', target: 'divine-protection', value: true, operation: 'unlock' },
        { type: 'attribute', target: 'immortality', value: 1, operation: 'set' },
      ],
      parentId: 'king_emperor',
      childrenIds: [],
      position: { x: 100, y: 200 },
      theme: 'defensive',
    });

    this.trees.set('k', {
      pieceType: 'k',
      name: 'King Evolution Tree',
      rootNodes: ['king_decree'],
      nodes,
      maxTier: 3,
    });
  }

  // Public API methods

  /**
   * Get evolution tree for a specific piece type
   */
  getEvolutionTree(pieceType: PieceType): PieceEvolutionTree | undefined {
    return this.trees.get(pieceType);
  }

  /**
   * Get all available evolution trees
   */
  getAllTrees(): Map<PieceType, PieceEvolutionTree> {
    return this.trees;
  }

  /**
   * Check if an evolution is available (prerequisites met)
   */
  isEvolutionAvailable(evolutionId: string, currentState: any): boolean {
    const evolution = this.findEvolutionById(evolutionId);
    if (!evolution) return false;

    return evolution.requirements.every(req => {
      switch (req.type) {
        case 'evolution':
          return this.playerUnlocks.has(req.target);
        case 'resource': {
          const resourceValue = currentState.resources[req.target] || 0;
          return this.checkOperator(resourceValue, req.value, req.operator);
        }
        case 'encounters': {
          const encounterValue = currentState.soloModeStats[req.target] || 0;
          return this.checkOperator(encounterValue, req.value, req.operator);
        }
        case 'level': {
          const levelValue = currentState.pieceEvolutions[evolution.pieceType]?.[req.target] || 0;
          return this.checkOperator(levelValue, req.value, req.operator);
        }
        default:
          return false;
      }
    });
  }

  /**
   * Unlock an evolution
   */
  unlockEvolution(evolutionId: string): boolean {
    const evolution = this.findEvolutionById(evolutionId);
    if (!evolution) return false;

    this.playerUnlocks.add(evolutionId);
    this.updateTreeAvailability();

    // Immediately save the unlocked evolution to localStorage
    try {
      this.saveUnlocksToStorage();
      console.log(`Evolution ${evolutionId} unlocked and saved to localStorage`);
      // Notify progress tracker so evolution-based achievements are reconciled
      try {
        const node = this.findEvolutionById(evolutionId);
        if (node) {
          // Attempt to compute accurate `isMaxed` and `isFirstEvolution` flags by
          // inspecting the game's piece evolution state. Use lazy requires to avoid
          // circular imports during module initialization.
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { useGameStore } = require('../store/gameStore');
            const storeState = useGameStore.getState();

            const pieceEvos = storeState.pieceEvolutions || {};
            const pieceType = node.pieceType as string;

            // isFirstEvolution: true if no non-default evolutions recorded for piece
            const pieceData = pieceEvos[pieceType as keyof typeof pieceEvos] as any;
            const isFirstEvolution =
              !pieceData ||
              Object.values(pieceData).every((v: any) => v === 0 || v === null || v === undefined);

            // isMaxed: check if any attribute for this piece type equals the configured max
            const maxValues: Record<string, any> = {
              pawn: { marchSpeed: 10, resilience: 5 },
              knight: { dashChance: 0.8, dashCooldown: 1 },
              bishop: { snipeRange: 5, consecrationTurns: 1 },
              rook: { entrenchThreshold: 1, entrenchPower: 5 },
              queen: { dominanceAuraRange: 3, manaRegenBonus: 2.0 },
              king: { royalDecreeUses: 3, lastStandThreshold: 0.5 },
            };

            let isMaxed = false;
            const checks = maxValues[pieceType as keyof typeof maxValues];
            if (checks && pieceData) {
              for (const [attr, maxVal] of Object.entries(checks)) {
                if (typeof pieceData[attr] === 'number' && pieceData[attr] >= (maxVal as number)) {
                  isMaxed = true;
                  break;
                }
              }
            }

            progressTracker
              .trackPieceEvolution(node.pieceType, isMaxed, isFirstEvolution)
              .catch((err: any) =>
                console.warn('Failed to notify ProgressTracker of evolution unlock:', err)
              );
          } catch (err) {
            // Fallback: if store isn't available, mark as first evolution only
            try {
              progressTracker.trackPieceEvolution(node.pieceType, false, true).catch(() => {});
            } catch (err2) {}
          }
        }
      } catch (err) {
        console.warn('Error while notifying progress tracker about evolution unlock:', err);
      }
    } catch (error) {
      console.error(`Failed to save evolution ${evolutionId} to localStorage:`, error);
      // Even if saving fails, we still consider the evolution unlocked in memory
    }

    return true;
  }

  /**
   * Get player's unlocked evolutions
   */
  getUnlockedEvolutions(): Set<string> {
    return new Set(this.playerUnlocks);
  }

  /**
   * Update tree availability based on current unlocks
   */
  private updateTreeAvailability(): void {
    this.trees.forEach(tree => {
      tree.nodes.forEach(node => {
        node.isUnlocked = this.playerUnlocks.has(node.id);
        // Note: isAvailable would be calculated when rendering based on current game state
      });
    });
  }

  /**
   * Find evolution by ID across all trees
   */
  private findEvolutionById(evolutionId: string): EvolutionTreeNode | undefined {
    for (const tree of this.trees.values()) {
      const node = tree.nodes.get(evolutionId);
      if (node) return node;
    }
    return undefined;
  }

  /**
   * Check requirement operator
   */
  private checkOperator(actual: number, required: number, operator: string): boolean {
    switch (operator) {
      case '>=':
        return actual >= required;
      case '>':
        return actual > required;
      case '==':
        return actual === required;
      case '<=':
        return actual <= required;
      case '<':
        return actual < required;
      default:
        return false;
    }
  }

  /**
   * Serialize unlocked evolutions
   */
  serialize(): string[] {
    return Array.from(this.playerUnlocks);
  }

  /**
   * Deserialize unlocked evolutions
   */
  deserialize(unlockedIds: string[]): void {
    this.playerUnlocks = new Set(unlockedIds);
    this.updateTreeAvailability();
  }

  /**
   * Check if a specific evolution is unlocked
   */
  isEvolutionUnlocked(evolutionId: string): boolean {
    return this.playerUnlocks.has(evolutionId);
  }

  /**
   * Get all abilities granted by unlocked evolutions for a piece type
   */
  getAbilitiesForPiece(pieceType: PieceType): PieceAbility[] {
    const abilities: PieceAbility[] = [];

    // Get the tree for this piece type
    const tree = this.trees.get(pieceType);
    if (!tree) return abilities;

    // For each unlocked evolution that matches this piece type
    this.playerUnlocks.forEach(evolutionId => {
      const node = tree.nodes.get(evolutionId);
      if (node && node.pieceType === pieceType) {
        // Extract abilities from effects
        node.effects.forEach(effect => {
          if (effect.type === 'ability') {
            // Create a PieceAbility object from the effect
            const ability: PieceAbility = {
              id: effect.target,
              name: this.formatAbilityName(effect.target),
              type: this.determineAbilityType(effect.target),
              description: this.getAbilityDescription(effect.target),
              cooldown: this.getAbilityCooldown(effect.target),
            };

            // Add to abilities if not already present
            if (!abilities.some(a => a.id === ability.id)) {
              abilities.push(ability);
            }
          }
        });
      }
    });

    return abilities;
  }

  /**
   * Get all attribute bonuses from unlocked evolutions for a piece type
   */
  getAttributeBonusesForPiece(pieceType: PieceType): Record<string, number> {
    const bonuses: Record<string, number> = {};

    // Get the tree for this piece type
    const tree = this.trees.get(pieceType);
    if (!tree) return bonuses;

    // For each unlocked evolution that matches this piece type
    this.playerUnlocks.forEach(evolutionId => {
      const node = tree.nodes.get(evolutionId);
      if (node && node.pieceType === pieceType) {
        // Extract attribute bonuses from effects
        node.effects.forEach(effect => {
          if (effect.type === 'attribute') {
            if (bonuses[effect.target]) {
              // Apply operation to existing bonus
              switch (effect.operation) {
                case 'add':
                  bonuses[effect.target] += Number(effect.value);
                  break;
                case 'multiply':
                  bonuses[effect.target] *= Number(effect.value);
                  break;
                case 'set':
                  bonuses[effect.target] = Number(effect.value);
                  break;
              }
            } else {
              // Set initial bonus
              bonuses[effect.target] = Number(effect.value);
            }
          }
        });
      }
    });

    return bonuses;
  }

  /**
   * Save unlocked evolutions to localStorage
   */
  private saveUnlocksToStorage(): void {
    try {
      const unlockedArray = Array.from(this.playerUnlocks);
      localStorage.setItem('chronochess_evolution_unlocks', JSON.stringify(unlockedArray));
      console.log('Evolution unlocks saved to localStorage');
    } catch (error) {
      console.error('Failed to save evolution unlocks to localStorage:', error);
    }
  }

  /**
   * Load unlocked evolutions from localStorage
   */
  private loadUnlocksFromStorage(): void {
    try {
      const savedUnlocks = localStorage.getItem('chronochess_evolution_unlocks');
      if (savedUnlocks) {
        const unlockedArray = JSON.parse(savedUnlocks);
        this.playerUnlocks = new Set(unlockedArray);
        this.updateTreeAvailability();
        console.log(`Loaded ${unlockedArray.length} evolution unlocks from localStorage`);
      }
    } catch (error) {
      console.error('Failed to load evolution unlocks from localStorage:', error);
    }
  }

  /**
   * Reset all unlocks
   */
  reset(): void {
    this.playerUnlocks.clear();
    this.updateTreeAvailability();
    this.saveUnlocksToStorage();
  }

  // Helper methods for ability conversion
  private formatAbilityName(abilityId: string): string {
    return abilityId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private determineAbilityType(abilityId: string): PieceAbility['type'] {
    // Map ability IDs to types based on their functionality
    const abilityTypeMap: Record<string, PieceAbility['type']> = {
      'enhanced-march': 'movement',
      breakthrough: 'movement',
      'knight-dash': 'special',
      'extended-range': 'movement',
      'rook-entrench': 'special',
      'bishop-consecrate': 'special',
      'queen-dominance': 'special',
      'zone-control': 'special',
      'protective-aura': 'passive',
      'immobilize-resist': 'passive',
      'berserker-rage': 'special',
      'phase-through': 'movement',
      backstab: 'special',
      'heal-allies': 'special',
      'time-ward': 'special',
      'command-aura': 'passive',
      'predict-moves': 'passive',
      'enhanced-vision': 'passive',
      'area-strike': 'special',
      'resilient-stance': 'passive',
      'battlefield-command': 'special',
      'stealth-mode': 'special',
      'divine-intervention': 'special',
      'divine-authority': 'special',
      'imperial-guard': 'special',
      'divine-protection': 'special',
    };

    return abilityTypeMap[abilityId] || 'special';
  }

  private getAbilityDescription(abilityId: string): string {
    // Detailed descriptions for each ability
    const descriptions: Record<string, string> = {
      'enhanced-march': 'Allows pawns to move multiple squares forward',
      breakthrough: 'Enables movement through enemy pieces',
      'knight-dash': 'Allows knights to make additional moves after attacking',
      'extended-range': 'Extends the movement range of pieces',
      'rook-entrench': 'Allows rooks to become entrenched for defensive bonuses',
      'bishop-consecrate': 'Allows bishops to consecrate squares for ally bonuses',
      'queen-dominance': 'Enables queens to dominate nearby enemies',
      'zone-control': 'Allows control over battlefield zones',
      'protective-aura': 'Provides defensive bonuses to nearby allies',
      'immobilize-resist': 'Reduces the chance of being immobilized',
      'berserker-rage': 'Increases attack power when health is low',
      'phase-through': 'Allows movement through obstacles',
      backstab: 'Deals extra damage when attacking from behind',
      'heal-allies': 'Restores health to nearby allies',
      'time-ward': 'Protects allies from temporal effects',
      'command-aura': 'Enhances the abilities of nearby allies',
      'predict-moves': 'Reveals enemy movement patterns',
      'enhanced-vision': 'Increases vision range on the battlefield',
      'area-strike': 'Attacks multiple enemies in an area',
      'resilient-stance': 'Reduces damage taken and increases defense',
      'battlefield-command': 'Controls large areas of the battlefield',
      'stealth-mode': 'Becomes invisible to enemies',
      'divine-intervention': 'Can resurrect fallen allies',
      'divine-authority': 'Commands absolute authority over the battlefield',
      'imperial-guard': 'Summons protective guards for the king',
      'divine-protection': 'Grants near-immortality to the king',
    };

    return descriptions[abilityId] || 'Special ability';
  }

  private getAbilityCooldown(abilityId: string): number {
    // Cooldowns for abilities in seconds
    const cooldowns: Record<string, number> = {
      'knight-dash': 3,
      'rook-entrench': 0, // Permanent state
      'bishop-consecrate': 0, // Permanent state
      'queen-dominance': 5,
      'zone-control': 10,
      'berserker-rage': 15,
      'area-strike': 8,
      'battlefield-command': 20,
      'stealth-mode': 12,
      'divine-intervention': 30,
      'divine-authority': 25,
      'imperial-guard': 15,
      'divine-protection': 0, // Permanent state
    };

    return cooldowns[abilityId] || 0;
  }

  /**
   * Emit a concise unlock toast for a given evolution node.
   * This centralizes friendly name formatting and toast wording.
   */
  public emitUnlockToast(
    evolutionNode: EvolutionTreeNode,
    appliedSummary?: Record<string, number>
  ): void {
    try {
      // If we received a concrete appliedSummary (abilityId -> piece count), prefer that
      const keysFromSummary = appliedSummary
        ? Object.keys(appliedSummary).filter(k => (appliedSummary[k] || 0) > 0)
        : [];
      if (keysFromSummary.length > 0) {
        if (keysFromSummary.length === 1) {
          const pretty = this.formatAbilityName(keysFromSummary[0]);
          const count = appliedSummary![keysFromSummary[0]];
          showToast(
            `Ability unlocked: ${pretty}${typeof count === 'number' ? ` — Applied to ${count} piece${count > 1 ? 's' : ''}` : ''}`,
            { level: 'success', duration: 4000 }
          );
          return;
        }

        const parts = keysFromSummary.map(k => {
          const pretty = this.formatAbilityName(k);
          const count = appliedSummary![k];
          return typeof count === 'number' ? `${pretty} (${count})` : pretty;
        });
        showToast(`Abilities unlocked: ${parts.join(', ')}`, { level: 'success', duration: 4500 });
        return;
      }

      // Fallback: use evolution node's declared ability effects (no emoji)
      const abilityEffects = (evolutionNode.effects || []).filter(e => e.type === 'ability');
      if (abilityEffects.length === 0) {
        showToast(`${evolutionNode.name} unlocked`, { level: 'success', duration: 3000 });
        return;
      }

      if (abilityEffects.length === 1) {
        const pretty = this.formatAbilityName(abilityEffects[0].target);
        showToast(`Ability unlocked: ${pretty}`, { level: 'success', duration: 4000 });
      } else {
        const parts = abilityEffects.map(a => this.formatAbilityName(a.target));
        showToast(`Abilities unlocked: ${parts.join(', ')}`, { level: 'success', duration: 4500 });
      }
    } catch (err) {
      // don't block game logic for toast failures
      // eslint-disable-next-line no-console
      console.debug('EvolutionTreeSystem.emitUnlockToast failed', err);
    }
  }
}
