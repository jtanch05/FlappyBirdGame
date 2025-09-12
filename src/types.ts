/**
 * Type definitions for the Flappy Bird game.
 *
 * Design Decision:
 * - All types use `Readonly` to enforce immutability at compile-time
 * - ReadonlyArray prevents accidental mutations of collections
 * - This supports functional programming by making state mutations explicit
 * - Type safety eliminates many runtime errors
 */

// Union type for keyboard input
export type Key = "Space" | "KeyP" | "KeyR";

// 2D vector with readonly properties
export type Vec2 = Readonly<{ x: number; y: number }>;

/**
 * Bird entity with physics properties
 * - pos: current position in game world
 * - vel: velocity vector for physics simulation
 * - radius: collision detection boundary (circular hitbox)
 */
export type Bird = Readonly<{
    pos: Vec2;
    vel: Vec2;
    radius: number;
}>;

/**
 * Pipe obstacle with gap for bird to pass through
 * - id: unique identifier for efficient DOM element mapping
 * - x: horizontal position (moves left each tick)
 * - gapY: vertical center of the gap
 * - gapHeight: size of the gap the bird can pass through
 * - width: horizontal collision boundary
 * - passed: flag to track scoring (prevents double-counting)
 */
export type Pipe = Readonly<{
    id: number;
    x: number;
    gapY: number;
    gapHeight: number;
    width: number;
    passed: boolean;
}>;

/**
 * Captured bird trajectory for ghost bird replay system
 * - birdPositions: complete path taken during one game session
 * - timestamp: when this run was completed (for potential future features)
 */
export type GameHistory = Readonly<{
    birdPositions: ReadonlyArray<Vec2>;
    timestamp: number;
}>;

/**
 * Pipe spawn data parsed from CSV file
 * - gapY/gapHeight: normalized values (0-1) that get scaled to canvas
 * - spawnTime: when this pipe should appear (in milliseconds)
 */
export type PipeData = Readonly<{
    gapY: number;
    gapHeight: number;
    spawnTime: number;
}>;

/** Power-up types - extensible union for adding new power-up behaviors */
export type PowerUpType = "shrink" | "slowDown";

/**
 * Power-up collectible entity
 * - id: unique identifier for DOM mapping
 * - type: determines the effect when collected
 * - pos: current position 
 * - collected: prevents multiple collection of same power-up
 */
export type PowerUp = Readonly<{
    id: number;
    type: PowerUpType;
    pos: Vec2;
    collected: boolean;
}>;

/**
 * Action interface for state transformations
 * - Each user input or game event becomes an Action
 * - apply() transforms current state to next state immutably
 * - This enables debugging and predictable state changes
 */
export interface Action {
    apply(s: State): State;
}

/**
 * Complete game state - the single source of truth
 *
 * Functional Design Principles:
 * - Readonly prevents accidental mutations
 * - All state changes create new State objects
 * - No hidden state or side effects in game logic
 * - Enables easy testing, debugging, and reasoning about game behavior
 *
 * State Categories:
 * - Game entities: bird, pipes, powerUps
 * - Game flow: score, lives, gameEnd, gameWon, gameStarted, isPaused
 * - Timing: time, gameTime, countdown, countdownTime
 * - Pipe management: pipeSpawnQueue, originalPipeSpawnQueue
 * - Ghost system: gameHistory, currentRun, ghostBirds, gameCount
 * - Randomness: rngSeed (for deterministic random behavior)
 * - Power-up effects: shrink/slowDown state and timers
 * - Statistics: powerUpsSpawned, powerUpsCollected
 */
export type State = Readonly<{
    bird: Bird;
    pipes: ReadonlyArray<Pipe>;
    powerUps: ReadonlyArray<PowerUp>;
    score: number;
    lives: number;
    gameEnd: boolean;
    gameWon: boolean;
    gameStarted: boolean;
    isPaused: boolean;
    countdown: number;
    countdownTime: number;
    time: number;
    gameTime: number;
    pipeSpawnQueue: ReadonlyArray<PipeData>;
    originalPipeSpawnQueue: ReadonlyArray<PipeData>;
    gameHistory: ReadonlyArray<GameHistory>;
    currentRun: ReadonlyArray<Vec2>;
    ghostBirds: ReadonlyArray<Vec2>;
    gameCount: number;
    rngSeed: number;
    shrinkActive: boolean;
    shrinkEndTime: number;
    slowDownActive: boolean;
    slowDownEndTime: number;
    slowDownMultiplier: number;
    powerUpsSpawned: number;
    powerUpsCollected: number;
    pipeSpawnIndex: number;
    lastCollisionTime: number;
    lastCollisionPipeId: number;
}>;
