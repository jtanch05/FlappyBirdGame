import { assert, describe, expect, it } from "vitest";
import { state$ } from "../src/main";
import { clamp } from "../src/util";
import {
    updateBirdPosition,
    flapBird,
    checkBirdPipeCollision,
    updateScore,
    parseCSV,
    createBird,
    createPipe,
    initialState,
    Tick,
    Flap,
    Restart,
    Constants,
    Pause,
} from "../src/state";
import { Bird, GameHistory, Pipe, State } from "../src/types";
import { calculateGhostPositions } from "../src/observable";

describe("Core Game Mechanics", () => {
    describe("Bird Physics & Movement", () => {
        it("should apply gravity, handle flapping, and respect boundaries", () => {
            // Test gravity
            const bird: Bird = {
                ...createBird(100, 150),
                vel: { x: 0, y: 0 },
            };
            const movedBird = updateBirdPosition(bird);
            expect(movedBird.vel.y).toBe(Constants.GRAVITY);
            expect(movedBird.pos.y).toBe(150 + Constants.GRAVITY);

            // Test flapping
            const flappedBird = flapBird(bird);
            expect(flappedBird.vel.y).toBe(Constants.FLAP_STRENGTH);

            // Test boundary clamping
            const birdAtTop: Bird = {
                ...createBird(100, 5),
                vel: { x: 0, y: -10 },
            };
            const clampedBird = updateBirdPosition(birdAtTop);
            expect(clampedBird.pos.y).toBe(birdAtTop.radius);
        });
    });

    describe("Collision & Scoring", () => {
        it("should detect collisions and update score correctly", () => {
            const bird: Bird = createBird(100, 100);

            // Test pipe collision (bird hits obstacle)
            const collidingPipe: Pipe = createPipe(1, 90, 0.7, 0.2);
            expect(checkBirdPipeCollision(bird, collidingPipe)).toBe(true);

            // Test no collision (bird passes through gap)
            const birdInGap: Bird = createBird(100, 200); // Bird positioned in gap area
            const safePipe: Pipe = createPipe(1, 90, 0.5, 0.5);
            expect(checkBirdPipeCollision(birdInGap, safePipe)).toBe(false);

            // Test scoring when bird passes pipe
            const birdPastPipe: Bird = createBird(160, 200);
            const scoringPipe: Pipe = {
                ...createPipe(1, 100, 0.5, 0.3),
                passed: false,
            };
            const { score, pipes } = updateScore(
                birdPastPipe,
                [scoringPipe],
                0,
            );
            expect(score).toBe(1);
            expect(pipes[0].passed).toBe(true);
        });
    });

    describe("Data Processing", () => {
        it("should parse CSV pipe data correctly", () => {
            const csvContent = "gapY,gapHeight,time\n0.5,0.3,2\n0.6,0.25,4";
            const pipeData = parseCSV(csvContent);

            expect(pipeData).toHaveLength(2);
            expect(pipeData[0]).toEqual({
                gapY: 0.5,
                gapHeight: 0.3,
                spawnTime: 2000,
            });
        });
    });

    describe("Slow Down Power-up", () => {
        it("should activate slow down and decay over time", () => {
            // Create initial state with slow down collected
            const initialSlowDownState = {
                ...initialState,
                gameStarted: true,
                time: 1000,
                slowDownActive: true,
                slowDownEndTime: 1000 + Constants.SLOW_DOWN_DURATION,
                slowDownMultiplier: Constants.SLOW_DOWN_MIN_MULTIPLIER,
                pipes: [createPipe(1, 400, 0.5, 0.3)],
            };

            // Test initial slow down (should be at minimum)
            expect(initialSlowDownState.slowDownMultiplier).toBe(
                Constants.SLOW_DOWN_MIN_MULTIPLIER,
            );

            // Simulate time passing (halfway through duration)
            const halfwayTimeState = {
                ...initialSlowDownState,
                time: 1000 + Constants.SLOW_DOWN_DURATION / 2,
            };
            const halfwayState = new Tick().apply(halfwayTimeState);

            // Speed should be between min and 1.0 (effect wearing off)
            expect(halfwayState.slowDownMultiplier).toBeGreaterThan(
                Constants.SLOW_DOWN_MIN_MULTIPLIER,
            );
            expect(halfwayState.slowDownMultiplier).toBeLessThan(1.0);

            // Simulate slow down expiring
            const expiredTimeState = {
                ...initialSlowDownState,
                time: 1000 + Constants.SLOW_DOWN_DURATION + 100,
            };
            const expiredState = new Tick().apply(expiredTimeState);

            // Speed should return to normal
            expect(expiredState.slowDownActive).toBe(false);
            expect(expiredState.slowDownMultiplier).toBe(1.0);
        });

        it("should spawn shrink and slow down power-ups separately", () => {
            // Test that both power-ups can exist independently
            // Create a state where both power-ups should be present
            const stateWithBothPowerUps = {
                ...initialState,
                gameStarted: true,
                gameTime: 25000, // 25 seconds - after both spawn times
                time: 25000,
                powerUps: [
                    {
                        id: 1,
                        type: "shrink" as const,
                        pos: { x: 500, y: 100 },
                        collected: false,
                    },
                    {
                        id: 2,
                        type: "slowDown" as const,
                        pos: { x: 500, y: 200 },
                        collected: false,
                    },
                ],
                powerUpsSpawned: 2,
            };

            const shrinkPowerUps = stateWithBothPowerUps.powerUps.filter(
                p => p.type === "shrink",
            );
            const slowDownPowerUps = stateWithBothPowerUps.powerUps.filter(
                p => p.type === "slowDown",
            );

            expect(shrinkPowerUps).toHaveLength(1);
            expect(slowDownPowerUps).toHaveLength(1);
            expect(stateWithBothPowerUps.powerUps).toHaveLength(2);
        });
    });
});

describe("Game State Management", () => {
    describe("Game Flow Control", () => {
        it("should handle game start, collision, and game over", () => {
            // Test game start
            const initialGameState = { ...initialState, gameStarted: false };
            const startedState = new Flap().apply(initialGameState);
            expect(startedState.gameStarted).toBe(true);
            expect(startedState.bird.vel.y).toBe(Constants.FLAP_STRENGTH);

            // Test collision reduces lives
            const collidingPipe = createPipe(
                1,
                initialState.bird.pos.x,
                0.1,
                0.15,
            );
            const collisionState = {
                ...initialState,
                gameStarted: true,
                pipes: [collidingPipe],
                lives: 2,
            };
            const afterCollision = new Tick().apply(collisionState);
            expect(afterCollision.lives).toBe(1);

            // Test game over when lives reach zero
            const gameOverState = { ...collisionState, lives: 1 };
            const gameOver = new Tick().apply(gameOverState);
            expect(gameOver.gameEnd).toBe(true);
            expect(gameOver.lives).toBe(0);
        });

        it("should restart game and preserve history", () => {
            const endedState = {
                ...initialState,
                gameEnd: true,
                score: 10,
                currentRun: [{ x: 100, y: 200 }],
            };

            // Test restart via flap
            const restartedState = new Flap().apply(endedState);
            expect(restartedState.gameEnd).toBe(false);
            expect(restartedState.score).toBe(0);
            expect(restartedState.gameHistory).toHaveLength(1);

            // Test direct restart
            const directRestart = new Restart().apply(endedState);
            expect(directRestart.score).toBe(0);
            expect(directRestart.lives).toBe(Constants.INITIAL_LIVES);
            expect(directRestart.gameStarted).toBe(false);
        });

        it("should handle pause, countdown, and resume", () => {
            const runningState: State = {
                ...initialState,
                gameStarted: true,
                time: 10000,
            };

            // Test pausing the game
            const pausedState = new Pause().apply(runningState);
            expect(pausedState.isPaused).toBe(true);
            expect(pausedState.countdown).toBe(0);

            // Test unpausing the game (starts countdown)
            const unpausedState = new Pause().apply(pausedState);
            expect(unpausedState.isPaused).toBe(false);
            expect(unpausedState.countdown).toBe(3);
            expect(unpausedState.countdownTime).toBe(runningState.time);

            // Test countdown logic
            // 1. Tick right after unpausing
            const tick1 = new Tick().apply(unpausedState);
            expect(tick1.countdown).toBe(3);
            expect(tick1.gameTime).toBe(0); // Game time should not advance

            // 2. Tick after 1 second
            const stateAfter1Sec: State = { ...unpausedState, time: 11000 };
            const tick2 = new Tick().apply(stateAfter1Sec);
            expect(tick2.countdown).toBe(2);

            // 3. Tick after 2 seconds
            const stateAfter2Sec: State = { ...unpausedState, time: 12000 };
            const tick3 = new Tick().apply(stateAfter2Sec);
            expect(tick3.countdown).toBe(1);

            // 4. Tick after 3 seconds (countdown finishes)
            const stateAfter3Sec: State = { ...unpausedState, time: 13000 };
            const tick4 = new Tick().apply(stateAfter3Sec);
            expect(tick4.countdown).toBe(0);

            // 5. Game should resume now (gameTime advances)
            const resumedTick = new Tick().apply(tick4);
            expect(resumedTick.gameTime).toBeGreaterThan(0);
        });
    });

    describe("Game State Protection", () => {
        it("should not update when paused or ended", () => {
            const pausedState = {
                ...initialState,
                gameStarted: true,
                isPaused: true,
            };
            const endedState = { ...initialState, gameEnd: true };

            const pausedResult = new Tick().apply(pausedState);
            const endedResult = new Tick().apply(endedState);

            expect(pausedResult).toEqual(pausedState);
            expect(endedResult).toEqual(endedState);
        });
    });
});

describe("Advanced Features", () => {
    it("should sync ghost replay frame-by-frame", () => {
        const mockHistory: ReadonlyArray<GameHistory> = [
            {
                birdPositions: [
                    { x: 10, y: 10 }, // Frame 0
                    { x: 11, y: 12 }, // Frame 1
                    { x: 12, y: 15 }, // Frame 2
                ],
                timestamp: 12345,
            },
        ];
        const runningState: State = { ...initialState, gameStarted: true };

        // Frame 0
        const ghostsFrame0 = calculateGhostPositions(
            mockHistory,
            0,
            runningState,
        );
        expect(ghostsFrame0).toHaveLength(1);
        expect(ghostsFrame0[0]).toEqual({ x: 10, y: 10 });

        // Frame 2
        const ghostsFrame2 = calculateGhostPositions(
            mockHistory,
            2,
            runningState,
        );
        expect(ghostsFrame2).toHaveLength(1);
        expect(ghostsFrame2[0]).toEqual({ x: 12, y: 15 });

        // Frame 3 (ghost run has ended)
        const ghostsFrame3 = calculateGhostPositions(
            mockHistory,
            3,
            runningState,
        );
        expect(ghostsFrame3).toHaveLength(0);

        // Should be empty if game not started
        const notStartedState = { ...initialState, gameStarted: false };
        const noGhosts = calculateGhostPositions(
            mockHistory,
            0,
            notStartedState,
        );
        expect(noGhosts).toHaveLength(0);
    });
});

describe("Utility Functions", () => {
    it("should clamp values correctly", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
    });
});

describe("Main Module", () => {
    it("should export state$ as a function", () => {
        assert.isDefined(state$);
        assert.isFunction(state$);
    });
});
