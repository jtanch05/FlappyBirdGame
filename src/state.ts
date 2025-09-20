/**
 * Game State Management - Pure Functional Implementation
 *
 * This module contains all game logic using functional programming principles:
 * - Immutable state transformations
 * - Pure functions with no side effects
 * - Small, focused functions that work together
 * - Action objects that contain state change logic
 *
 * Architecture:
 * - State: Complete game state as immutable data structure
 * - Actions: Objects that contain state transformation logic
 * - Pure Functions: Small utilities for calculations and transformations
 * - Constants: Configuration values grouped together
 */

import {
    Action,
    Bird,
    Pipe,
    PipeData,
    PowerUp,
    PowerUpType,
    State,
} from "./types";
import { clamp, randomBetween } from "./util";

/**
 *
 * Using 'as const' assertions to create readonly constant objects.
 *
 * Grouping related constants together improves maintainability
 * and makes it easy to adjust game balance in one place.
 */

/** Screen dimensions and coordinate system */
export const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

/** Bird sprite and positioning constants */
export const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
    INITIAL_X: Viewport.CANVAS_WIDTH * 0.3,
    INITIAL_Y: Viewport.CANVAS_HEIGHT / 2,
} as const;

export const Constants = {
    // Pipe properties
    PIPE_WIDTH: 50,
    PIPE_SPEED: 3,

    // Bird physics
    GRAVITY: 0.5,
    FLAP_STRENGTH: -7,

    // Collision bounce mechanics
    BOUNCE_VELOCITY_MIN: 4,
    BOUNCE_VELOCITY_MAX: 7,
    COLLISION_COOLDOWN_MS: 500,

    // Timing and lifecycle
    TICK_RATE_MS: 16,
    INITIAL_LIVES: 3,
    OFFSCREEN_THRESHOLD: -50,
    COUNTDOWN_DURATION_MS: 1000,

    // Power-up system configuration
    POWERUP_SIZE: 20,
    POWERUP_SPEED: 1,
    SHRINK_DURATION: 6000,
    SHRINK_SCALE: 0.6,
    SLOW_DOWN_DURATION: 8000,
    SLOW_DOWN_MIN_MULTIPLIER: 0.3,
} as const;

/**
 * Entity Factory Functions - Pure constructors for game objects
 *
 * These functions create immutable game entities with proper initialization.
 * They demonstrate the factory pattern in functional programming:
 * - No side effects
 * - Return new objects rather than modifying existing ones
 * - Encapsulate object creation logic
 * - Enable consistent initialization across the codebase
 */

/**
 * Create a new bird entity with physics properties
 *
 * @param x
 * @param y
 * @returns
 */
export const createBird = (x: number, y: number): Bird => ({
    pos: { x, y },
    vel: { x: 0, y: 0 }, // Start with zero velocity
    // Collision radius slightly smaller than sprite for forgiving gameplay
    radius: Math.min(Birb.WIDTH, Birb.HEIGHT) / 2 - 8,
});

/**
 * Create a new pipe obstacle from CSV data
 *
 * @param id - Unique identifier for DOM element mapping
 * @param x - Horizontal spawn position (typically off-screen right)
 * @param gapY - Vertical gap center (normalized 0-1, gets scaled to canvas)
 * @param gapHeight - Gap size (normalized 0-1, gets scaled to canvas)
 * @returns Immutable Pipe object ready for collision detection and rendering
 */
export const createPipe = (
    id: number,
    x: number,
    gapY: number,
    gapHeight: number,
): Pipe => ({
    id,
    x,
    // Scale normalized CSV values to actual canvas coordinates
    gapY: gapY * Viewport.CANVAS_HEIGHT,
    gapHeight: gapHeight * Viewport.CANVAS_HEIGHT,
    width: Constants.PIPE_WIDTH,
    passed: false, // Initialize as not yet passed for scoring
});

export const initialState: State = {
    bird: createBird(Birb.INITIAL_X, Birb.INITIAL_Y),
    pipes: [],
    powerUps: [],
    score: 0,
    lives: Constants.INITIAL_LIVES,
    gameEnd: false,
    gameWon: false,
    gameStarted: false,
    isPaused: false,
    countdown: 0,
    countdownTime: 0,
    time: 0,
    gameTime: 0,
    pipeSpawnQueue: [],
    originalPipeSpawnQueue: [],
    gameHistory: [],
    currentRun: [],
    ghostBirds: [],
    gameCount: 0,
    rngSeed: 123456789,
    shrinkActive: false,
    shrinkEndTime: 0,
    slowDownActive: false,
    slowDownEndTime: 0,
    slowDownMultiplier: 1.0,
    powerUpsSpawned: 0,
    powerUpsCollected: 0,
    pipeSpawnIndex: 0,
    lastCollisionTime: 0,
    lastCollisionPipeId: -1,
};

/**
 * Action Classes - Containing State Transformations
 *
 * Each action represents a discrete event that can transform game state.
 * Putting logic in these objects provides several benefits:
 * - Makes the logic for each state transformation self-contained
 * - Enables undo/redo functionality (not implemented but possible)
 * - Makes state changes explicit and traceable
 * - Supports debugging by tracking each state change
 *
 * All actions follow the same interface: apply(state) -> newState
 * This consistency makes the system predictable and testable.
 */

/**
 * Tick Action - Advances game simulation by one frame
 *
 * This is the main game loop logic, handling:
 * - Physics updates (bird movement, gravity)
 * - Pipe spawning and movement
 * - Collision detection and response
 * - Power-up management
 * - Score calculation
 * - Game state transitions
 *
 * Pure function approach:
 * - Takes current state as input
 * - Returns completely new state object
 * - No mutations of existing state
 * - All calculations based on input parameters
 */
export class Tick implements Action {
    apply(currentState: State): State {
        // This prevents unnecessary computation
        if (
            currentState.gameEnd ||
            !currentState.gameStarted ||
            currentState.isPaused
        )
            return currentState;

        /* 
        This Countdown timer code produced with AI assistance.
        */
        const newTime = currentState.time + Constants.TICK_RATE_MS; //INCREASE THE TIME BY THE TICK RATE

        if (currentState.countdown > 0) {
            // Figure out how many milliseconds have passed since the countdown started
            const elapsedSinceCountdown = newTime - currentState.countdownTime;
            // Convert the elapsed time into a countdown number (3, 2, 1, or 0)
            const newCountdown = Math.max(
                0,
                3 -
                    Math.floor(
                        elapsedSinceCountdown / Constants.COUNTDOWN_DURATION_MS,
                    ),
            );
            return { ...currentState, time: newTime, countdown: newCountdown };
        }

        const newGameTime = currentState.gameTime + Constants.TICK_RATE_MS;

        // Calculate slow down multiplier early
        const tempSlowDownActive =
            currentState.slowDownActive &&
            newTime < currentState.slowDownEndTime;
        const currentSpeedMultiplier = getCurrentSpeedMultiplier(
            {
                ...currentState,
                slowDownActive: tempSlowDownActive,
                slowDownEndTime: currentState.slowDownEndTime,
            },
            newTime,
        );

        // Update bird with current radius based on shrink status
        const currentBirdRadius = getCurrentBirdRadius(currentState);
        const updatedBird = {
            ...updateBirdPosition(currentState.bird),
            radius: currentBirdRadius,
        };

        // Pipe management pipeline: move -> cleanup -> score
        const movedPipes = movePipes(currentSpeedMultiplier)(
            currentState.pipes,
        );
        const cleanedPipes = removeOffscreenPipes(movedPipes);
        const { score: newScore, pipes: scoredPipes } = updateScore(
            updatedBird,
            cleanedPipes,
            currentState.score,
        );

        // Update power-ups: move them left and remove off-screen ones
        const updatedPowerUps = updatePowerUps(currentState.powerUps);

        // Check for power-up collisions: find power-ups that bird touched this frame
        const collectedPowerUps = updatedPowerUps.filter(
            powerUp =>
                !powerUp.collected &&
                checkPowerUpCollision(updatedBird, powerUp),
        );

        // Mark collected power-ups and remove them from the game
        const powerUpsAfterCollection = updatedPowerUps
            .map(powerUp =>
                collectedPowerUps.some(collected => collected.id === powerUp.id)
                    ? { ...powerUp, collected: true }
                    : powerUp,
            )
            .filter(powerUp => !powerUp.collected);

        // Check if bird collected a shrink power-up this frame
        const shrinkActivated = collectedPowerUps.some(
            powerUp => powerUp.type === "shrink",
        );

        const newShrinkActive =
            shrinkActivated ||
            (currentState.shrinkActive && newTime < currentState.shrinkEndTime);
        // Set new end time if just activated, otherwise keep current end time
        const newShrinkEndTime = shrinkActivated
            ? newTime + Constants.SHRINK_DURATION
            : currentState.shrinkEndTime;

        // Check if bird collected a slow-down power-up this frame
        const slowDownActivated = collectedPowerUps.some(
            powerUp => powerUp.type === "slowDown",
        );
        // Slow-down is active if: just activated OR still active from before
        const newSlowDownActive =
            slowDownActivated ||
            (currentState.slowDownActive &&
                newTime < currentState.slowDownEndTime);
        // Set new end time if just activated, otherwise keep current end time
        const newSlowDownEndTime = slowDownActivated
            ? newTime + Constants.SLOW_DOWN_DURATION
            : currentState.slowDownEndTime;
        // Recalculate speed multiplier with updated slow-down status
        const finalSpeedMultiplier = getCurrentSpeedMultiplier(
            {
                ...currentState,
                slowDownActive: newSlowDownActive,
                slowDownEndTime: newSlowDownEndTime,
            },
            newTime,
        );
        // Update total count of power-ups collected (for statistics)
        const newPowerUpsCollected =
            currentState.powerUpsCollected + collectedPowerUps.length;

        // COLLISION DETECTION SYSTEM
        // Find collided pipe for cooldown tracking
        const collidedPipe = scoredPipes.find(pipe =>
            checkBirdPipeCollision(updatedBird, pipe),
        );
        const pipeCollision = collidedPipe !== undefined;
        const boundaryCollision = checkBoundaryCollision(updatedBird);

        // Physical collision (for bouncing) - always happens when touching
        const hasPhysicalCollision = pipeCollision || boundaryCollision;

        // Damage collision (for life deduction) - respects cooldown system
        // Calculate time since last collision for cooldown system
        const timeSinceLastCollision = newTime - currentState.lastCollisionTime;
        const canTakeDamage =
            timeSinceLastCollision >= Constants.COLLISION_COOLDOWN_MS;
        // Check if this is a different pipe (different pipe = can cause damage)
        const isDifferentPipe =
            collidedPipe?.id !== currentState.lastCollisionPipeId;
        // Damage occurs if: collision happened AND (cooldown expired OR different pipe)
        const hasDamageCollision =
            hasPhysicalCollision && (canTakeDamage || isDifferentPipe);
        // Track bird's path for ghost bird replay system
        const newCurrentRun = [...currentState.currentRun, updatedBird.pos];

        // Check victory condition: all pipes from CSV spawned AND all pipes cleared
        const allPipesCleared =
            currentState.pipeSpawnIndex >= currentState.pipeSpawnQueue.length &&
            scoredPipes.length === 0;

        // POWER-UP SPAWNING SYSTEM
        // Check if it's time to spawn power-ups (based on game time)
        const spawnResult = shouldSpawnPowerUp(
            currentState,
            currentState.rngSeed,
        );

        // Pure functional approach for power-up spawning
        // Helper function that conditionally spawns a power-up
        const spawnPowerUpIfNeeded = (
            existingPowerUps: ReadonlyArray<PowerUp>,
            shouldSpawn: boolean,
            powerUpType: PowerUpType,
            seed: number,
            idOffset: number,
        ) => {
            // If shouldn't spawn, return existing power-ups unchanged
            if (!shouldSpawn) return existingPowerUps;

            // Spawn in middle third of screen (33% to 67% of height)
            // This avoids spawning too close to screen edges
            const middleStart = Viewport.CANVAS_HEIGHT * 0.33;
            const middleEnd = Viewport.CANVAS_HEIGHT * 0.67;
            const yPosition = randomBetween(
                seed,
                middleStart,
                middleEnd - Constants.POWERUP_SIZE,
            );

            // Add new power-up to existing array
            return [
                ...existingPowerUps,
                createPowerUp(
                    newTime + idOffset, // Unique ID based on time
                    Viewport.CANVAS_WIDTH, // Spawn at right edge
                    yPosition.value, // Random Y position
                    powerUpType,
                ),
            ];
        };

        // Apply spawning logic functionally (chain the spawning functions)
        // Step 1: Try to spawn shrink power-up
        const powerUpsWithShrink = spawnPowerUpIfNeeded(
            powerUpsAfterCollection,
            spawnResult.shouldSpawnShrink,
            "shrink",
            spawnResult.nextSeed,
            0, // ID offset for uniqueness
        );

        // Step 2: Try to spawn slow-down power-up (using result from step 1)
        const workingPowerUps = spawnPowerUpIfNeeded(
            powerUpsWithShrink,
            spawnResult.shouldSpawnSlowDown,
            "slowDown",
            spawnResult.nextSeed + 1000, // Different seed for randomness
            1, // Different ID offset for uniqueness
        );

        // Calculate new spawn count functionally (for statistics tracking)
        const newPowerUpsSpawned =
            currentState.powerUpsSpawned +
            (spawnResult.shouldSpawnShrink ? 1 : 0) +
            (spawnResult.shouldSpawnSlowDown ? 1 : 0);

        // CREATE NEW GAME STATE
        // Combine all updates into a single new state object (immutable update)
        const baseState = {
            ...currentState,
            // Update game entities
            bird: updatedBird,
            pipes: scoredPipes,
            powerUps: workingPowerUps,
            // Update game metrics
            score: newScore,
            time: newTime,
            gameTime: newGameTime,
            currentRun: newCurrentRun,
            // Update game state flags
            gameEnd: allPipesCleared,
            gameWon: allPipesCleared,
            // Update power-up effects
            shrinkActive: newShrinkActive,
            shrinkEndTime: newShrinkEndTime,
            slowDownActive: newSlowDownActive,
            slowDownEndTime: newSlowDownEndTime,
            slowDownMultiplier: finalSpeedMultiplier,
            // Update statistics
            powerUpsSpawned: newPowerUpsSpawned,
            powerUpsCollected: newPowerUpsCollected,
            // Update random seed for deterministic behavior
            rngSeed: spawnResult.nextSeed,
        } as const;

        // COLLISION RESPONSE SYSTEM
        // Handle collision consequences: bouncing and life deduction
        if (hasPhysicalCollision) {
            // Calculate bounce physics (separate from damage logic)
            const bounceComputation = calculateBounce(
                updatedBird,
                scoredPipes,
                boundaryCollision,
                baseState.rngSeed,
            );
            // Apply bounce velocity to bird
            const bouncedBird = bounceBird(
                baseState.bird,
                bounceComputation.bounceVelocity,
            );

            // Life deduction: only if damage collision occurred (respects cooldown)
            const newLives = hasDamageCollision
                ? baseState.lives - 1
                : baseState.lives;

            // Return collision state with all updates
            return {
                ...baseState,
                bird: bouncedBird,
                lives: newLives,
                gameEnd: baseState.gameEnd || newLives <= 0,
                gameWon: baseState.gameWon && newLives > 0,
                slowDownActive: newSlowDownActive,
                slowDownEndTime: newSlowDownEndTime,
                slowDownMultiplier: finalSpeedMultiplier,
                rngSeed: bounceComputation.nextSeed, // Updated random seed
                // Collision tracking: only update if damage occurred (for cooldown system)
                lastCollisionTime: hasDamageCollision
                    ? newTime
                    : baseState.lastCollisionTime,
                lastCollisionPipeId: hasDamageCollision
                    ? (collidedPipe?.id ?? -1) // Use collided pipe ID or -1 if boundary
                    : baseState.lastCollisionPipeId,
            };
        }

        // No collision occurred - return normal updated state
        return baseState;
    }
}

/**
 * Flap Action - Handles bird flapping and game state transitions
 *
 * Demonstrates state-dependent behavior using functional composition:
 * - Game over: automatically restart (UX convenience)
 * - Paused: no effect (ignore input during pause)
 * - Not started: start game and flap simultaneously
 * - Normal play: just flap the bird
 */
export class Flap implements Action {
    apply(currentState: State): State {
        // Auto-restart on game over
        if (currentState.gameEnd) return new Restart().apply(currentState);

        // Ignore input during pause
        if (currentState.isPaused) return currentState;

        // First flap starts the game and resets game timer
        if (!currentState.gameStarted)
            return {
                ...currentState,
                bird: flapBird(currentState.bird), // Apply flap
                gameStarted: true,
                gameTime: 0, // Reset game-specific timer
            };

        return { ...currentState, bird: flapBird(currentState.bird) };
    }
}

/**
 * Pause Action - Toggles game pause state with countdown resume
 *
 * Implements a user-friendly pause system:
 * - Only works during active gameplay
 * - Unpausing triggers a 3-second countdown
 * - Countdown prevents jarring instant resume
 *
 * State transitions handled functionally with clear conditions
 */
export class Pause implements Action {
    apply(currentState: State): State {
        // Only allow pause during active gameplay
        if (!currentState.gameStarted || currentState.gameEnd)
            return currentState;

        if (currentState.isPaused) {
            // Unpause: start countdown before resuming
            return {
                ...currentState,
                isPaused: false,
                countdown: 3,
                countdownTime: currentState.time, // Record when countdown started
            };
        }

        // Pause: stop gameplay immediately
        return {
            ...currentState,
            isPaused: true,
            countdown: 0,
            countdownTime: 0,
        };
    }
}

/**
 * Restart Action - Resets game while preserving history for ghost birds
 *
 * Demonstrates functional state management:
 * - Preserves game history for ghost bird feature
 * - Resets to initial state while maintaining continuity
 * - Increments game counter for session tracking
 *
 * The conditional history update shows functional approach to state changes:
 * only add to history if there's actually a run to record
 */
export class Restart implements Action {
    apply(currentState: State): State {
        // Conditionally add current run to history (functional style)
        const newGameHistory =
            currentState.currentRun.length > 0
                ? [
                      ...currentState.gameHistory, // Preserve existing history
                      {
                          birdPositions: currentState.currentRun,
                          timestamp: currentState.time,
                      },
                  ]
                : currentState.gameHistory; // No change if no run to record

        return {
            ...initialState, // Reset to clean state
            // Preserve data needed across games
            pipeSpawnQueue: currentState.originalPipeSpawnQueue,
            originalPipeSpawnQueue: currentState.originalPipeSpawnQueue,
            gameHistory: newGameHistory,
            gameCount: currentState.gameCount + 1, // Increment for session tracking
        };
    }
}

export class SpawnPipe implements Action {
    constructor(
        private pipeData: PipeData,
        private pipeId: number,
    ) {}
    apply(currentState: State): State {
        const newPipe = createPipe(
            this.pipeId,
            Viewport.CANVAS_WIDTH,
            this.pipeData.gapY,
            this.pipeData.gapHeight,
        );
        return {
            ...currentState,
            pipes: [...currentState.pipes, newPipe],
            pipeSpawnIndex: currentState.pipeSpawnIndex + 1,
        };
    }
}

const createPowerUp = (
    id: number,
    x: number,
    y: number,
    type: PowerUpType,
): PowerUp => ({
    id,
    type,
    pos: { x, y },
    collected: false,
});

const getCurrentBirdRadius = (state: State): number => {
    const baseRadius = Math.min(Birb.WIDTH, Birb.HEIGHT) / 2 - 8;
    return state.shrinkActive
        ? baseRadius * Constants.SHRINK_SCALE
        : baseRadius;
};

// Pure function to calculate current speed multiplier with decay
const getCurrentSpeedMultiplier = (
    state: State,
    currentTime: number,
): number => {
    if (!state.slowDownActive || currentTime >= state.slowDownEndTime) {
        return 1.0; // Normal speed
    }
    //Calculate how long the effect has been running
    const elapsed =
        currentTime - (state.slowDownEndTime - Constants.SLOW_DOWN_DURATION);
    const progress = elapsed / Constants.SLOW_DOWN_DURATION;

    // Calculate the current speed multiplier
    const currentMultiplier =
        Constants.SLOW_DOWN_MIN_MULTIPLIER * (1 - progress) + 1.0 * progress;

    return Math.min(1.0, currentMultiplier);
};

const updatePowerUps = (
    powerUps: ReadonlyArray<PowerUp>,
): ReadonlyArray<PowerUp> =>
    powerUps
        .map(powerUp => ({
            ...powerUp,
            pos: { ...powerUp.pos, x: powerUp.pos.x - Constants.POWERUP_SPEED },
        }))
        .filter(
            powerUp =>
                powerUp.pos.x + Constants.POWERUP_SIZE >
                Constants.OFFSCREEN_THRESHOLD,
        );

const checkPowerUpCollision = (bird: Bird, powerUp: PowerUp): boolean => {
    const birdLeft = bird.pos.x - bird.radius;
    const birdRight = bird.pos.x + bird.radius;
    const birdTop = bird.pos.y - bird.radius;
    const birdBottom = bird.pos.y + bird.radius;

    const powerUpLeft = powerUp.pos.x;
    const powerUpRight = powerUp.pos.x + Constants.POWERUP_SIZE;
    const powerUpTop = powerUp.pos.y;
    const powerUpBottom = powerUp.pos.y + Constants.POWERUP_SIZE;

    return (
        birdRight > powerUpLeft &&
        birdLeft < powerUpRight &&
        birdBottom > powerUpTop &&
        birdTop < powerUpBottom
    );
};

const shouldSpawnPowerUp = (
    state: State,
    seed: number,
): {
    shouldSpawnShrink: boolean;
    shouldSpawnSlowDown: boolean;
    nextSeed: number;
} => {
    const gameTimeSeconds = state.gameTime / 1000;

    // Check if shrink power-up already exists (spawned but not collected)
    const hasShrinkPowerUp = state.powerUps.some(
        p => p.type === "shrink" && !p.collected,
    );

    // Check if slow down power-up already exists (spawned but not collected)
    const hasSlowDownPowerUp = state.powerUps.some(
        p => p.type === "slowDown" && !p.collected,
    );

    // Spawn shrink power-up at 10 seconds (if not already present)
    const shouldSpawnShrink =
        gameTimeSeconds >= 10 && gameTimeSeconds < 10.1 && !hasShrinkPowerUp;

    // Spawn slow down power-up at 20 seconds (if not already present)
    const shouldSpawnSlowDown =
        gameTimeSeconds >= 20 && gameTimeSeconds < 20.1 && !hasSlowDownPowerUp;

    return {
        shouldSpawnShrink,
        shouldSpawnSlowDown,
        nextSeed: seed,
    };
};

/**
 * Update bird position with gravity and boundary clamping
 *
 * Physics simulation using pure functional approach:
 * - Applies gravity to velocity (acceleration)
 * - Updates position based on new velocity
 * - Clamps position to screen boundaries
 * - Returns new bird object (immutable)
 *
 * This demonstrates the functional approach to physics:
 * - No mutation of input bird object
 * - All calculations explicit and traceable
 * - Easy to test with different bird states
 * - Can be composed with other transformations
 *
 * @param bird
 * @returns
 */
export const updateBirdPosition = (bird: Bird): Bird => {
    // Apply gravity to vertical velocity (physics simulation)
    const newVelY = bird.vel.y + Constants.GRAVITY;

    // Calculate new position using updated velocity
    const newPosY = bird.pos.y + newVelY;

    return {
        ...bird,
        pos: {
            x: bird.pos.x,
            y: clamp(
                newPosY,
                bird.radius,
                Viewport.CANVAS_HEIGHT - bird.radius,
            ),
        },
        vel: { ...bird.vel, y: newVelY },
    };
};

export const flapBird = (bird: Bird): Bird => ({
    ...bird,
    vel: { ...bird.vel, y: Constants.FLAP_STRENGTH },
});

const bounceBird = (bird: Bird, bounceVelocity: number): Bird => ({
    ...bird,
    vel: { ...bird.vel, y: bounceVelocity },
});

/**
 * Move pipes left across the screen - Curried function demonstration
 *
 * This function shows how currying works in functional programming:
 * 1. Currying: Function that returns a function
 * 2. Partial application: Can pre-configure speed multiplier
 * 3. Pure transformation: Creates new pipe objects instead of mutating
 * 4. Immutable updates: Uses spread operator to preserve other properties
 *
 * Currying benefits:
 * - Can create specialized versions: movePipes(0.5) for slow mode
 * - Enables function composition and pipeline operations
 * - Makes the code more modular and reusable
 *
 * @param speedMultiplier - Speed modifier (1.0 = normal, 0.5 = half speed, etc.)
 * @returns Function that takes pipes array and returns moved pipes
 */
const movePipes =
    (speedMultiplier: number = 1.0) =>
    (pipes: ReadonlyArray<Pipe>): ReadonlyArray<Pipe> =>
        pipes.map(pipe => ({
            ...pipe,
            x: pipe.x - Constants.PIPE_SPEED * speedMultiplier, // Update position
        }));

const removeOffscreenPipes = (
    pipes: ReadonlyArray<Pipe>,
): ReadonlyArray<Pipe> =>
    pipes.filter(pipe => pipe.x + pipe.width > Constants.OFFSCREEN_THRESHOLD);

export const checkBirdPipeCollision = (bird: Bird, pipe: Pipe): boolean => {
    const birdLeft = bird.pos.x - bird.radius;
    const birdRight = bird.pos.x + bird.radius;
    const birdTop = bird.pos.y - bird.radius;
    const birdBottom = bird.pos.y + bird.radius;
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + pipe.width;
    const gapTop = pipe.gapY - pipe.gapHeight / 2;
    const gapBottom = pipe.gapY + pipe.gapHeight / 2;
    if (birdRight > pipeLeft && birdLeft < pipeRight) {
        return birdTop < gapTop || birdBottom > gapBottom;
    }
    return false;
};

const checkBoundaryCollision = (bird: Bird): boolean =>
    bird.pos.y <= bird.radius ||
    bird.pos.y >= Viewport.CANVAS_HEIGHT - bird.radius;

/**
 * Update score when bird passes through pipes
 *
 * This function handles the scoring system:
 * 1. Mark pipes as "passed" when bird completely passes through them
 * 2. Find newly passed pipes (changed from not-passed to passed this frame)
 * 3. Award 1 point per newly passed pipe
 * 4. Prevent double-scoring by tracking passed state
 *
 * @param bird
 * @param pipes
 * @param currentScore
 * @returns
 */
export const updateScore = (
    bird: Bird,
    pipes: ReadonlyArray<Pipe>,
    currentScore: number,
): { score: number; pipes: ReadonlyArray<Pipe> } => {
    // Mark pipes as passed if bird is completely past them
    const updatedPipes = pipes.map(pipe =>
        !pipe.passed && bird.pos.x > pipe.x + pipe.width // Not passed yet and bird past right edge
            ? { ...pipe, passed: true } // Mark as passed
            : pipe,
    );

    //  Find pipes that were just passed this frame (prevent double-scoring)
    const newlyPassedPipes = updatedPipes.filter(
        (pipe, index) => pipe.passed && !pipes[index].passed, // Now passed but wasn't passed before
    );

    // Return updated score and pipe states
    return {
        score: currentScore + newlyPassedPipes.length, // Add 1 point per newly passed pipe
        pipes: updatedPipes, // Return updated pipe states
    };
};

/**
 * Parse CSV pipe data into game-ready format
 *
 * Pure data transformation function:
 * - Takes raw CSV string as input
 * - Returns structured pipe data array
 * - No side effects or external dependencies
 * - Handles data format conversion (seconds to milliseconds)
 *
 * Functional programming principles:
 * - Immutable transformation: doesn't modify input
 * - Composable: can be chained with other transformations
 * - Predictable: same CSV always produces same result
 * - Testable: easy to verify with sample CSV data
 *
 * @param csvContent - Raw CSV file content as string
 * @returns Array of pipe spawn data ready for game use
 */
export const parseCSV = (csvContent: string): ReadonlyArray<PipeData> => {
    // Remove whitespace and skip header row
    const lines = csvContent.trim().split("\n").slice(1);

    // Transform each line into structured data
    return lines.map(line => {
        const [gapY, gapHeight, time] = line.split(",").map(Number);
        return {
            gapY, // Normalized gap center (0-1)
            gapHeight, // Normalized gap size (0-1)
            spawnTime: time * 1000,
        };
    });
};

export const reduceState = (s: State, action: Action): State => action.apply(s);

/**
 * Calculate bounce velocity and direction after collision
 *
 * Pure function that determines how the bird should bounce based on:
 * - What it hit (boundary vs pipe)
 * - Where it hit (top vs bottom)
 * - Random velocity magnitude for gameplay variety
 *
 * Functional design principles:
 * - Pure: same inputs always produce same outputs
 * - No side effects: doesn't modify any external state
 * - Testable: easy to unit test with various collision scenarios
 * - Composable: can be used in different contexts
 *
 * @param bird
 * @param pipes
 * @param boundaryCollision
 * @param seed
 * @returns
 */
const calculateBounce = (
    bird: Bird,
    pipes: ReadonlyArray<Pipe>,
    boundaryCollision: boolean,
    seed: number,
): { bounceVelocity: number; nextSeed: number } => {
    // Generate random bounce magnitude using functional RNG
    const randomResult = randomBetween(
        seed,
        Constants.BOUNCE_VELOCITY_MIN,
        Constants.BOUNCE_VELOCITY_MAX,
    );

    if (boundaryCollision) {
        // Boundary collision: bounce direction depends on which boundary
        const velocity =
            bird.pos.y <= bird.radius
                ? randomResult.value // Hit top boundary -> bounce down (positive)
                : -randomResult.value; // Hit bottom boundary -> bounce up (negative)
        return {
            bounceVelocity: velocity,
            nextSeed: randomResult.seed,
        };
    }

    // Pipe collision: find which pipe was hit and determine bounce direction
    const collidedPipe = pipes.find(pipe => checkBirdPipeCollision(bird, pipe));

    if (collidedPipe) {
        const gapCenter = collidedPipe.gapY;
        // Bounce direction depends on which half of the pipe was hit
        const velocity =
            bird.pos.y < gapCenter
                ? randomResult.value // Hit top half of pipe will bounce down
                : -randomResult.value; // Hit bottom half of pipe will bounce up
        return {
            bounceVelocity: velocity,
            nextSeed: randomResult.seed,
        };
    }

    // Fallback case: just bounce up
    return { bounceVelocity: randomResult.value, nextSeed: randomResult.seed };
};
