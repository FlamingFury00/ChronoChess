import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import type { GameState, Move, PieceType } from '../engine/types';
import type { IPieceEvolution } from '../evolution/types';
import type {
  ParticleSystem,
  AestheticBooster,
  EffectTypeValue,
  QualityLevelValue,
  PerformanceMonitor,
} from './types';
import { QualityLevel } from './types';
import { AnimationSystem } from './AnimationSystem';
import { PhysicsEffects } from '../physics/PhysicsEffects';

export class ThreeJSRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private board: THREE.Group;
  private pieces: Map<string, THREE.Group> = new Map();
  private animationSystem: AnimationSystem;
  private physicsEffects: PhysicsEffects;
  private performanceMonitor: PerformanceMonitor;
  private currentQuality: QualityLevelValue = QualityLevel.HIGH;
  private frameCount = 0;
  private lastFrameTime = 0;

  // Board interaction
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private boardSquares: Map<string, THREE.Mesh> = new Map();
  private originalMaterials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private onSquareClick?: (square: string) => void;
  private selectedSquare: string | null = null;
  private validMoveSquares: Set<string> = new Set();

  // Chess-specific properties matching HTML implementation
  private squareSize = 1;
  private basePieceScale = 0.38;
  private skybox!: THREE.Mesh;

  // Materials for different piece states
  private pieceMaterials = {
    w: new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.5 }),
    b: new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.3, roughness: 0.5 }),
    entrenched_w: new THREE.MeshStandardMaterial({
      color: 0xfffacd,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0xaaaa00,
      emissiveIntensity: 0.3,
    }),
    entrenched_b: new THREE.MeshStandardMaterial({
      color: 0x505070,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x202050,
      emissiveIntensity: 0.3,
    }),
    shield: new THREE.MeshStandardMaterial({
      color: 0x61afef,
      transparent: true,
      opacity: 0.4,
      emissive: 0x307fef,
      emissiveIntensity: 0.3,
    }),
    // Evolution level materials
    evolved_w_1: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x004488,
      emissiveIntensity: 0.2,
    }),
    evolved_b_1: new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x004488,
      emissiveIntensity: 0.2,
    }),
    evolved_w_2: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.5,
      roughness: 0.3,
      emissive: 0x0088ff,
      emissiveIntensity: 0.4,
    }),
    evolved_b_2: new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.5,
      roughness: 0.3,
      emissive: 0x0088ff,
      emissiveIntensity: 0.4,
    }),
    evolved_w_3: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0x00ffaa,
      emissiveIntensity: 0.6,
    }),
    evolved_b_3: new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0x00ffaa,
      emissiveIntensity: 0.6,
    }),
  };

  constructor(canvas: HTMLCanvasElement) {
    // Initialize scene
    this.scene = new THREE.Scene();

    // Create skybox matching HTML implementation
    this.createSkybox();

    // Initialize camera with settings matching HTML
    this.camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / Math.max(1, canvas.clientHeight),
      0.1,
      1000
    );
    this.camera.position.set(0, 9.5, 10.5);
    this.camera.lookAt(0, 0.5, 0);

    // Initialize interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Initialize renderer with settings matching HTML
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Initialize orbital controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.target.set(0, 0, 0);

    // Configure OrbitControls for mobile compatibility
    if (window.innerWidth <= 768) {
      // Reduce sensitivity on mobile to make scrolling easier
      this.controls.rotateSpeed = 0.5;
      this.controls.zoomSpeed = 0.5;
      this.controls.enablePan = false; // Disable panning to avoid scroll conflicts
    }

    // Initialize board group
    this.board = new THREE.Group();
    this.scene.add(this.board);

    // Initialize animation system
    this.animationSystem = new AnimationSystem(this.scene);

    // Initialize physics effects
    this.physicsEffects = new PhysicsEffects(this.scene);

    // Initialize performance monitoring
    this.performanceMonitor = {
      fps: 60,
      frameTime: 16.67,
      memoryUsage: 0,
      drawCalls: 0,
      triangles: 0,
    };

    this.initializeScene();
    this.setupInteraction(canvas);
  }

  // Scene management
  initializeScene(): void {
    this.setupOptimizedLighting();
    this.createChessBoard();
    this.createInitialPieces();
  }

  private createSkybox(): void {
    const skyGeometry = new THREE.SphereGeometry(500, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x3a4f6f) },
        bottomColor: { value: new THREE.Color(0x1a2533) },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });

    this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(this.skybox);
  }

  private setupOptimizedLighting(): void {
    // Lighting setup matching HTML implementation
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 8);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.bias = -0.0005;
    this.scene.add(directionalLight);
  }

  private createChessBoard(): void {
    const squareSize = this.squareSize;
    const squareGeometry = new THREE.PlaneGeometry(squareSize, squareSize);

    // Create chess board squares matching the HTML implementation
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const isLight = (row + col) % 2 === 0;
        const squareMaterial = new THREE.MeshStandardMaterial({
          color: isLight ? 0xd1d1d1 : 0x5f5f6f,
          metalness: 0.1,
          roughness: 0.8,
        });

        const square = new THREE.Mesh(squareGeometry, squareMaterial);
        square.rotation.x = -Math.PI / 2;
        square.position.set(
          col * squareSize - squareSize * 3.5,
          0,
          row * squareSize - squareSize * 3.5
        );
        square.receiveShadow = true;
        square.userData = { row, col, isLight };

        // Store square reference for interaction
        const squareName = String.fromCharCode(97 + col) + (8 - row);
        this.boardSquares.set(squareName, square);

        // Store original material for restoration
        this.originalMaterials.set(squareName, squareMaterial.clone());

        this.board.add(square);
      }
    }

    // Add board coordinates (a-h, 1-8)
    this.addBoardCoordinates();
  }

  private addBoardCoordinates(): void {
    // Add simple geometric markers to indicate board orientation
    // In a full implementation, you would load a font and create text geometry

    const markerGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });

    // Add corner markers to indicate board orientation (a1 corner)
    const cornerMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    cornerMarker.position.set(-4, 0.1, -4);
    this.board.add(cornerMarker);

    // Add edge markers for files (a-h)
    for (let file = 0; file < 8; file++) {
      const fileMarker = new THREE.Mesh(markerGeometry.clone(), markerMaterial.clone());
      fileMarker.position.set(file - 3.5, 0.05, -4.2);
      this.board.add(fileMarker);
    }

    // Add edge markers for ranks (1-8)
    for (let rank = 0; rank < 8; rank++) {
      const rankMarker = new THREE.Mesh(markerGeometry.clone(), markerMaterial.clone());
      rankMarker.position.set(-4.2, 0.05, rank - 3.5);
      this.board.add(rankMarker);
    }
  }

  updateBoard(gameState: GameState): void {
    // Don't update during animations to avoid breaking them
    if (this.isAnimating) {
      console.log('Skipping board update during animation');
      return;
    }

    // Only update if FEN has changed
    if (this.lastFEN === gameState.fen) {
      return;
    }
    this.lastFEN = gameState.fen;

    console.log('Updating board with FEN:', gameState.fen);
    this.validateAndCleanBoard();
    this.clearAllPieces();
    this.createPiecesFromFEN(gameState.fen);
  }

  /**
   * Validate and clean up any orphaned pieces on the board
   */
  private validateAndCleanBoard(): void {
    const boardChildren = this.board.children.filter(
      child => child instanceof THREE.Group && child !== this.board
    );

    if (boardChildren.length !== this.pieces.size) {
      console.warn(
        `⚠️ Board sync issue: ${boardChildren.length} visual pieces vs ${this.pieces.size} tracked pieces`
      );

      // Remove any untracked pieces from the scene
      boardChildren.forEach(child => {
        let isTracked = false;
        this.pieces.forEach(trackedPiece => {
          if (trackedPiece === child) {
            isTracked = true;
          }
        });

        if (!isTracked) {
          console.log('🧹 Removing untracked piece from scene');
          this.board.remove(child);

          // Dispose of resources
          if (child instanceof THREE.Group) {
            child.children.forEach(grandChild => {
              if (grandChild instanceof THREE.Mesh) {
                if (grandChild.geometry) grandChild.geometry.dispose();
                if (grandChild.material) {
                  if (Array.isArray(grandChild.material)) {
                    grandChild.material.forEach(mat => mat.dispose());
                  } else {
                    grandChild.material.dispose();
                  }
                }
              }
            });
          }
        }
      });
    }
  }

  private lastFEN: string = '';
  private isAnimating: boolean = false;

  private clearAllPieces(): void {
    console.log(`🧹 Clearing ${this.pieces.size} pieces from board`);

    // Remove all pieces from the scene and dispose of resources
    this.pieces.forEach((piece, square) => {
      console.log(`Removing piece from ${square}`);
      this.board.remove(piece);

      // Dispose of geometry and materials to prevent memory leaks
      if (piece instanceof THREE.Group) {
        piece.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    });

    this.pieces.clear();
    console.log('✅ All pieces cleared');
  }

  private createPiecesFromFEN(fen: string): void {
    console.log('🎯 Creating pieces from FEN:', fen);

    // Parse FEN and create pieces
    const fenParts = fen.split(' ');
    const boardState = fenParts[0];
    const ranks = boardState.split('/');

    let piecesCreated = 0;

    for (let rankIndex = 0; rankIndex < ranks.length; rankIndex++) {
      const rank = ranks[rankIndex];
      let fileIndex = 0;

      for (const char of rank) {
        if (char >= '1' && char <= '8') {
          // Empty squares
          fileIndex += parseInt(char);
        } else {
          // Piece
          const color = char === char.toUpperCase() ? 'w' : 'b';
          const pieceType = char.toLowerCase() as PieceType;
          const square = String.fromCharCode(97 + fileIndex) + (8 - rankIndex).toString();

          console.log(`Creating ${color} ${pieceType} at ${square}`);
          this.createAndAddPiece(pieceType, color, square);
          piecesCreated++;
          fileIndex++;
        }
      }
    }

    console.log(`✅ Created ${piecesCreated} pieces, total tracked: ${this.pieces.size}`);
  }

  async animateMove(move: Move, duration: number = 800): Promise<void> {
    // Find the piece to move
    const pieceKey = this.findPieceKey(move.from);
    const piece = this.pieces.get(pieceKey);

    if (!piece) {
      console.warn(`Piece not found for move: ${move.from} to ${move.to}`);
      return;
    }

    // Calculate positions
    const fromPosition = this.squareToPosition(move.from);
    const toPosition = this.squareToPosition(move.to);

    // Create move animation
    await this.animationSystem.createMoveAnimation(
      piece,
      fromPosition,
      toPosition,
      duration,
      'arc'
    );

    // Update piece position in our tracking
    this.pieces.delete(pieceKey);
    const newKey = pieceKey.replace(move.from, move.to);
    this.pieces.set(newKey, piece);
  }

  /**
   * Animate a move based on chess.js Move object
   */
  async animateChessMove(move: any, duration: number = 600): Promise<void> {
    try {
      console.log(`Animating move: ${move.from} -> ${move.to}`, move);
      console.log('Available pieces:', Array.from(this.pieces.keys()));

      // Find the piece at the from square
      const fromSquare = move.from;
      const toSquare = move.to;

      const piece = this.pieces.get(fromSquare);
      if (!piece) {
        console.warn(
          `No piece found at ${fromSquare} for move animation. Available pieces:`,
          Array.from(this.pieces.keys())
        );
        // Try to update the board first, then retry
        console.log('Attempting to update board and retry animation...');
        return;
      }

      // Calculate positions
      const fromPosition = this.getThreeJSPosition(fromSquare);
      const toPosition = this.getThreeJSPosition(toSquare);

      // Handle captured piece - remove it immediately
      const capturedPiece = this.pieces.get(toSquare);
      if (capturedPiece) {
        console.log(`💥 Removing captured piece at ${toSquare}`);

        // Remove from scene immediately
        this.board.remove(capturedPiece);

        // Dispose of resources
        if (capturedPiece instanceof THREE.Group) {
          capturedPiece.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => mat.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        }

        // Remove from tracking
        this.pieces.delete(toSquare);
      }

      // Set animation flag to prevent board updates
      this.isAnimating = true;

      // Animate the moving piece
      await this.animationSystem.createMoveAnimation(
        piece,
        fromPosition,
        toPosition,
        duration,
        'arc'
      );

      // Update piece tracking
      this.pieces.delete(fromSquare);
      this.pieces.set(toSquare, piece);

      // Clear animation flag
      this.isAnimating = false;

      // Handle promotion
      if (move.promotion) {
        console.log(`🔄 Handling promotion: ${move.promotion} at ${toSquare}`);

        // Get the color from the piece that just moved (before removing it)
        const pieceColor = this.getPieceColorFromMesh(piece);

        // Remove the pawn and create the promoted piece
        this.board.remove(piece);
        this.pieces.delete(toSquare);

        // Dispose of the pawn's resources
        if (piece instanceof THREE.Group) {
          piece.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => mat.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        }

        // Create the promoted piece
        this.createAndAddPiece(move.promotion, pieceColor, toSquare);
        console.log(
          `✅ Promotion complete: ${pieceColor} ${move.promotion} created at ${toSquare}`
        );
      }
    } catch (error) {
      console.error('Error animating chess move:', error);
    }
  }

  private findPieceKey(square: string): string {
    // Find piece key that contains this square
    const keys = Array.from(this.pieces.keys());
    for (const key of keys) {
      if (key.includes(square)) {
        return key;
      }
    }
    return '';
  }

  private squareToPosition(square: string): THREE.Vector3 {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(square[1]) - 1; // 1=0, 2=1, etc.

    return new THREE.Vector3(
      file * this.squareSize - this.squareSize * 3.5,
      0,
      (7 - rank) * this.squareSize - this.squareSize * 3.5
    );
  }

  // Method matching HTML implementation
  private getThreeJSPosition(algebraicNotation: string): THREE.Vector3 {
    const file = algebraicNotation.charCodeAt(0) - 97;
    const rank = parseInt(algebraicNotation[1]) - 1;
    return new THREE.Vector3(
      file * this.squareSize - this.squareSize * 3.5,
      0,
      (7 - rank) * this.squareSize - this.squareSize * 3.5
    );
  }

  private createInitialPieces(): void {
    // Create pieces using standard chess starting position
    this.createAndAddPiece('r', 'w', 'a1');
    this.createAndAddPiece('n', 'w', 'b1');
    this.createAndAddPiece('b', 'w', 'c1');
    this.createAndAddPiece('q', 'w', 'd1');
    this.createAndAddPiece('k', 'w', 'e1');
    this.createAndAddPiece('b', 'w', 'f1');
    this.createAndAddPiece('n', 'w', 'g1');
    this.createAndAddPiece('r', 'w', 'h1');

    // White pawns
    for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + '2';
      this.createAndAddPiece('p', 'w', square);
    }

    // Black pieces
    this.createAndAddPiece('r', 'b', 'a8');
    this.createAndAddPiece('n', 'b', 'b8');
    this.createAndAddPiece('b', 'b', 'c8');
    this.createAndAddPiece('q', 'b', 'd8');
    this.createAndAddPiece('k', 'b', 'e8');
    this.createAndAddPiece('b', 'b', 'f8');
    this.createAndAddPiece('n', 'b', 'g8');
    this.createAndAddPiece('r', 'b', 'h8');

    // Black pawns
    for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + '7';
      this.createAndAddPiece('p', 'b', square);
    }
  }

  private createAndAddPiece(type: PieceType, color: 'w' | 'b', square: string): void {
    const evolution: IPieceEvolution = {
      id: `${color}-${type}-${square}`,
      pieceType: type,
      attributes: {} as any,
      unlockedAbilities: [],
      visualModifications: [],
      evolutionLevel: 0,
      totalInvestment: { temporalEssence: 0, mnemonicDust: 0, aetherShards: 0, arcaneMana: 0 },
      timeInvested: 0,
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    const pieceGroup = this.createPieceModel(type, evolution);

    // Set correct material based on color
    const material = this.pieceMaterials[color].clone();
    pieceGroup.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Position the piece
    pieceGroup.position.copy(this.getThreeJSPosition(square));

    // Add to scene and track
    this.board.add(pieceGroup);
    this.pieces.set(square, pieceGroup);
  }

  // Piece visualization with detailed models from HTML implementation
  createPieceModel(type: PieceType, evolution: IPieceEvolution): THREE.Group {
    const material = this.pieceMaterials.w.clone(); // Default to white, will be updated later

    let pieceGroup: THREE.Group;

    switch (type) {
      case 'p': // pawn
        pieceGroup = this.createPawnModel(material);
        break;
      case 'r': // rook
        pieceGroup = this.createRookModel(material);
        break;
      case 'n': // knight
        pieceGroup = this.createKnightModel(material);
        break;
      case 'b': // bishop
        pieceGroup = this.createBishopModel(material);
        break;
      case 'q': // queen
        pieceGroup = this.createQueenModel(material);
        break;
      case 'k': // king
        pieceGroup = this.createKingModel(material);
        break;
      default:
        pieceGroup = this.createPawnModel(material);
    }

    // Apply evolution effects to the piece
    this.applyEvolutionEffects(pieceGroup, evolution);

    pieceGroup.userData = { type, evolution };

    return pieceGroup;
  }

  private createPawnModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.2, 12), material);
    base.position.y = 0.1;
    group.add(base);

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 10), material);
    body.position.y = base.position.y + 0.1 + 0.25;
    group.add(body);

    // Collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 12), material);
    collar.position.y = body.position.y + 0.25;
    collar.rotation.x = Math.PI / 2;
    group.add(collar);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), material);
    head.position.y = collar.position.y + 0.05 + 0.2;
    group.add(head);

    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private createRookModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 16), material);
    base.position.y = 0.125;
    group.add(base);

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 16), material);
    body.position.y = base.position.y + 0.125 + 0.5;
    group.add(body);

    // Top base
    const topBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16), material);
    topBase.position.y = body.position.y + 0.5 + 0.1;
    group.add(topBase);

    // Crenellations
    const crenellationHeight = 0.25;
    const crenellationWidth = 0.18;
    const crenellationDepth = 0.18;

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const crenellation = new THREE.Mesh(
        new THREE.BoxGeometry(crenellationWidth, crenellationHeight, crenellationDepth),
        material
      );
      crenellation.position.set(
        Math.cos(angle) * (0.5 - crenellationDepth / 2),
        topBase.position.y + 0.1 + crenellationHeight / 2,
        Math.sin(angle) * (0.5 - crenellationDepth / 2)
      );
      crenellation.lookAt(new THREE.Vector3(0, crenellation.position.y, 0));
      group.add(crenellation);
    }

    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private createKnightModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16), material);
    base.position.y = 0.1;
    group.add(base);

    // Body (angled)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.8, 12), material);
    body.position.y = base.position.y + 0.1 + 0.4;
    body.rotation.z = -Math.PI / 12;
    group.add(body);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), material);
    neck.position.set(0.15, body.position.y + 0.4, 0);
    neck.rotation.z = Math.PI / 6;
    group.add(neck);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.25), material);
    head.position.set(neck.position.x + 0.2, neck.position.y + 0.1, 0);
    head.rotation.z = Math.PI / 5;
    group.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.3, 8), material);
    snout.position.set(head.position.x + 0.2, head.position.y - 0.05, 0);
    snout.rotation.z = Math.PI / 4;
    group.add(snout);

    // Ears
    const earGeometry = new THREE.ConeGeometry(0.08, 0.25, 6);
    const ear1 = new THREE.Mesh(earGeometry, material);
    ear1.position.set(head.position.x - 0.15, head.position.y + 0.2, 0.1);
    ear1.rotation.set(0, 0, Math.PI / 2.5);
    group.add(ear1);

    const ear2 = new THREE.Mesh(earGeometry, material);
    ear2.position.set(head.position.x - 0.15, head.position.y + 0.2, -0.1);
    ear2.rotation.set(0, 0, Math.PI / 2.5);
    group.add(ear2);

    group.rotation.y = -Math.PI / 2.5;
    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private createBishopModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16), material);
    base.position.y = 0.1;
    group.add(base);

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 1.1, 12), material);
    body.position.y = base.position.y + 0.1 + 0.55;
    group.add(body);

    // Head (partial sphere)
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.75),
      material
    );
    head.position.y = body.position.y + 0.55 + 0.15;
    head.rotation.x = -Math.PI / 12;
    group.add(head);

    // Notch
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.15), material);
    notch.position.set(0, head.position.y + 0.25, 0);
    group.add(notch);

    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private createQueenModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 16), material);
    base.position.y = 0.125;
    group.add(base);

    // Lower body
    const lowerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.9, 16), material);
    lowerBody.position.y = base.position.y + 0.125 + 0.45;
    group.add(lowerBody);

    // Upper body
    const upperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.6, 16), material);
    upperBody.position.y = lowerBody.position.y + 0.45 + 0.3;
    group.add(upperBody);

    // Crown base
    const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), material);
    crownBase.position.y = upperBody.position.y + 0.3;
    crownBase.rotation.x = Math.PI / 2;
    group.add(crownBase);

    // Crown jewels
    const jewelGeometry = new THREE.ConeGeometry(0.08, 0.35, 6);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const jewel = new THREE.Mesh(jewelGeometry, material);
      jewel.position.set(Math.cos(angle) * 0.3, crownBase.position.y + 0.12, Math.sin(angle) * 0.3);
      group.add(jewel);
    }

    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private createKingModel(material: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.3, 16), material);
    base.position.y = 0.15;
    group.add(base);

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 16), material);
    body.position.y = base.position.y + 0.15 + 0.6;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), material);
    head.position.y = body.position.y + 0.6 + 0.3;
    group.add(head);

    // Cross vertical
    const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), material);
    crossVertical.position.y = head.position.y + 0.35 + 0.1;
    group.add(crossVertical);

    // Cross horizontal
    const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), material);
    crossHorizontal.position.y = head.position.y + 0.35 + 0.2;
    group.add(crossHorizontal);

    group.scale.set(this.basePieceScale, this.basePieceScale, this.basePieceScale);
    return group;
  }

  private applyEvolutionEffects(group: THREE.Group, evolution: IPieceEvolution): void {
    // Calculate evolution strength from piece evolutions store
    const store = (globalThis as any).chronoChessStore;
    let evolutionLevel = 0;
    let totalUpgrades = 0;

    if (store && store.pieceEvolutions) {
      const pieceData = store.pieceEvolutions[evolution.pieceType];
      if (pieceData) {
        // Calculate total upgrades across all attributes
        switch (evolution.pieceType) {
          case 'p': // pawn
            totalUpgrades = pieceData.marchSpeed - 1 + pieceData.resilience;
            break;
          case 'n': // knight
            totalUpgrades =
              Math.floor((pieceData.dashChance - 0.1) / 0.05) + (5 - pieceData.dashCooldown);
            break;
          case 'r': // rook
            totalUpgrades = 3 - pieceData.entrenchThreshold + (pieceData.entrenchPower - 1);
            break;
          case 'b': // bishop
            totalUpgrades = pieceData.snipeRange - 1 + (3 - pieceData.consecrationTurns);
            break;
          case 'q': // queen
            totalUpgrades =
              pieceData.dominanceAuraRange - 1 + Math.floor((pieceData.manaRegenBonus - 0.1) / 0.1);
            break;
          case 'k': // king
            totalUpgrades =
              pieceData.royalDecreeUses -
              1 +
              Math.floor((pieceData.lastStandThreshold - 0.2) / 0.05);
            break;
        }

        // Determine evolution level based on total upgrades
        if (totalUpgrades >= 10) evolutionLevel = 3;
        else if (totalUpgrades >= 5) evolutionLevel = 2;
        else if (totalUpgrades >= 1) evolutionLevel = 1;
      }
    }

    // Apply visual effects based on evolution level
    if (evolutionLevel > 0) {
      // Scale the piece based on evolution level
      const scaleMultiplier = 1 + evolutionLevel * 0.1; // 10% larger per level
      group.scale.setScalar(this.basePieceScale * scaleMultiplier);

      // Apply evolved material with glow
      const pieceColor = this.getPieceColorFromMesh(group);
      const evolvedMaterialKey = `evolved_${pieceColor}_${evolutionLevel}`;
      const evolvedMaterial =
        this.pieceMaterials[evolvedMaterialKey as keyof typeof this.pieceMaterials];

      if (evolvedMaterial) {
        group.traverse(child => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material = evolvedMaterial.clone();
          }
        });
      }

      // Add pulsing glow effect for high-level evolutions
      if (evolutionLevel >= 2) {
        this.addPulsingGlowEffect(group, evolutionLevel);
      }

      // Add particle aura for maximum evolution
      if (evolutionLevel >= 3) {
        this.addEvolutionAura(group, evolution.pieceType);
      }
    }
  }

  private addPulsingGlowEffect(group: THREE.Group, evolutionLevel: number): void {
    // Create a subtle pulsing glow effect
    const glowIntensity = evolutionLevel * 0.2;
    const pulseSpeed = 2000; // 2 second pulse cycle

    const animate = () => {
      const time = Date.now();
      const pulse = (Math.sin((time / pulseSpeed) * Math.PI * 2) + 1) * 0.5; // 0 to 1
      const currentIntensity = glowIntensity * (0.5 + pulse * 0.5); // Pulse between 50% and 100%

      group.traverse(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = currentIntensity;
        }
      });

      // Continue animation if piece still exists
      if (group.parent) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  private addEvolutionAura(group: THREE.Group, pieceType: PieceType): void {
    // Create floating particles around highly evolved pieces
    const particleCount = 8;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    // Different colors for different piece types
    const auraColors = {
      p: new THREE.Color(0x88ff88), // Green for pawns
      r: new THREE.Color(0xff8888), // Red for rooks
      n: new THREE.Color(0x8888ff), // Blue for knights
      b: new THREE.Color(0xffff88), // Yellow for bishops
      q: new THREE.Color(0xff88ff), // Magenta for queens
      k: new THREE.Color(0xffffff), // White for kings
    };

    const auraColor = auraColors[pieceType] || auraColors['p'];

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.3;
      const height = Math.random() * 0.4 + 0.2;

      const i3 = i * 3;
      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * radius;

      colors[i3] = auraColor.r;
      colors[i3 + 1] = auraColor.g;
      colors[i3 + 2] = auraColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    group.add(particles);

    // Animate the aura particles
    const animateAura = () => {
      const time = Date.now() * 0.001;
      particles.rotation.y = time * 0.5;

      // Update particle positions for floating effect
      const positions = particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const baseY = 0.2 + Math.random() * 0.4;
        positions[i3 + 1] = baseY + Math.sin(time * 2 + i) * 0.1;
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Continue animation if piece still exists
      if (group.parent) {
        requestAnimationFrame(animateAura);
      }
    };

    animateAura();
  }

  applyAestheticBooster(_piece: THREE.Group, _booster: AestheticBooster): void {
    // TODO: Implement aesthetic booster application
    // This will be implemented in later tasks
  }

  // VFX system matching HTML reference
  private vfxObjects: Array<{
    mesh: THREE.Object3D;
    startTime: number;
    duration: number;
    type: string;
  }> = [];

  private knightDashParticleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffeb3b,
    transparent: true,
    opacity: 0.8,
  });

  getVFXObject(type: string): THREE.Object3D | null {
    if (type === 'dash_trail') {
      const particleGeom = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 6, 4);
      return new THREE.Mesh(particleGeom, this.knightDashParticleMaterial.clone());
    } else if (type === 'dominated_effect') {
      const particleGeom = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < 15; i++) {
        positions.push(
          (Math.random() - 0.5) * 0.8 * this.basePieceScale,
          (Math.random() * 0.6 + 0.1) * this.basePieceScale,
          (Math.random() - 0.5) * 0.8 * this.basePieceScale
        );
      }
      particleGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.Points(particleGeom, this.pieceMaterials.shield.clone());
    } else if (type === 'consecration_receiver') {
      const particleGeom = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < 25; i++) {
        positions.push(
          (Math.random() - 0.5) * 1.2 * this.basePieceScale,
          (Math.random() * 0.4 + 0.05) * this.basePieceScale,
          (Math.random() - 0.5) * 1.2 * this.basePieceScale
        );
      }
      particleGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xfff5c0,
        size: 0.18,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      return new THREE.Points(particleGeom, material);
    }
    return null;
  }

  updateVFX(now: number): void {
    this.vfxObjects = this.vfxObjects.filter(vfx => {
      const elapsed = now - vfx.startTime;
      const progress = Math.min(elapsed / vfx.duration, 1);

      if (vfx.type === 'dash_trail') {
        if (
          vfx.mesh instanceof THREE.Mesh &&
          vfx.mesh.material instanceof THREE.MeshBasicMaterial
        ) {
          vfx.mesh.material.opacity = 1.0 - progress;
          vfx.mesh.scale.setScalar(1.0 - progress * 0.5);
        }
      } else if (vfx.type === 'dominated_effect' || vfx.type === 'consecration_receiver') {
        if (vfx.mesh instanceof THREE.Points && vfx.mesh.material instanceof THREE.PointsMaterial) {
          vfx.mesh.material.opacity = Math.sin(progress * Math.PI) * 0.6;
        }
      }

      if (progress >= 1) {
        this.board.remove(vfx.mesh);
        if (vfx.mesh instanceof THREE.Mesh) {
          vfx.mesh.geometry?.dispose();
          if (Array.isArray(vfx.mesh.material)) {
            vfx.mesh.material.forEach(mat => mat.dispose());
          } else {
            vfx.mesh.material?.dispose();
          }
        }
        return false;
      }
      return true;
    });
  }

  // Special ability VFX methods
  triggerKnightDashVFX(fromSquare: string, toSquare: string): void {
    console.log('Triggering knight dash VFX:', fromSquare, '->', toSquare);

    const fromPos = this.getThreeJSPosition(fromSquare);
    const toPos = this.getThreeJSPosition(toSquare);

    // Create a bright blue trail effect for knight dash
    const trailColor = new THREE.Color(0x00aaff);
    this.physicsEffects.createTrailEffect(fromPos, toPos, trailColor);

    // Create a small explosion at the destination
    this.physicsEffects.createExplosionEffect(toPos, 0.5, 2.0);

    // Add some sparkle effects along the path
    const midPoint = new THREE.Vector3().lerpVectors(fromPos, toPos, 0.5);
    midPoint.y += 0.3; // Raise the midpoint for arc effect
    this.physicsEffects.createSparkEffect(midPoint, new THREE.Vector3(0, 1, 0), 1.5);

    // Enhanced: Create lightning effect
    this.createLightningEffect(fromPos, toPos);

    // Enhanced: Add screen flash effect
    this.createScreenFlashEffect(0x00aaff, 0.3);
  }

  triggerRookEntrenchVFX(square: string): void {
    console.log('Triggering rook entrench VFX:', square);

    const position = this.getThreeJSPosition(square);

    // Create a golden shield effect around the rook
    const shieldColor = new THREE.Color(0xffd700);

    // Create multiple particle rings for shield effect
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const ringPos = position.clone();
        ringPos.y += 0.1 + i * 0.05;
        this.createShieldRingEffect(ringPos, 0.3 + i * 0.1, shieldColor);
      }, i * 200);
    }

    // Create upward golden sparks
    this.physicsEffects.createSparkEffect(position, new THREE.Vector3(0, 1, 0), 2.0);

    // Enhanced: Create fortification walls effect
    this.createFortificationEffect(position);

    // Enhanced: Add rumbling screen shake
    this.createScreenShakeEffect(0.5, 300);
  }

  triggerBishopConsecrateVFX(square: string): void {
    console.log('Triggering bishop consecrate VFX:', square);

    const position = this.getThreeJSPosition(square);

    // Create a holy light effect
    const holyColor = new THREE.Color(0xffffaa);

    // Create a pillar of light effect
    this.createLightPillarEffect(position, holyColor);

    // Create gentle sparkles around the bishop
    this.physicsEffects.createSparkEffect(position, new THREE.Vector3(0, 1, 0), 1.0);

    // Enhanced: Create divine rays effect
    this.createDivineRaysEffect(position);

    // Enhanced: Add healing light aura
    this.createHealingAuraEffect(position);
  }

  triggerQueenDominanceVFX(square: string): void {
    console.log('Triggering queen dominance VFX:', square);

    const position = this.getThreeJSPosition(square);

    // Create a purple aura effect
    const dominanceColor = new THREE.Color(0x8800ff);

    // Create expanding rings of dominance
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.createDominanceRingEffect(position, 0.5 + i * 0.3, dominanceColor);
      }, i * 150);
    }

    // Enhanced: Create dark energy tendrils
    this.createDarkTendrilsEffect(position);

    // Enhanced: Add reality distortion effect
    this.createDistortionEffect(position);

    // Enhanced: Add ominous glow to affected area
    this.createOminousGlowEffect(position, 2.0);
  }

  // Helper methods for complex VFX
  private createShieldRingEffect(
    position: THREE.Vector3,
    radius: number,
    color: THREE.Color
  ): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const i3 = i * 3;
      positions[i3] = position.x + x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z + z;

      // Slight outward velocity
      velocities[i3] = x * 0.1;
      velocities[i3 + 1] = 0.05;
      velocities[i3 + 2] = z * 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);

    this.scene.add(particles);

    // Animate and remove after 1 second
    setTimeout(() => {
      this.scene.remove(particles);
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
    }, 1000);
  }

  private createLightPillarEffect(position: THREE.Vector3, color: THREE.Color): void {
    const particleCount = 15;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const height = (i / particleCount) * 0.8;

      positions[i3] = position.x + (Math.random() - 0.5) * 0.1;
      positions[i3 + 1] = position.y + height;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.1;

      velocities[i3] = (Math.random() - 0.5) * 0.05;
      velocities[i3 + 1] = 0.1;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.03,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);

    this.scene.add(particles);

    // Animate and remove after 1.5 seconds
    setTimeout(() => {
      this.scene.remove(particles);
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
    }, 1500);
  }

  private createDominanceRingEffect(
    position: THREE.Vector3,
    radius: number,
    color: THREE.Color
  ): void {
    const particleCount = 24;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const i3 = i * 3;
      positions[i3] = position.x + x;
      positions[i3 + 1] = position.y + 0.05;
      positions[i3 + 2] = position.z + z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.05,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);

    this.scene.add(particles);

    // Animate expansion and fade
    const startTime = Date.now();
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / 0.8; // 0.8 second duration

      if (progress >= 1) {
        this.scene.remove(particles);
        particles.geometry.dispose();
        (particles.material as THREE.Material).dispose();
        return;
      }

      // Fade out
      material.opacity = 0.7 * (1 - progress);

      requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * Update piece states with visual effects during auto-battle
   */
  updatePieceStates(pieceStates: any): void {
    // Apply visual effects based on piece states
    Object.entries(pieceStates).forEach(([square, state]: [string, any]) => {
      const piece = this.pieces.get(square);
      if (!piece) return;

      this.applyPieceStateEffects(square, state);
    });
  }

  /**
   * Enhanced piece appearance update with state-based effects
   */
  forceRefreshBoard(gameState: GameState): void {
    console.log('🔄 Force refreshing board');
    this.lastFEN = ''; // Reset FEN to force update
    this.isAnimating = false; // Clear animation flag
    this.validateAndCleanBoard();
    this.updateBoard(gameState);
  }

  /**
   * Immediately clean up the board when match ends or is stopped
   */
  cleanupBoard(): void {
    console.log('🧹 Cleaning up board - match ended');

    // Stop any ongoing animations
    this.isAnimating = false;

    // Clear all pieces immediately
    this.clearAllPieces();

    // Clear any VFX effects
    if (this.physicsEffects) {
      this.physicsEffects.dispose();
    }

    // Clear animation system
    if (this.animationSystem) {
      this.animationSystem.clearAllAnimations();
    }

    // Reset board state
    this.lastFEN = '';

    console.log('✅ Board cleanup complete');
  }

  /**
   * Reset board to starting position
   */
  resetToStartingPosition(): void {
    console.log('🔄 Resetting board to starting position');

    // Clean up first
    this.cleanupBoard();

    // Set to starting FEN
    const startingFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.lastFEN = '';
    this.createPiecesFromFEN(startingFEN);
    this.lastFEN = startingFEN;

    console.log('✅ Board reset to starting position');
  }

  // Effects and particles
  async createParticleEffect(
    type: EffectTypeValue,
    position: THREE.Vector3
  ): Promise<ParticleSystem> {
    return await this.animationSystem.createParticleEffect(type, position, 1000);
  }

  async playMoveAnimation(from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
    // Create a temporary visual indicator for the move
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
    });
    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.copy(from);
    this.scene.add(indicator);

    // Animate the indicator
    await this.animationSystem.createMoveAnimation(
      new THREE.Group().add(indicator),
      from,
      to,
      500,
      'linear'
    );

    // Clean up
    this.scene.remove(indicator);
    geometry.dispose();
    material.dispose();
  }

  // Camera animation methods
  async animateCameraToPosition(
    position: THREE.Vector3,
    target: THREE.Vector3,
    duration: number = 2000
  ): Promise<void> {
    const currentTarget = this.controls.target.clone();

    await this.animationSystem.createCameraAnimation(
      this.camera,
      this.camera.position.clone(),
      position,
      currentTarget,
      target,
      duration
    );

    // Update controls target
    this.controls.target.copy(target);
    this.controls.update();
  }

  // Mobile camera control methods
  rotateCameraLeft(): void {
    if (this.board) {
      this.board.rotation.y += Math.PI / 16;
    }
  }

  rotateCameraRight(): void {
    if (this.board) {
      this.board.rotation.y -= Math.PI / 16;
    }
  }

  zoomCameraIn(): void {
    this.camera.fov = Math.max(20, this.camera.fov - 5);
    this.camera.updateProjectionMatrix();
  }

  zoomCameraOut(): void {
    this.camera.fov = Math.min(75, this.camera.fov + 5);
    this.camera.updateProjectionMatrix();
  }

  async createDramaticCameraMove(targetPiece: THREE.Group): Promise<void> {
    const piecePosition = targetPiece.position.clone();
    const cameraPosition = piecePosition.clone().add(new THREE.Vector3(2, 3, 2));

    await this.animateCameraToPosition(cameraPosition, piecePosition, 1500);
  }

  // Performance optimization
  setQualityLevel(level: QualityLevelValue): void {
    this.currentQuality = level;

    switch (level) {
      case QualityLevel.LOW:
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(0.5);
        this.scene.fog = new THREE.Fog(0x1a1a1a, 10, 30);
        this.controls.enableDamping = false;
        break;
      case QualityLevel.MEDIUM:
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.setPixelRatio(1);
        this.scene.fog = new THREE.Fog(0x1a1a1a, 15, 50);
        this.controls.enableDamping = true;
        break;
      case QualityLevel.HIGH:
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.scene.fog = new THREE.Fog(0x1a1a1a, 20, 100);
        this.controls.enableDamping = true;
        break;
      case QualityLevel.ULTRA:
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.scene.fog = new THREE.Fog(0x1a1a1a, 30, 150);
        this.controls.enableDamping = true;
        break;
    }
  }

  private updatePerformanceMonitor(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;

    if (this.lastFrameTime > 0) {
      this.performanceMonitor.frameTime = deltaTime;
      this.performanceMonitor.fps = 1000 / deltaTime;
    }

    this.lastFrameTime = currentTime;
    this.frameCount++;

    // Auto-adjust quality based on performance
    if (this.frameCount % 60 === 0) {
      // Check every 60 frames
      this.autoAdjustQuality();
    }

    // Update memory usage if available
    if ((performance as any).memory) {
      this.performanceMonitor.memoryUsage =
        (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }

    // Update render stats
    this.performanceMonitor.drawCalls = this.renderer.info.render.calls;
    this.performanceMonitor.triangles = this.renderer.info.render.triangles;
  }

  private autoAdjustQuality(): void {
    const avgFps = this.performanceMonitor.fps;

    if (avgFps < 30 && this.currentQuality !== QualityLevel.LOW) {
      // Reduce quality if FPS is too low
      const qualityLevels = [
        QualityLevel.ULTRA,
        QualityLevel.HIGH,
        QualityLevel.MEDIUM,
        QualityLevel.LOW,
      ];
      const currentIndex = qualityLevels.indexOf(this.currentQuality);
      if (currentIndex < qualityLevels.length - 1) {
        this.setQualityLevel(qualityLevels[currentIndex + 1]);
        console.log(
          `Auto-adjusted quality to ${this.currentQuality} due to low FPS: ${avgFps.toFixed(1)}`
        );
      }
    } else if (avgFps > 55 && this.currentQuality !== QualityLevel.ULTRA) {
      // Increase quality if FPS is stable and high
      const qualityLevels = [
        QualityLevel.LOW,
        QualityLevel.MEDIUM,
        QualityLevel.HIGH,
        QualityLevel.ULTRA,
      ];
      const currentIndex = qualityLevels.indexOf(this.currentQuality);
      if (currentIndex < qualityLevels.length - 1) {
        this.setQualityLevel(qualityLevels[currentIndex + 1]);
        console.log(
          `Auto-adjusted quality to ${this.currentQuality} due to stable high FPS: ${avgFps.toFixed(1)}`
        );
      }
    }
  }

  getPerformanceMonitor(): PerformanceMonitor {
    return { ...this.performanceMonitor };
  }

  enableLevelOfDetail(_enabled: boolean): void {
    // TODO: Implement LOD system
    // This will be implemented in later tasks
  }

  render(): void {
    const now = performance.now();
    this.updatePerformanceMonitor();
    this.controls.update();
    this.animationSystem.update();
    this.updateVFX(now);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    // Update controls for new canvas size
    // Note: OrbitControls doesn't have handleResize method, it updates automatically
  }

  // Camera control methods
  setCameraPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    if (this.controls.enabled) {
      this.controls.update();
    }
  }

  setCameraTarget(x: number, y: number, z: number): void {
    this.controls.target.set(x, y, z);
    if (this.controls.enabled) {
      this.controls.update();
    }
  }

  // Enable/disable orbit controls (useful for mobile)
  setOrbitControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  resetCamera(): void {
    this.camera.position.set(0, 8, 8);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // Responsive camera adjustments
  adjustCameraForMobile(): void {
    this.camera.position.set(0, 10, 10);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 25;
    this.controls.update();
  }

  adjustCameraForDesktop(): void {
    this.camera.position.set(0, 8, 8);
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;
    this.controls.update();
  }

  // Animation system access
  getAnimationSystem(): AnimationSystem {
    return this.animationSystem;
  }

  // Board interaction methods
  private setupInteraction(canvas: HTMLCanvasElement): void {
    const handleClick = (event: MouseEvent | TouchEvent) => {
      event.preventDefault();

      let clientX: number, clientY: number;

      if (event instanceof TouchEvent) {
        if (event.touches.length === 0) return;
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }

      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Check for intersections with board squares
      const squareIntersects = this.raycaster.intersectObjects(
        Array.from(this.boardSquares.values())
      );

      if (squareIntersects.length > 0) {
        const intersectedSquare = squareIntersects[0].object as THREE.Mesh;

        // Find the square name from the boardSquares map
        for (const [squareName, squareMesh] of this.boardSquares.entries()) {
          if (squareMesh === intersectedSquare) {
            if (this.onSquareClick) {
              this.onSquareClick(squareName);
            }
            break;
          }
        }
      }
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchend', handleClick);
  }

  setSquareClickHandler(handler: (square: string) => void): void {
    this.onSquareClick = handler;
  }

  highlightSquare(square: string | null): void {
    // Clear previous selection
    if (this.selectedSquare) {
      const prevSquareMesh = this.boardSquares.get(this.selectedSquare);
      const originalMaterial = this.originalMaterials.get(this.selectedSquare);
      if (prevSquareMesh && originalMaterial) {
        const material = prevSquareMesh.material as THREE.MeshStandardMaterial;
        material.color.copy(originalMaterial.color);
        material.emissive.copy(originalMaterial.emissive);
      }
    }

    this.selectedSquare = square;

    // Highlight new selection
    if (square) {
      const squareMesh = this.boardSquares.get(square);
      if (squareMesh) {
        const material = squareMesh.material as THREE.MeshStandardMaterial;
        material.color.setHex(0x4a90e2);
        material.emissive.setHex(0x1a4a7a);
      }
    }
  }

  /**
   * Highlight valid moves on the board.
   * Accepts either an array of square names (string[]) or an array of move objects
   * with a `to` property and optional `enhanced` flag. Enhanced moves are
   * highlighted with a distinct color.
   */
  highlightValidMoves(moves: Array<string | { to: string; enhanced?: any }>): void {
    // Normalize input into a map of square -> enhancedFlag
    const moveMap = new Map<string, boolean>();
    if (!moves || moves.length === 0) {
      // Clear previous highlights
      this.validMoveSquares.forEach(square => {
        const squareMesh = this.boardSquares.get(square);
        const originalMaterial = this.originalMaterials.get(square);
        if (squareMesh && originalMaterial && square !== this.selectedSquare) {
          const material = squareMesh.material as THREE.MeshStandardMaterial;
          material.color.copy(originalMaterial.color);
          material.emissive.copy(originalMaterial.emissive);
        }
      });
      this.validMoveSquares.clear();
      return;
    }

    moves.forEach(m => {
      if (typeof m === 'string') {
        moveMap.set(m, false);
      } else if (m && (m as any).to) {
        moveMap.set((m as any).to, !!(m as any).enhanced);
      }
    });

    // Clear previous valid move highlights
    this.validMoveSquares.forEach(square => {
      const squareMesh = this.boardSquares.get(square);
      const originalMaterial = this.originalMaterials.get(square);
      if (squareMesh && originalMaterial && square !== this.selectedSquare) {
        const material = squareMesh.material as THREE.MeshStandardMaterial;
        material.color.copy(originalMaterial.color);
        material.emissive.copy(originalMaterial.emissive);
      }
    });
    this.validMoveSquares.clear();

    // Highlight new valid moves, using a distinct color for enhanced moves
    moveMap.forEach((isEnhanced, square) => {
      if (square !== this.selectedSquare) {
        const squareMesh = this.boardSquares.get(square);
        if (squareMesh) {
          const material = squareMesh.material as THREE.MeshStandardMaterial;
          if (isEnhanced) {
            // Enhanced move color (purple/gold mix)
            material.color.setHex(0x9b59b6);
            material.emissive.setHex(0x4b2466);
          } else {
            material.color.setHex(0xffd700);
            material.emissive.setHex(0x664400);
          }
          this.validMoveSquares.add(square);
        }
      }
    });
  }

  clearAllHighlights(): void {
    // Clear selected square highlight
    this.highlightSquare(null);
    // Clear valid move highlights
    this.highlightValidMoves([]);
  }

  restoreAllSquares(): void {
    // Restore all squares to their original materials
    this.boardSquares.forEach((squareMesh, squareName) => {
      const originalMaterial = this.originalMaterials.get(squareName);
      if (originalMaterial) {
        const material = squareMesh.material as THREE.MeshStandardMaterial;
        material.color.copy(originalMaterial.color);
        material.emissive.copy(originalMaterial.emissive);
        material.metalness = originalMaterial.metalness;
        material.roughness = originalMaterial.roughness;
      }
    });

    // Clear tracking
    this.selectedSquare = null;
    this.validMoveSquares.clear();
  }

  private getPieceColorFromMesh(piece: THREE.Group): 'w' | 'b' {
    // Check the material color to determine if it's white or black
    if (piece.children.length > 0) {
      const mesh = piece.children[0] as THREE.Mesh;
      if (mesh && mesh.material) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        // White pieces use light material (0xeeeeee), black pieces use dark material (0x333333)
        const color = material.color.getHex();
        return color > 0x888888 ? 'w' : 'b';
      }
    }
    return 'w'; // Default to white if can't determine
  }

  /**
   * Apply special state effects to pieces based on their battle state
   */
  applyPieceStateEffects(square: string, state: any): void {
    const piece = this.pieces.get(square);
    if (!piece || !state) return;

    // Apply material changes based on state
    let materialKey = state.color;
    if (state.isDominated) {
      materialKey = `dominated_${state.color}`;
    } else if (state.type === 'r' && state.isEntrenched) {
      materialKey = `entrenched_${state.color}`;
    }

    const newMaterial =
      this.pieceMaterials[materialKey as keyof typeof this.pieceMaterials] ||
      this.pieceMaterials[state.color as keyof typeof this.pieceMaterials];
    if (newMaterial) {
      piece.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.material = newMaterial.clone();
        }
      });
    }

    // Add special visual effects
    this.addStateVisualEffects(piece, state);
  }

  private addStateVisualEffects(piece: THREE.Group, state: any): void {
    // Remove old effects first
    this.removeStateEffects(piece);

    // Add new effects based on state
    if (state.type === 'r' && state.isEntrenched) {
      this.addShieldEffect(piece);
    }

    if (state.type === 'b' && state.isConsecratedSource) {
      this.addConsecrationEffect(piece);
    }

    if (state.isReceivingConsecration) {
      this.addBlessedEffect(piece);
    }

    if (state.isDominated) {
      this.addDominatedEffect(piece);
    }
  }

  private addShieldEffect(piece: THREE.Group): void {
    const shieldGeometry = new THREE.TorusGeometry(0.15, 0.02, 8, 16);
    const shield = new THREE.Mesh(shieldGeometry, this.pieceMaterials.shield.clone());
    shield.position.y = 0.25;
    shield.rotation.x = Math.PI / 2;
    shield.userData.effectType = 'shield';
    piece.add(shield);

    // Animate shield rotation
    const animateShield = () => {
      shield.rotation.z += 0.02;
      if (piece.parent) {
        requestAnimationFrame(animateShield);
      }
    };
    animateShield();
  }

  private addConsecrationEffect(piece: THREE.Group): void {
    // Add ground circle effect
    const groundGeometry = new THREE.CircleGeometry(0.25, 16);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.userData.effectType = 'consecration';
    piece.add(ground);

    // Pulsing effect
    const pulseGround = () => {
      const time = Date.now() * 0.003;
      groundMaterial.opacity = 0.2 + Math.sin(time) * 0.15;
      if (piece.parent) {
        requestAnimationFrame(pulseGround);
      }
    };
    pulseGround();
  }

  private addBlessedEffect(piece: THREE.Group): void {
    // Add floating light particles
    const particleCount = 6;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 0.3;
      positions[i3 + 1] = Math.random() * 0.2 + 0.1;
      positions[i3 + 2] = (Math.random() - 0.5) * 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffdd,
      size: 0.015,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    particles.userData.effectType = 'blessed';
    piece.add(particles);

    // Float particles upward
    const animateParticles = () => {
      const positions = particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 1] += 0.003;
        if (positions[i3 + 1] > 0.4) {
          positions[i3 + 1] = 0.1;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      if (piece.parent) {
        requestAnimationFrame(animateParticles);
      }
    };
    animateParticles();
  }

  private addDominatedEffect(piece: THREE.Group): void {
    // Add dark aura ring
    const auraGeometry = new THREE.RingGeometry(0.12, 0.18, 16);
    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0x440044,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const aura = new THREE.Mesh(auraGeometry, auraMaterial);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.01;
    aura.userData.effectType = 'dominated';
    piece.add(aura);

    // Slow rotation
    const rotateAura = () => {
      aura.rotation.z += 0.01;
      if (piece.parent) {
        requestAnimationFrame(rotateAura);
      }
    };
    rotateAura();
  }

  private removeStateEffects(piece: THREE.Group): void {
    // Remove all effect objects
    const effectsToRemove: THREE.Object3D[] = [];
    piece.traverse(child => {
      if (child.userData.effectType) {
        effectsToRemove.push(child);
      }
    });

    effectsToRemove.forEach(effect => {
      piece.remove(effect);
      if (effect instanceof THREE.Mesh) {
        effect.geometry.dispose();
        if (Array.isArray(effect.material)) {
          effect.material.forEach(mat => mat.dispose());
        } else {
          effect.material.dispose();
        }
      } else if (effect instanceof THREE.Points) {
        effect.geometry.dispose();
        (effect.material as THREE.Material).dispose();
      }
    });
  }

  // Enhanced VFX Effects Implementation
  private createLightningEffect(fromPos: THREE.Vector3, toPos: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry();
    const points = [];

    // Create a jagged lightning path
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = new THREE.Vector3().lerpVectors(fromPos, toPos, t);

      // Add random zigzag
      if (i > 0 && i < steps) {
        point.x += (Math.random() - 0.5) * 0.2;
        point.z += (Math.random() - 0.5) * 0.2;
        point.y += Math.random() * 0.1;
      }
      points.push(point);
    }

    geometry.setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });

    const lightning = new THREE.Line(geometry, material);
    this.scene.add(lightning);

    // Animate and remove
    setTimeout(() => {
      this.scene.remove(lightning);
      geometry.dispose();
      material.dispose();
    }, 300);
  }

  private createScreenFlashEffect(color: number, intensity: number): void {
    // Create a temporary overlay for screen flash
    const flashGeometry = new THREE.PlaneGeometry(100, 100);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: intensity,
      side: THREE.DoubleSide,
    });

    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position
      .copy(this.camera.position)
      .add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
    flash.lookAt(this.camera.position);

    this.scene.add(flash);

    // Fade out quickly
    const fadeOut = () => {
      flashMaterial.opacity *= 0.8;
      if (flashMaterial.opacity > 0.01) {
        requestAnimationFrame(fadeOut);
      } else {
        this.scene.remove(flash);
        flashGeometry.dispose();
        flashMaterial.dispose();
      }
    };
    fadeOut();
  }

  private createFortificationEffect(position: THREE.Vector3): void {
    // Create stone wall particles rising from ground
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.2 + Math.random() * 0.1;
      const i3 = i * 3;

      positions[i3] = position.x + Math.cos(angle) * radius;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z + Math.sin(angle) * radius;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x8b4513,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
    });

    const walls = new THREE.Points(geometry, material);
    this.scene.add(walls);

    // Animate upward
    const animate = () => {
      const positions = walls.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += 0.01;
      }
      walls.geometry.attributes.position.needsUpdate = true;

      material.opacity *= 0.98;
      if (material.opacity > 0.1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(walls);
        geometry.dispose();
        material.dispose();
      }
    };
    animate();
  }

  private createScreenShakeEffect(intensity: number, duration: number): void {
    const originalPosition = this.camera.position.clone();
    const startTime = Date.now();

    const shake = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress < 1) {
        const currentIntensity = intensity * (1 - progress);
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * currentIntensity,
          (Math.random() - 0.5) * currentIntensity * 0.5,
          (Math.random() - 0.5) * currentIntensity
        );

        this.camera.position.copy(originalPosition).add(offset);
        requestAnimationFrame(shake);
      } else {
        this.camera.position.copy(originalPosition);
      }
    };
    shake();
  }

  private createDivineRaysEffect(position: THREE.Vector3): void {
    // Create multiple rays of light emanating from position
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const rayStart = position.clone();
      const rayEnd = position
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.5, Math.sin(angle) * 1.5));

      const rayGeometry = new THREE.BufferGeometry().setFromPoints([rayStart, rayEnd]);
      const rayMaterial = new THREE.LineBasicMaterial({
        color: 0xffffdd,
        transparent: true,
        opacity: 0.6,
        linewidth: 2,
      });

      const ray = new THREE.Line(rayGeometry, rayMaterial);
      this.scene.add(ray);

      // Fade out over time
      setTimeout(
        () => {
          const fadeOut = () => {
            rayMaterial.opacity *= 0.9;
            if (rayMaterial.opacity > 0.05) {
              requestAnimationFrame(fadeOut);
            } else {
              this.scene.remove(ray);
              rayGeometry.dispose();
              rayMaterial.dispose();
            }
          };
          fadeOut();
        },
        100 + i * 50
      );
    }
  }

  private createHealingAuraEffect(position: THREE.Vector3): void {
    const particleCount = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 0.5;
      const angle = Math.random() * Math.PI * 2;

      positions[i3] = position.x + Math.cos(angle) * radius;
      positions[i3 + 1] = position.y + Math.random() * 0.2;
      positions[i3 + 2] = position.z + Math.sin(angle) * radius;

      velocities[i3] = 0;
      velocities[i3 + 1] = 0.02 + Math.random() * 0.01;
      velocities[i3 + 2] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaaffaa,
      size: 0.02,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    const healingParticles = new THREE.Points(geometry, material);
    this.scene.add(healingParticles);

    // Animate floating particles
    const animate = () => {
      const positions = healingParticles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 1] += velocities[i3 + 1];

        // Reset particles that float too high
        if (positions[i3 + 1] > position.y + 0.8) {
          positions[i3 + 1] = position.y;
        }
      }
      healingParticles.geometry.attributes.position.needsUpdate = true;

      material.opacity *= 0.995;
      if (material.opacity > 0.1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(healingParticles);
        geometry.dispose();
        material.dispose();
      }
    };
    animate();
  }

  private createDarkTendrilsEffect(position: THREE.Vector3): void {
    // Create serpentine dark energy tendrils
    for (let t = 0; t < 6; t++) {
      const points = [];
      const startAngle = (t / 6) * Math.PI * 2;

      for (let i = 0; i <= 20; i++) {
        const progress = i / 20;
        const radius = 0.1 + progress * 0.4;
        const height = Math.sin(progress * Math.PI * 3) * 0.2 + progress * 0.3;
        const angle = startAngle + progress * Math.PI * 4;

        const point = new THREE.Vector3(
          position.x + Math.cos(angle) * radius,
          position.y + height,
          position.z + Math.sin(angle) * radius
        );
        points.push(point);
      }

      const tendrilGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const tendrilMaterial = new THREE.LineBasicMaterial({
        color: 0x440044,
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
      });

      const tendril = new THREE.Line(tendrilGeometry, tendrilMaterial);
      this.scene.add(tendril);

      setTimeout(() => {
        const fadeOut = () => {
          tendrilMaterial.opacity *= 0.92;
          if (tendrilMaterial.opacity > 0.05) {
            requestAnimationFrame(fadeOut);
          } else {
            this.scene.remove(tendril);
            tendrilGeometry.dispose();
            tendrilMaterial.dispose();
          }
        };
        fadeOut();
      }, t * 100);
    }
  }

  private createDistortionEffect(position: THREE.Vector3): void {
    // Create ripple effect on the ground
    const rippleGeometry = new THREE.RingGeometry(0.1, 1.5, 32);
    const rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0x8800ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
    ripple.position.copy(position);
    ripple.position.y += 0.01;
    ripple.rotation.x = -Math.PI / 2;

    this.scene.add(ripple);

    // Animate expanding ripple
    const animate = () => {
      ripple.scale.multiplyScalar(1.05);
      rippleMaterial.opacity *= 0.95;

      if (rippleMaterial.opacity > 0.05) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(ripple);
        rippleGeometry.dispose();
        rippleMaterial.dispose();
      }
    };
    animate();
  }

  private createOminousGlowEffect(position: THREE.Vector3, radius: number): void {
    // Create a pulsing ominous glow
    const glowGeometry = new THREE.CircleGeometry(radius, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x660066,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(position);
    glow.position.y += 0.005;
    glow.rotation.x = -Math.PI / 2;

    this.scene.add(glow);

    // Pulsing animation
    const startTime = Date.now();
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pulse = Math.sin(elapsed * 4) * 0.1 + 0.9;

      glow.scale.setScalar(pulse);
      glowMaterial.opacity = 0.1 + Math.sin(elapsed * 3) * 0.05;

      if (elapsed < 3) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(glow);
        glowGeometry.dispose();
        glowMaterial.dispose();
      }
    };
    animate();
  }

  dispose(): void {
    // Dispose of animation system
    this.animationSystem.dispose();

    // Dispose of controls
    this.controls.dispose();

    // Dispose of renderer
    this.renderer.dispose();

    // Dispose of all geometries and materials
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    // Clear pieces map
    this.pieces.clear();

    // Dispose of original materials
    this.originalMaterials.forEach(material => material.dispose());
    this.originalMaterials.clear();
    this.boardSquares.clear();
  }
}
