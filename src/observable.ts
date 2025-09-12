/**
 * Reactive Functional Programming (RxJS) implementation for Flappy Bird
 *
 * This module demonstrates core FRP concepts:
 * - Event streams as data that flows through the application
 * - Declarative composition of different data streams
 * - Stream combination patterns for complex state management
 * - Higher-order functions that create and transform streams
 *
 * Architecture: Unidirectional data flow
 * Input Events → Actions → State Transformations → View Updates
 */

import {
    Observable,
    combineLatest,
    distinctUntilChanged,
    filter,
    fromEvent,
    interval,
    map,
    merge,
    scan,
    shareReplay,
    startWith,
    withLatestFrom,
    from,
    mergeMap,
    Subject,
} from "rxjs";
import {
    Flap,
    Pause,
    Restart,
    Tick,
    initialState,
    parseCSV,
    reduceState,
    Constants,
    SpawnPipe,
} from "./state";
import { Key, State, Vec2, Action, GameHistory } from "./types";

/**
 * Pure function to calculate ghost positions based on game state and history.
 * This is exported so we can test it separately.
 * @param historicalRecords The recorded histories of all previous games.
 * @param animationFrame The current animation frame, derived from gameTime.
 * @param gameState The current game state.
 * @returns An array of Vec2 positions for all active ghosts.
 */
export const calculateGhostPositions = (
    historicalRecords: ReadonlyArray<GameHistory>,
    animationFrame: number,
    gameState: State,
): ReadonlyArray<Vec2> => {
    // Don't show ghosts before game starts or if no history exists
    if (!gameState.gameStarted || historicalRecords.length === 0) {
        return [];
    }

    // Extract bird position at current frame from each completed game
    // This creates the "replay" effect
    return historicalRecords
        .map(pastGameRecord => {
            // Check if this game lasted long enough to have a position at current frame
            if (animationFrame < pastGameRecord.birdPositions.length) {
                return pastGameRecord.birdPositions[animationFrame];
            }
            return null; // No position for this frame (game was shorter)
        })
        .filter((birdPosition): birdPosition is Vec2 => birdPosition !== null); // Remove null positions
};

/**
 * Main state observable factory - creates the complete reactive system
 *
 * FRP Design Patterns Demonstrated:
 * 1. Stream Composition: Multiple input streams merged into one action stream
 * 2. State Accumulation: scan() works like reduce() but for streams over time
 * 3. Stream Sharing: shareReplay() lets multiple parts use the same stream
 * 4. Derived Streams: Complex features built by combining simpler streams
 * 5. Time-based Synchronization: Ghost replay synchronized with game time
 */
export const state$ = (csvData: string): Observable<State> => {
    // Parse CSV data into pipe spawn queue - pure transformation
    const pipeSpawnQueue = parseCSV(csvData);

    // Base keyboard event stream - single source of truth for all input
    const keyboardEvents$ = fromEvent<KeyboardEvent>(document, "keydown");

    /**
     * Creates a filtered keyboard event stream for a specific key.
     * - Filters out key repeats to prevent spam.
     */
    const createKeyStream = (keyCode: Key) =>
        keyboardEvents$.pipe(
            filter(({ code }) => code === keyCode),
            filter(({ repeat }) => !repeat), // Prevent key repeat spam
        );

    // Game loop: 60fps tick rate (16ms intervals) mapped to Tick actions
    const tick$ = interval(Constants.TICK_RATE_MS).pipe(map(() => new Tick()));

    // Input streams: Transform raw keyboard events into game actions
    const spaceKeyInput$ = createKeyStream("Space");
    const flap$ = spaceKeyInput$.pipe(map(() => new Flap()));
    const pause$ = createKeyStream("KeyP").pipe(map(() => new Pause()));
    const restart$ = createKeyStream("KeyR").pipe(map(() => new Restart()));

    // A proxy subject to break the circular dependency between state and pipe generation.
    // coreGameState$ needs all actions, but pipeGenerationStream$ needs the state.
    
    // coreGameState$ needs ALL actions including pipe actions
    //the core game state needs all actions including pipe actions, 
    // but the pipe generation logic needs the current game state to determine when to spawn pipes, creating a circular dependency
    // Can merge all input actions with the initially-empty pipe action stream
    const pipeActionStream$ = new Subject<Action>();
    const unifiedActionStream$ = merge(
        tick$,
        flap$,
        pause$,
        restart$,
        pipeActionStream$,
    );

    /**
     * Core game state stream using scan() - the heart of our FRP architecture
     *
     * scan() is like Array.reduce() but for streams - accumulates state over time
     * Each action transforms the current state to produce the next state
     * shareReplay() makes this stream shared among all subscribers
     * refCount: true means it stops when no subscribers (saves memory)
     */
    const coreGameState$ = unifiedActionStream$.pipe(
        scan(reduceState, {
            ...initialState,
            pipeSpawnQueue,
            originalPipeSpawnQueue: pipeSpawnQueue,
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    // Stream that handles spawning new pipes at the right time
    const pipeGenerationStream$ = coreGameState$.pipe(
        // OPTIMIZATION: Only check for pipes when timing actually changes
        // Skip processing if both gameTime and pipeSpawnIndex are unchanged
        distinctUntilChanged(
            (previousState, currentState) =>
                previousState.gameTime === currentState.gameTime &&
                previousState.pipeSpawnIndex === currentState.pipeSpawnIndex,
        ),
        // Figure out which pipes are ready to spawn right now
        map(stateSnapshot => {
            // Get all pipes we haven't spawned yet (from current index onwards)
            const remainingSpawnQueue = stateSnapshot.pipeSpawnQueue.slice(
                stateSnapshot.pipeSpawnIndex,
            );

            // Find the first pipe that's NOT ready yet (spawnTime > gameTime)
            const firstNotReadyIndex = remainingSpawnQueue.findIndex(
                pipeData => stateSnapshot.gameTime < pipeData.spawnTime,
            );

            // Get all pipes that ARE ready to spawn (before the first unready one)
            const readyPipesForSpawn =
                firstNotReadyIndex === -1
                    ? remainingSpawnQueue // All remaining pipes are ready
                    : remainingSpawnQueue.slice(0, firstNotReadyIndex); // Only pipes before unready one

            return { emit: readyPipesForSpawn, time: stateSnapshot.time };
        }),
        // Only continue if we actually have pipes to spawn
        filter(({ emit }) => emit.length > 0),
        //Get the latest game state for generating unique pipe ID
        withLatestFrom(coreGameState$),
        //  Create individual SpawnPipe actions for each ready pipe
        // mergeMap flattens the array of pipes into separate emissions
        mergeMap(([{ emit }, latestGameState]) =>
            from(emit).pipe(
                map((pipeData, indexOffset) => {
                    // Create unique ID: gameCount in high bits + spawn index in low bits
                    // This ensures each pipe has a globally unique identifier
                    const uniquePipeId =
                        (latestGameState.gameCount << 20) +
                        (latestGameState.pipeSpawnIndex + indexOffset);
                    return new SpawnPipe(pipeData, uniquePipeId);
                }),
            ),
        ),
    );

    // Feed the pipe spawning actions back into the action stream.
    pipeGenerationStream$.subscribe(spawnAction =>
        pipeActionStream$.next(spawnAction),
    );

    /**
     * Game history stream for ghost bird system
     * shareReplay() caches the latest value for new subscribers
     * This prevents re-computation when multiple parts need history data
     */
    const gameHistoryStream$ = coreGameState$.pipe(
        map(stateSnapshot => stateSnapshot.gameHistory),
        distinctUntilChanged(), // Only emit when history actually changes
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    /**
     * Animation frame calculator for ghost bird synchronization.
     * - Converts game time to a discrete frame number for array indexing.
     * - distinctUntilChanged() prevents unnecessary ghost position updates.
     */
    const ghostAnimationFrame$ = coreGameState$.pipe(
        map(stateSnapshot =>
            Math.floor(stateSnapshot.gameTime / Constants.TICK_RATE_MS),
        ),
        distinctUntilChanged(),
    );

    /**
     * Ghost bird position stream - demonstrates advanced stream combination
     *
     * combineLatest() waits for all input streams to emit, then combines their latest values
     * This creates a synchronized stream that updates when ANY input changes:
     * - New game history is recorded
     * - Animation frame advances
     * - Game state changes (for game started check)
     *
     * The mapping function extracts the appropriate bird position from each
     * completed game's history, creating multiple ghost birds that replay
     * previous attempts in perfect synchronization with current game time
     */
    const ghostPositionStream$ = combineLatest([
        gameHistoryStream$,
        ghostAnimationFrame$,
        coreGameState$,
    ]).pipe(
        map(([historicalData, frameNumber, currentGameState]) =>
            calculateGhostPositions(
                historicalData,
                frameNumber,
                currentGameState,
            ),
        ),
        startWith([]), // Start with empty array before any games are completed
        distinctUntilChanged(), // Optimize: only emit when ghost positions actually change
    );

    /**
     * Final state stream with ghost birds integrated
     *
     * withLatestFrom() combines the main game state with the latest ghost positions
     * This creates the complete state that includes both live game and ghost replays
     *
     * The pattern here is: primary stream (coreGameState$) drives emissions,
     * secondary stream (ghostPositionStream$) provides additional data for each emission
     */
    return coreGameState$.pipe(
        withLatestFrom(ghostPositionStream$),
        map(([primaryGameState, ghostBirdPositions]) => ({
            ...primaryGameState, // Spread existing state (immutable update pattern)
            ghostBirds: ghostBirdPositions, // Add ghost positions to state
        })),
    );
};
