import type {
  PieceType,
  PieceAttributes,
  Evolution,
  EvolutionNode,
  EvolutionTree,
  EvolutionCombination,
  ResourceCost,
  EvolutionSaveData,
  CostScaling,
  SynergyBonus,
  Ability,
  VisualMod,
  EvolutionEffect,
  // EvolutionRequirement,
  AutoPromotionConfig,
  PromotionCandidate,
} from './types';

/**
 * Core PieceEvolution class with comprehensive attribute tracking
 * Supports 10^12 evolution combinations and complex upgrade paths
 */
export class PieceEvolution {
  public readonly id: string;
  public readonly pieceType: PieceType;
  public attributes: PieceAttributes;
  public unlockedAbilities: Ability[];
  public visualModifications: VisualMod[];
  public evolutionLevel: number;
  public totalInvestment: ResourceCost;
  public timeInvested: number;
  public readonly createdAt: number;
  public lastModified: number;

  constructor(pieceType: PieceType, initialAttributes?: Partial<PieceAttributes>) {
    this.id = this.generateId();
    this.pieceType = pieceType;
    this.attributes = this.initializeAttributes(initialAttributes);
    this.unlockedAbilities = [];
    this.visualModifications = [];
    this.evolutionLevel = 1;
    this.totalInvestment = { temporalEssence: 0, mnemonicDust: 0, aetherShards: 0, arcaneMana: 0 };
    this.timeInvested = 0;
    this.createdAt = Date.now();
    this.lastModified = Date.now();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeAttributes(initial?: Partial<PieceAttributes>): PieceAttributes {
    const baseAttributes = this.getBaseAttributesForPiece(this.pieceType);
    return {
      ...baseAttributes,
      ...initial,
    };
  }

  private getBaseAttributesForPiece(pieceType: PieceType): PieceAttributes {
    const baseAttributes: Record<PieceType, PieceAttributes> = {
      p: {
        // Pawn
        moveRange: 1,
        moveSpeed: 1,
        canJump: false,
        canMoveBackward: false,
        attackPower: 1,
        defense: 1,
        captureBonus: 1,
        eleganceMultiplier: 1,
        resourceGeneration: 1,
        synergyRadius: 1,
        evolutionEfficiency: 1,
        abilitySlots: 1,
        custom: {},
      },
      r: {
        // Rook
        moveRange: 8,
        moveSpeed: 2,
        canJump: false,
        canMoveBackward: true,
        attackPower: 5,
        defense: 4,
        captureBonus: 2,
        eleganceMultiplier: 1.2,
        resourceGeneration: 2,
        synergyRadius: 2,
        evolutionEfficiency: 1.1,
        abilitySlots: 2,
        custom: {},
      },
      n: {
        // Knight
        moveRange: 3,
        moveSpeed: 3,
        canJump: true,
        canMoveBackward: true,
        attackPower: 3,
        defense: 3,
        captureBonus: 3,
        eleganceMultiplier: 1.5,
        resourceGeneration: 1.5,
        synergyRadius: 2,
        evolutionEfficiency: 1.3,
        abilitySlots: 3,
        custom: {},
      },
      b: {
        // Bishop
        moveRange: 8,
        moveSpeed: 2,
        canJump: false,
        canMoveBackward: true,
        attackPower: 3,
        defense: 3,
        captureBonus: 2,
        eleganceMultiplier: 1.3,
        resourceGeneration: 1.8,
        synergyRadius: 3,
        evolutionEfficiency: 1.2,
        abilitySlots: 2,
        custom: {},
      },
      q: {
        // Queen
        moveRange: 8,
        moveSpeed: 3,
        canJump: false,
        canMoveBackward: true,
        attackPower: 9,
        defense: 5,
        captureBonus: 4,
        eleganceMultiplier: 2,
        resourceGeneration: 3,
        synergyRadius: 4,
        evolutionEfficiency: 1.5,
        abilitySlots: 4,
        custom: {},
      },
      k: {
        // King
        moveRange: 1,
        moveSpeed: 1,
        canJump: false,
        canMoveBackward: true,
        attackPower: 2,
        defense: 10,
        captureBonus: 1,
        eleganceMultiplier: 3,
        resourceGeneration: 2,
        synergyRadius: 5,
        evolutionEfficiency: 2,
        abilitySlots: 5,
        custom: {},
      },
    };

    return { ...baseAttributes[pieceType] };
  }

  /**
   * Upgrade a specific attribute with resource cost validation
   */
  upgradeAttribute(attribute: keyof PieceAttributes, levels: number, cost: ResourceCost): boolean {
    if (typeof this.attributes[attribute] === 'number') {
      (this.attributes[attribute] as number) += levels;
      this.addInvestment(cost);
      this.evolutionLevel += levels;
      this.lastModified = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Add resource investment tracking
   */
  private addInvestment(cost: ResourceCost): void {
    this.totalInvestment.temporalEssence =
      (this.totalInvestment.temporalEssence || 0) + (cost.temporalEssence || 0);
    this.totalInvestment.mnemonicDust =
      (this.totalInvestment.mnemonicDust || 0) + (cost.mnemonicDust || 0);
    this.totalInvestment.aetherShards =
      (this.totalInvestment.aetherShards || 0) + (cost.aetherShards || 0);
    this.totalInvestment.arcaneMana =
      (this.totalInvestment.arcaneMana || 0) + (cost.arcaneMana || 0);
  }

  /**
   * Add time investment for auto-promotion system
   */
  addTimeInvestment(milliseconds: number): void {
    this.timeInvested += milliseconds;
    this.lastModified = Date.now();
  }

  /**
   * Unlock a new ability
   */
  unlockAbility(ability: Ability): boolean {
    if (this.unlockedAbilities.length < this.attributes.abilitySlots) {
      this.unlockedAbilities.push(ability);
      this.lastModified = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Add visual modification
   */
  addVisualModification(mod: VisualMod): void {
    this.visualModifications.push(mod);
    this.lastModified = Date.now();
  }

  /**
   * Calculate total power score for combination tracking
   */
  calculatePowerScore(): number {
    const attributeScore = Object.values(this.attributes)
      .filter(val => typeof val === 'number')
      .reduce((sum, val) => sum + (val as number), 0);

    const abilityScore = this.unlockedAbilities.length * 10;
    const levelBonus = this.evolutionLevel * 5;

    return attributeScore + abilityScore + levelBonus;
  }

  /**
   * Generate hash for combination tracking
   */
  generateHash(): string {
    const data = {
      pieceType: this.pieceType,
      attributes: this.attributes,
      abilities: this.unlockedAbilities.map(a => a.id).sort(),
      level: this.evolutionLevel,
    };

    return this.hashObject(data);
  }

  private hashObject(obj: any): string {
    // Create a deterministic string representation
    const sortedStr = JSON.stringify(obj, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Sort object keys for consistent ordering
        const sorted: any = {};
        Object.keys(value)
          .sort()
          .forEach(k => {
            sorted[k] = value[k];
          });
        return sorted;
      }
      return value;
    });

    let hash = 0;
    for (let i = 0; i < sortedStr.length; i++) {
      const char = sortedStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

/**
 * Evolution cost calculator with scaling algorithms
 */
export class EvolutionCostCalculator {
  private costScaling: CostScaling;

  constructor(costScaling?: Partial<CostScaling>) {
    this.costScaling = {
      baseMultiplier: 1.5,
      levelExponent: 1.2,
      tierMultiplier: 2.0,
      rarityMultiplier: {
        common: 1.0,
        uncommon: 1.5,
        rare: 2.5,
        epic: 4.0,
        legendary: 7.0,
      },
      timeDecayFactor: 0.95,
      ...costScaling,
    };
  }

  calculateBaseCost(evolution: Evolution): ResourceCost {
    const baseCost: ResourceCost = { ...evolution.cost };
    const rarityMultiplier = this.costScaling.rarityMultiplier[evolution.rarity];
    const tierMultiplier = Math.pow(this.costScaling.tierMultiplier, evolution.tier - 1);

    return {
      temporalEssence: Math.floor(
        (baseCost.temporalEssence || 0) * rarityMultiplier * tierMultiplier
      ),
      mnemonicDust: Math.floor((baseCost.mnemonicDust || 0) * rarityMultiplier * tierMultiplier),
      aetherShards: Math.floor((baseCost.aetherShards || 0) * rarityMultiplier * tierMultiplier),
      arcaneMana: Math.floor((baseCost.arcaneMana || 0) * rarityMultiplier * tierMultiplier),
    };
  }

  calculateScaledCost(evolution: Evolution, currentLevel: number): ResourceCost {
    const baseCost = this.calculateBaseCost(evolution);
    const levelMultiplier =
      Math.pow(currentLevel, this.costScaling.levelExponent) * this.costScaling.baseMultiplier;

    return {
      temporalEssence: Math.floor((baseCost.temporalEssence || 0) * levelMultiplier),
      mnemonicDust: Math.floor((baseCost.mnemonicDust || 0) * levelMultiplier),
      aetherShards: Math.floor((baseCost.aetherShards || 0) * levelMultiplier),
      arcaneMana: Math.floor((baseCost.arcaneMana || 0) * levelMultiplier),
    };
  }

  calculateBulkDiscount(evolutions: Evolution[]): number {
    if (evolutions.length <= 1) return 1.0;

    // Bulk discount: 5% per additional evolution, max 50%
    const discount = Math.min(0.5, (evolutions.length - 1) * 0.05);
    return 1.0 - discount;
  }

  calculateTimeBonus(timeInvested: number): number {
    // Time bonus: reduces cost based on time invested (in hours)
    const hoursInvested = timeInvested / (1000 * 60 * 60);
    const bonus = Math.pow(this.costScaling.timeDecayFactor, hoursInvested);
    return Math.max(0.1, bonus); // Minimum 10% of original cost
  }
}

/**
 * Main PieceEvolutionSystem class with comprehensive evolution management
 */
export class PieceEvolutionSystem {
  private evolutions: Map<string, PieceEvolution> = new Map();
  private evolutionTrees: Map<PieceType, EvolutionTree> = new Map();
  private combinations: Map<string, EvolutionCombination> = new Map();
  private costCalculator: EvolutionCostCalculator;
  private totalCombinationsTracked: bigint = BigInt(0);

  constructor() {
    this.costCalculator = new EvolutionCostCalculator();
    this.initializeEvolutionTrees();
  }

  /**
   * Initialize evolution trees for all piece types
   */
  private initializeEvolutionTrees(): void {
    const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

    pieceTypes.forEach(pieceType => {
      this.evolutionTrees.set(pieceType, this.createEvolutionTree(pieceType));
    });
  }

  /**
   * Create evolution tree structure for a piece type
   */
  private createEvolutionTree(pieceType: PieceType): EvolutionTree {
    const rootNodes = this.createRootEvolutions(pieceType);

    return {
      pieceType,
      rootNodes,
      maxTier: 5,
      totalNodes: this.countTreeNodes(rootNodes),
    };
  }

  /**
   * Create root evolution nodes for a piece type
   */
  private createRootEvolutions(pieceType: PieceType): EvolutionNode[] {
    // Create basic evolution paths for each piece type
    const evolutions = this.getBasicEvolutions(pieceType);

    return evolutions.map((evolution, index) => ({
      evolution,
      children: [],
      requirements: evolution.requirements,
      unlocked: evolution.tier === 1, // Tier 1 evolutions start unlocked
      position: { x: index * 200, y: 0 },
    }));
  }

  /**
   * Get basic evolutions for a piece type
   */
  private getBasicEvolutions(pieceType: PieceType): Evolution[] {
    const baseEvolutions: Record<PieceType, Evolution[]> = {
      p: [
        {
          id: `${pieceType}-speed-1`,
          name: 'Swift Pawn',
          description: 'Increases movement speed',
          pieceType,
          cost: { temporalEssence: 10 },
          effects: [{ type: 'attribute', target: 'moveSpeed', value: 1, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'common',
        },
        {
          id: `${pieceType}-power-1`,
          name: 'Strong Pawn',
          description: 'Increases attack power',
          pieceType,
          cost: { temporalEssence: 15 },
          effects: [{ type: 'attribute', target: 'attackPower', value: 1, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'common',
        },
      ],
      r: [
        {
          id: `${pieceType}-range-1`,
          name: 'Extended Rook',
          description: 'Increases movement range',
          pieceType,
          cost: { temporalEssence: 25, mnemonicDust: 5 },
          effects: [{ type: 'attribute', target: 'moveRange', value: 2, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'common',
        },
      ],
      n: [
        {
          id: `${pieceType}-jump-1`,
          name: 'Leaping Knight',
          description: 'Enhanced jumping ability',
          pieceType,
          cost: { temporalEssence: 20, mnemonicDust: 10 },
          effects: [{ type: 'attribute', target: 'moveRange', value: 1, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'uncommon',
        },
      ],
      b: [
        {
          id: `${pieceType}-diagonal-1`,
          name: 'Piercing Bishop',
          description: 'Enhanced diagonal movement',
          pieceType,
          cost: { temporalEssence: 30, mnemonicDust: 8 },
          effects: [{ type: 'attribute', target: 'attackPower', value: 2, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'common',
        },
      ],
      q: [
        {
          id: `${pieceType}-royal-1`,
          name: 'Majestic Queen',
          description: 'Royal presence enhancement',
          pieceType,
          cost: { temporalEssence: 50, mnemonicDust: 20, arcaneMana: 5 },
          effects: [{ type: 'attribute', target: 'synergyRadius', value: 1, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'rare',
        },
      ],
      k: [
        {
          id: `${pieceType}-fortress-1`,
          name: 'Fortress King',
          description: 'Enhanced defensive capabilities',
          pieceType,
          cost: { temporalEssence: 40, mnemonicDust: 15, arcaneMana: 10 },
          effects: [{ type: 'attribute', target: 'defense', value: 5, operation: 'add' }],
          requirements: [],
          tier: 1,
          rarity: 'uncommon',
        },
      ],
    };

    return baseEvolutions[pieceType] || [];
  }

  /**
   * Count total nodes in evolution tree
   */
  private countTreeNodes(nodes: EvolutionNode[]): number {
    return nodes.reduce((count, node) => {
      return count + 1 + this.countTreeNodes(node.children);
    }, 0);
  }

  // Evolution management methods
  evolvePiece(pieceType: PieceType, attribute: string, cost: ResourceCost): boolean {
    const evolutionKey = `${pieceType}-${Date.now()}`;
    let evolution = this.evolutions.get(evolutionKey);

    if (!evolution) {
      evolution = new PieceEvolution(pieceType);
      this.evolutions.set(evolution.id, evolution); // Store by evolution ID, not timestamp key
    }

    // Validate attribute exists and is upgradeable
    if (!(attribute in evolution.attributes)) {
      return false;
    }

    // Apply the evolution
    const success = evolution.upgradeAttribute(attribute as keyof PieceAttributes, 1, cost);

    if (success) {
      this.updateCombinationTracking(evolution);
    }

    return success;
  }

  /**
   * Upgrade piece with resource validation
   */
  upgradePieceWithValidation(
    pieceId: string,
    evolutionId: string,
    resourceManager: {
      canAfford: (cost: ResourceCost) => boolean;
      spendResources: (cost: ResourceCost) => boolean;
    }
  ): boolean {
    const piece = this.evolutions.get(pieceId);
    if (!piece) {
      return false;
    }

    const evolution = this.findEvolutionById(evolutionId);
    if (!evolution) {
      return false;
    }

    // Check if requirements are met
    if (!this.checkEvolutionRequirements(piece, evolution)) {
      return false;
    }

    // Calculate actual cost with scaling
    const actualCost = this.costCalculator.calculateScaledCost(evolution, piece.evolutionLevel);

    // Validate resources
    if (!resourceManager.canAfford(actualCost)) {
      return false;
    }

    // Spend resources
    if (!resourceManager.spendResources(actualCost)) {
      return false;
    }

    // Apply evolution effects
    this.applyEvolutionEffects(piece, evolution);

    // Update combination tracking
    this.updateCombinationTracking(piece);

    return true;
  }

  /**
   * Auto-promotion system for pawns based on time investment
   */
  checkAutoPromotion(pieceId: string, config: AutoPromotionConfig): PromotionCandidate | null {
    const piece = this.evolutions.get(pieceId);
    if (!piece || piece.pieceType !== 'p' || !config.enabled) {
      return null;
    }

    // Check time threshold
    if (piece.timeInvested < config.timeThreshold) {
      return null;
    }

    // Check attribute thresholds
    const meetsAttributeThresholds = Object.entries(config.attributeThresholds).every(
      ([attr, threshold]) => {
        const value = piece.attributes[attr as keyof PieceAttributes];
        return typeof value === 'number' && value >= threshold;
      }
    );

    if (!meetsAttributeThresholds) {
      return null;
    }

    // Check required evolutions
    const hasRequiredEvolutions = config.requiredEvolutions.every(evolutionId =>
      piece.unlockedAbilities.some(ability => ability.id === evolutionId)
    );

    if (!hasRequiredEvolutions) {
      return null;
    }

    // Calculate promotion score
    const promotionScore = this.calculatePromotionScore(piece, config);

    return {
      pieceEvolution: piece,
      timeInvested: piece.timeInvested,
      meetsRequirements: true,
      promotionScore,
      recommendedTarget: config.promotionTarget,
    };
  }

  /**
   * Process auto-promotion for a pawn
   */
  processAutoPromotion(candidate: PromotionCandidate): PieceEvolution {
    const oldPiece = candidate.pieceEvolution;

    // Create new evolved piece
    const newPiece = new PieceEvolution(candidate.recommendedTarget, oldPiece.attributes);
    newPiece.evolutionLevel = oldPiece.evolutionLevel;
    newPiece.totalInvestment = { ...oldPiece.totalInvestment };
    newPiece.timeInvested = oldPiece.timeInvested;
    newPiece.unlockedAbilities = [...oldPiece.unlockedAbilities];
    newPiece.visualModifications = [...oldPiece.visualModifications];

    // Apply promotion bonuses
    this.applyPromotionBonuses(newPiece, candidate.promotionScore);

    // Replace old piece with new one
    this.evolutions.delete(oldPiece.id);
    this.evolutions.set(newPiece.id, newPiece);

    // Update combination tracking
    this.updateCombinationTracking(newPiece);

    return newPiece;
  }

  /**
   * Calculate synergy bonuses between evolved pieces
   */
  calculateSynergyBonuses(pieces: PieceEvolution[]): SynergyBonus[] {
    const activeBonuses: SynergyBonus[] = [];

    // Check all possible synergy combinations
    for (const bonus of this.getAllPossibleSynergies()) {
      if (this.checkSynergyRequirements(pieces, bonus)) {
        activeBonuses.push(bonus);
      }
    }

    return activeBonuses;
  }

  /**
   * Apply synergy bonuses to pieces
   */
  applySynergyBonuses(pieces: PieceEvolution[], bonuses: SynergyBonus[]): void {
    for (const bonus of bonuses) {
      for (const piece of pieces) {
        if (bonus.pieces.includes(piece.pieceType)) {
          this.applySynergyEffectsTopiece(piece, bonus);
        }
      }
    }
  }

  getEvolutionTree(pieceType: PieceType): EvolutionNode[] {
    const tree = this.evolutionTrees.get(pieceType);
    return tree ? tree.rootNodes : [];
  }

  /**
   * Calculate total evolution combinations supporting 10^12 variations
   * Uses efficient combination tracking to handle massive scale
   */
  calculateEvolutionCombinations(): bigint {
    // Each piece type has multiple evolution paths
    // Each path has multiple tiers (5 tiers)
    // Each tier has multiple options (average 3-5 per tier)
    // Each option has multiple levels (up to 100 levels per attribute)

    let totalCombinations = BigInt(1);

    for (const [_pieceType, tree] of this.evolutionTrees) {
      // Calculate combinations for this piece type
      const pieceCombinations = this.calculatePieceCombinations(tree);
      totalCombinations = totalCombinations * pieceCombinations;
    }

    // Account for synergy combinations between pieces
    const synergyMultiplier = BigInt(Math.pow(2, 6)); // 2^6 for piece interactions
    totalCombinations = totalCombinations * synergyMultiplier;

    this.totalCombinationsTracked = totalCombinations;
    return totalCombinations;
  }

  /**
   * Calculate combinations for a single piece type
   */
  private calculatePieceCombinations(tree: EvolutionTree): bigint {
    let combinations = BigInt(1);

    // For each tier, calculate possible combinations
    for (let tier = 1; tier <= tree.maxTier; tier++) {
      const tierNodes = this.getNodesAtTier(tree.rootNodes, tier);
      if (tierNodes.length > 0) {
        const tierCombinations = BigInt(tierNodes.length * 100); // 100 levels per evolution
        combinations = combinations * tierCombinations;
      }
    }

    // If no combinations were found, return a base number for this piece type
    if (combinations === BigInt(1)) {
      // Each piece has at least basic attribute variations
      combinations = BigInt(Math.pow(100, 10)); // 100^10 for 10 attributes with 100 levels each
    }

    return combinations;
  }

  /**
   * Get nodes at specific tier
   */
  private getNodesAtTier(nodes: EvolutionNode[], tier: number): EvolutionNode[] {
    const result: EvolutionNode[] = [];

    for (const node of nodes) {
      if (node.evolution.tier === tier) {
        result.push(node);
      }
      result.push(...this.getNodesAtTier(node.children, tier));
    }

    return result;
  }

  /**
   * Update combination tracking when evolution occurs
   */
  private updateCombinationTracking(evolution: PieceEvolution): void {
    const hash = evolution.generateHash();

    if (!this.combinations.has(hash)) {
      const combination: EvolutionCombination = {
        id: hash,
        pieceEvolutions: new Map([[evolution.pieceType, evolution]]),
        combinationHash: hash,
        synergyBonuses: [],
        totalPower: evolution.calculatePowerScore(),
        discoveredAt: Date.now(),
      };

      this.combinations.set(hash, combination);
      this.totalCombinationsTracked = this.totalCombinationsTracked + BigInt(1);
      // Notify ProgressTracker about new discovered combination so achievements
      // like powerful_combination and combination_collector are considered.
      try {
        // Import lazily to avoid circular dependency at module load time
        void (async () => {
          try {
            const { progressTracker } = await import('../save/ProgressTracker');
            if (
              progressTracker &&
              typeof progressTracker.trackEvolutionCombination === 'function'
            ) {
              try {
                await progressTracker.trackEvolutionCombination(
                  new Map([[evolution.pieceType, evolution]])
                );
              } catch (err) {
                console.warn('Failed to notify ProgressTracker of combination discovery:', err);
              }
            }
          } catch (err) {
            // Ignore - progress tracker may not be available in some contexts (tests)
          }
        })();
      } catch (err) {
        // Ignore - progress tracker may not be available in some contexts (tests)
      }
    }
  }

  // Resource integration
  canAffordEvolution(_evolution: Evolution): boolean {
    // This would typically check against a resource manager
    // For now, return true as resource validation happens elsewhere
    return true;
  }

  applyEvolutionEffects(piece: PieceEvolution, evolution: Evolution): void {
    evolution.effects.forEach(effect => {
      switch (effect.type) {
        case 'attribute':
          this.applyAttributeEffect(piece, effect);
          break;
        case 'ability':
          this.applyAbilityEffect(piece, effect);
          break;
        case 'visual':
          this.applyVisualEffect(piece, effect);
          break;
        case 'synergy':
          this.applySynergyEffect(piece, effect);
          break;
      }
    });
  }

  private applyAttributeEffect(piece: PieceEvolution, effect: EvolutionEffect): void {
    const target = effect.target as keyof PieceAttributes;
    const currentValue = piece.attributes[target];

    if (typeof currentValue === 'number' && typeof effect.value === 'number') {
      switch (effect.operation) {
        case 'add':
          (piece.attributes[target] as number) += effect.value;
          break;
        case 'multiply':
          (piece.attributes[target] as number) *= effect.value;
          break;
        case 'set':
          (piece.attributes as any)[target] = effect.value;
          break;
      }
    }
  }

  private applyAbilityEffect(piece: PieceEvolution, effect: EvolutionEffect): void {
    if (effect.operation === 'unlock' && typeof effect.value === 'object') {
      piece.unlockAbility(effect.value as Ability);
    }
  }

  private applyVisualEffect(piece: PieceEvolution, effect: EvolutionEffect): void {
    if (effect.operation === 'unlock' && typeof effect.value === 'object') {
      piece.addVisualModification(effect.value as VisualMod);
    }
  }

  private applySynergyEffect(_piece: PieceEvolution, _effect: EvolutionEffect): void {
    // Synergy effects would be applied at the board level
    // This is a placeholder for future implementation
  }

  // Serialization for save system
  serializeEvolutions(): EvolutionSaveData {
    const combinations = Array.from(this.combinations.values());

    return {
      version: '1.0.0',
      evolutions: Array.from(this.evolutions.values()),
      combinations,
      unlockedNodes: this.getUnlockedNodeIds(),
      synergyBonuses: this.getActiveSynergyBonuses(),
      totalCombinations: this.totalCombinationsTracked.toString(),
      timestamp: Date.now(),
      checksum: this.generateChecksum(),
    };
  }

  private getUnlockedNodeIds(): string[] {
    const unlockedIds: string[] = [];

    for (const tree of this.evolutionTrees.values()) {
      this.collectUnlockedNodes(tree.rootNodes, unlockedIds);
    }

    return unlockedIds;
  }

  private collectUnlockedNodes(nodes: EvolutionNode[], unlockedIds: string[]): void {
    for (const node of nodes) {
      if (node.unlocked) {
        unlockedIds.push(node.evolution.id);
      }
      this.collectUnlockedNodes(node.children, unlockedIds);
    }
  }

  private getActiveSynergyBonuses(): SynergyBonus[] {
    // Return active synergy bonuses
    // This would be calculated based on current piece combinations
    return [];
  }

  private generateChecksum(): string {
    const data = {
      evolutions: this.evolutions.size,
      combinations: this.combinations.size,
      totalCombinations: this.totalCombinationsTracked.toString(),
    };

    return JSON.stringify(data);
  }

  deserializeEvolutions(data: EvolutionSaveData): void {
    // Clear existing data
    this.evolutions.clear();
    this.combinations.clear();

    // Restore evolutions
    data.evolutions.forEach(evolutionData => {
      const evolution = new PieceEvolution(evolutionData.pieceType, evolutionData.attributes);
      evolution.evolutionLevel = evolutionData.evolutionLevel;
      evolution.totalInvestment = evolutionData.totalInvestment;
      evolution.timeInvested = evolutionData.timeInvested;
      evolution.unlockedAbilities = evolutionData.unlockedAbilities;
      evolution.visualModifications = evolutionData.visualModifications;

      this.evolutions.set(evolution.id, evolution);
    });

    // Restore combinations
    data.combinations?.forEach(combinationData => {
      this.combinations.set(combinationData.id, combinationData);
    });

    // Restore total combinations count
    if (data.totalCombinations) {
      this.totalCombinationsTracked = BigInt(data.totalCombinations);
    }

    // Unlock nodes based on saved data
    if (data.unlockedNodes) {
      this.unlockNodes(data.unlockedNodes);
    }
  }

  private unlockNodes(nodeIds: string[]): void {
    for (const tree of this.evolutionTrees.values()) {
      this.unlockNodesInTree(tree.rootNodes, nodeIds);
    }
  }

  private unlockNodesInTree(nodes: EvolutionNode[], nodeIds: string[]): void {
    for (const node of nodes) {
      if (nodeIds.includes(node.evolution.id)) {
        node.unlocked = true;
      }
      this.unlockNodesInTree(node.children, nodeIds);
    }
  }

  // Helper methods for new functionality
  private findEvolutionById(evolutionId: string): Evolution | null {
    for (const tree of this.evolutionTrees.values()) {
      const evolution = this.findEvolutionInTree(tree.rootNodes, evolutionId);
      if (evolution) {
        return evolution;
      }
    }
    return null;
  }

  private findEvolutionInTree(nodes: EvolutionNode[], evolutionId: string): Evolution | null {
    for (const node of nodes) {
      if (node.evolution.id === evolutionId) {
        return node.evolution;
      }
      const childResult = this.findEvolutionInTree(node.children, evolutionId);
      if (childResult) {
        return childResult;
      }
    }
    return null;
  }

  private checkEvolutionRequirements(piece: PieceEvolution, evolution: Evolution): boolean {
    return evolution.requirements.every(req => {
      switch (req.type) {
        case 'level':
          return this.compareValues(piece.evolutionLevel, req.operator, Number(req.value));
        case 'attribute': {
          const attrValue = piece.attributes[req.key as keyof PieceAttributes];
          return (
            typeof attrValue === 'number' &&
            this.compareValues(attrValue, req.operator, Number(req.value))
          );
        }
        case 'time':
          return this.compareValues(piece.timeInvested, req.operator, Number(req.value));
        case 'evolution':
          return piece.unlockedAbilities.some(ability => ability.id === req.value);
        default:
          return true;
      }
    });
  }

  private compareValues(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case '=':
        return actual === expected;
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      default:
        return false;
    }
  }

  private calculatePromotionScore(piece: PieceEvolution, config: AutoPromotionConfig): number {
    let score = 0;

    // Time investment bonus
    const hoursInvested = piece.timeInvested / (1000 * 60 * 60);
    score += hoursInvested * 10;

    // Attribute bonuses
    Object.entries(config.attributeThresholds).forEach(([attr, threshold]) => {
      const value = piece.attributes[attr as keyof PieceAttributes];
      if (typeof value === 'number' && value > threshold) {
        score += (value - threshold) * 5;
      }
    });

    // Evolution level bonus
    score += piece.evolutionLevel * 20;

    // Ability bonus
    score += piece.unlockedAbilities.length * 15;

    return Math.round(score);
  }

  private applyPromotionBonuses(piece: PieceEvolution, promotionScore: number): void {
    // Apply bonuses based on promotion score
    const bonusMultiplier = Math.min(2.0, 1 + promotionScore / 1000);

    // Boost key attributes
    piece.attributes.attackPower = Math.round(piece.attributes.attackPower * bonusMultiplier);
    piece.attributes.defense = Math.round(piece.attributes.defense * bonusMultiplier);
    piece.attributes.eleganceMultiplier *= bonusMultiplier;
    piece.attributes.resourceGeneration *= bonusMultiplier;
  }

  private getAllPossibleSynergies(): SynergyBonus[] {
    return [
      {
        id: 'royal-guard',
        name: 'Royal Guard',
        description: 'King and Queen synergy provides defensive bonuses',
        pieces: ['k', 'q'],
        requirements: [{ type: 'evolution_level', key: 'level', value: 5, operator: '>=' }],
        effects: [{ type: 'attribute_bonus', target: 'defense', value: '25%' }],
        multiplier: 1.25,
      },
      {
        id: 'cavalry-charge',
        name: 'Cavalry Charge',
        description: 'Multiple knights provide movement bonuses',
        pieces: ['n', 'n'],
        requirements: [{ type: 'evolution_level', key: 'level', value: 3, operator: '>=' }],
        effects: [{ type: 'attribute_bonus', target: 'moveSpeed', value: '50%' }],
        multiplier: 1.5,
      },
      {
        id: 'fortress-wall',
        name: 'Fortress Wall',
        description: 'Rooks provide defensive formation bonuses',
        pieces: ['r', 'r'],
        requirements: [{ type: 'evolution_level', key: 'level', value: 4, operator: '>=' }],
        effects: [
          { type: 'attribute_bonus', target: 'defense', value: '40%' },
          { type: 'resource_bonus', target: 'temporalEssence', value: '20%' },
        ],
        multiplier: 1.4,
      },
      {
        id: 'divine-blessing',
        name: 'Divine Blessing',
        description: 'Bishops provide spiritual enhancement',
        pieces: ['b', 'b'],
        requirements: [{ type: 'evolution_level', key: 'level', value: 6, operator: '>=' }],
        effects: [
          { type: 'attribute_bonus', target: 'eleganceMultiplier', value: '60%' },
          { type: 'resource_bonus', target: 'arcaneMana', value: '30%' },
        ],
        multiplier: 1.6,
      },
      {
        id: 'pawn-storm',
        name: 'Pawn Storm',
        description: 'Multiple evolved pawns create overwhelming pressure',
        pieces: ['p', 'p', 'p'],
        requirements: [{ type: 'evolution_level', key: 'level', value: 8, operator: '>=' }],
        effects: [
          { type: 'attribute_bonus', target: 'attackPower', value: '75%' },
          { type: 'special', target: 'breakthrough', value: 'enabled' },
        ],
        multiplier: 1.75,
      },
    ];
  }

  private checkSynergyRequirements(pieces: PieceEvolution[], bonus: SynergyBonus): boolean {
    // Check if we have the required piece types
    const pieceTypeCounts = new Map<PieceType, number>();
    pieces.forEach(piece => {
      pieceTypeCounts.set(piece.pieceType, (pieceTypeCounts.get(piece.pieceType) || 0) + 1);
    });

    const requiredCounts = new Map<PieceType, number>();
    bonus.pieces.forEach(pieceType => {
      requiredCounts.set(pieceType, (requiredCounts.get(pieceType) || 0) + 1);
    });

    for (const [pieceType, requiredCount] of requiredCounts) {
      if ((pieceTypeCounts.get(pieceType) || 0) < requiredCount) {
        return false;
      }
    }

    // Check synergy requirements
    const relevantPieces = pieces.filter(piece => bonus.pieces.includes(piece.pieceType));
    return bonus.requirements.every(req => {
      switch (req.type) {
        case 'evolution_level':
          return relevantPieces.every(piece =>
            this.compareValues(piece.evolutionLevel, req.operator, Number(req.value))
          );
        case 'attribute':
          return relevantPieces.every(piece => {
            const attrValue = piece.attributes[req.key as keyof PieceAttributes];
            return (
              typeof attrValue === 'number' &&
              this.compareValues(attrValue, req.operator, Number(req.value))
            );
          });
        default:
          return true;
      }
    });
  }

  private applySynergyEffectsTopiece(piece: PieceEvolution, bonus: SynergyBonus): void {
    bonus.effects.forEach(effect => {
      switch (effect.type) {
        case 'attribute_bonus':
          this.applyAttributeBonus(piece, effect.target, String(effect.value), bonus.multiplier);
          break;
        case 'resource_bonus':
          // Resource bonuses would be applied at the game level
          break;
        case 'special':
          this.applySpecialSynergyEffect(piece, effect.target, String(effect.value));
          break;
      }
    });
  }

  private applyAttributeBonus(
    piece: PieceEvolution,
    target: string,
    value: string,
    multiplier: number
  ): void {
    const attribute = piece.attributes[target as keyof PieceAttributes];
    if (typeof attribute === 'number') {
      if (value.endsWith('%')) {
        const percentage = parseFloat(value.replace('%', '')) / 100;
        (piece.attributes as any)[target] = Math.round(attribute * (1 + percentage * multiplier));
      } else {
        const bonus = parseFloat(value) * multiplier;
        (piece.attributes as any)[target] = Math.round(attribute + bonus);
      }
    }
  }

  private applySpecialSynergyEffect(piece: PieceEvolution, target: string, value: string): void {
    // Apply special synergy effects
    if (target === 'breakthrough' && value === 'enabled') {
      // Add breakthrough ability to pawn
      const breakthroughAbility: Ability = {
        id: 'breakthrough',
        name: 'Breakthrough',
        description: 'Can move through enemy pieces',
        type: 'movement',
        effect: { type: 'movement', value: 'breakthrough' },
      };

      if (!piece.unlockedAbilities.some(a => a.id === 'breakthrough')) {
        piece.unlockAbility(breakthroughAbility);
      }
    }
  }

  // Additional utility methods
  getPieceEvolution(pieceId: string): PieceEvolution | undefined {
    return this.evolutions.get(pieceId);
  }

  getAllEvolutions(): PieceEvolution[] {
    return Array.from(this.evolutions.values());
  }

  getEvolutionsByPieceType(pieceType: PieceType): PieceEvolution[] {
    return Array.from(this.evolutions.values()).filter(e => e.pieceType === pieceType);
  }

  getCombinationCount(): bigint {
    return this.totalCombinationsTracked;
  }

  getDiscoveredCombinations(): EvolutionCombination[] {
    return Array.from(this.combinations.values());
  }

  /**
   * Get all abilities for a piece type from both the old system and the new evolution tree system
   */
  getAllAbilitiesForPiece(pieceType: PieceType): Ability[] {
    // Get abilities from the old system (individual piece evolutions)
    const allEvolutions = this.getEvolutionsByPieceType(pieceType);
    const oldSystemAbilities = allEvolutions.flatMap(e => e.unlockedAbilities);

    // Get abilities from the new evolution tree system
    // This would integrate with the EvolutionTreeSystem
    // For now, we'll just return the old system abilities
    return oldSystemAbilities;
  }

  /**
   * Get all attribute bonuses for a piece type from both systems
   */
  getAllAttributeBonusesForPiece(pieceType: PieceType): Partial<PieceAttributes> {
    // Get attribute bonuses from the old system (individual piece evolutions)
    const allEvolutions = this.getEvolutionsByPieceType(pieceType);
    const combinedAttributes: Partial<PieceAttributes> = {};

    // Create a temporary PieceEvolution to access the base attributes method
    const tempEvolution = new PieceEvolution(pieceType);

    allEvolutions.forEach(evolution => {
      Object.entries(evolution.attributes).forEach(([key, value]) => {
        if (typeof value === 'number') {
          const baseValue = tempEvolution.attributes[key as keyof PieceAttributes] as number;
          const bonus = value - baseValue;

          if (bonus > 0) {
            (combinedAttributes as any)[key] = ((combinedAttributes as any)[key] || 0) + bonus;
          }
        }
      });
    });

    return combinedAttributes;
  }
}
