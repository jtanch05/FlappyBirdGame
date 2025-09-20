/**
 * This module demonstrates key principles:
 * - Separation of Concerns: Pure game logic separate from presentation
 * - Higher-Order Functions: render() returns a configured rendering function
 * - Functional DOM manipulation: Immutable approach to UI updates
 * - State-driven rendering: UI reflects game state, not the other way around
 *
 * Design Philosophy:
 * - Game state drives all visual changes
 * - No game logic in view code
 * - Efficient DOM updates through element reuse
 * - Functional approach to side effects
 */

import { Birb, Viewport, Constants } from "./state";
import { State } from "./types";
import { getAssetUrl } from "./util";

/**
 * Utility Functions for DOM Manipulation
 *
 * These helper functions encapsulate common DOM operations:
 * - Provide consistent behavior across the application
 * - Make the main rendering logic more readable
 * - Enable easy testing of DOM operations
 */

/** Bring element to front by re-appending to parent */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Create SVG element with properties
 *
 * @param namespace - SVG namespace URI
 * @param name - Element tag name
 * @param props - Attributes to set on element
 * @returns SVGElement with specified attributes
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    // Functional approach: apply all properties in one operation
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

/**
 * This demonstrates the higher-order function pattern where a function returns another function:
 * 1. Initialize DOM references and element caches
 * 2. Return the actual rendering function
 *
 * Benefits of this approach:
 * - Closure captures setup state (DOM refs, element caches)
 * - Returned function has access to cached elements for efficiency
 * - Separates initialization from per-frame rendering logic
 * - Enables performance optimizations through element reuse
 *
 * @returns Rendering function that takes State and updates DOM
 */
export const render = (): ((s: State) => void) => {
    // Initialize DOM references
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;
    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    // Configure SVG viewport
    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    /**
     * Element caches for efficient DOM updates
     *
     * Instead of creating/destroying DOM elements every frame,
     * we maintain caches that reuse elements. This provides:
     * - Better performance
     * - Smoother animations
     * - Memory efficiency
     */
    const refs: { bird: SVGElement | null } = {
        bird: null,
    };

    // Map game entity IDs to their DOM elements
    const pipeElements = new Map<
        number,
        { top: SVGElement; bottom: SVGElement }
    >();
    const powerUpElements = new Map<number, SVGElement>();
    const ghostElements = new Map<number, SVGElement>();

    /**
     * The main drawing function - called every frame
     *
     * This function:
     * - Takes current game state as input
     * - Updates DOM to reflect state changes
     * - Uses cached elements for efficiency
     * - Handles element lifecycle (create/update/destroy)
     *
     * Functional principles:
     * - Pure in intent: same state produces same visual output
     * - Side effects contained: all DOM mutations happen here
     */
    return (currentState: State) => {
        // Update UI text elements - simple state reflection
        livesText.textContent = currentState.lives.toString();
        scoreText.textContent = currentState.score.toString();

        // Calculate bird size based on power-up state
        // Demonstrates how game state drives visual presentation
        const birdWidth = currentState.shrinkActive
            ? Birb.WIDTH * Constants.SHRINK_SCALE
            : Birb.WIDTH;
        const birdHeight = currentState.shrinkActive
            ? Birb.HEIGHT * Constants.SHRINK_SCALE
            : Birb.HEIGHT;

        if (!refs.bird) {
            const birdElement = createSvgElement(svg.namespaceURI, "image", {
                "data-game-element": "bird",
                href: getAssetUrl("assets/birb.png"),
                width: `${birdWidth}`,
                height: `${birdHeight}`,
            });
            svg.appendChild(birdElement);
            refs.bird = birdElement;
        }

        // Update bird size and position
        refs.bird.setAttribute("width", `${birdWidth}`);
        refs.bird.setAttribute("height", `${birdHeight}`);
        refs.bird.setAttribute(
            "x",
            `${currentState.bird.pos.x - birdWidth / 2}`,
        );
        refs.bird.setAttribute(
            "y",
            `${currentState.bird.pos.y - birdHeight / 2}`,
        );

        /**
         * Ghost bird rendering - demonstrates efficient DOM management
         *
         * This section shows efficient handling of dynamic element collections:
         * - Track which ghost birds are currently active
         * - Reuse existing DOM elements when possible
         * - Create new elements only when needed
         * - Clean up elements that are no longer needed
         *
         * The pattern: get-or-create followed by update
         */
        const currentGhostIds = new Set<number>(
            currentState.ghostBirds.map((_, ghostIndex) => ghostIndex),
        );

        currentState.ghostBirds.forEach((ghostPosition, ghostIndex) => {
            // Get existing element or create new one
            const existingGhostElement = ghostElements.get(ghostIndex);
            const ghostBirdElement =
                existingGhostElement ??
                (() => {
                    // Create new ghost bird element with visual styling
                    const newGhostElement = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            "data-game-element": `ghost-bird-${ghostIndex}`,
                            href: getAssetUrl("assets/birb.png"),
                            opacity: "0.5",
                            filter: "grayscale(100%)",
                            width: `${Birb.WIDTH}`,
                            height: `${Birb.HEIGHT}`,
                        },
                    );
                    svg.appendChild(newGhostElement);
                    ghostElements.set(ghostIndex, newGhostElement); // Cache for reuse
                    return newGhostElement;
                })();

            // Update ghost position based on game state
            ghostBirdElement.setAttribute(
                "x",
                `${ghostPosition.x - Birb.WIDTH / 2}`,
            );
            ghostBirdElement.setAttribute(
                "y",
                `${ghostPosition.y - Birb.HEIGHT / 2}`,
            );
        });

        // Cleanup: remove ghost birds that are no longer active
        ghostElements.forEach((ghostElement, ghostId) => {
            if (!currentGhostIds.has(ghostId)) {
                svg.removeChild(ghostElement);
                ghostElements.delete(ghostId);
            }
        });

        const currentPipeIds = new Set<number>(
            currentState.pipes.map(pipe => pipe.id),
        );
        currentState.pipes.forEach(pipe => {
            const gapTop = pipe.gapY - pipe.gapHeight / 2;
            const gapBottom = pipe.gapY + pipe.gapHeight / 2;
            const existingPipeElements = pipeElements.get(pipe.id);
            const pipeElementPair =
                existingPipeElements ??
                (() => {
                    const topPipeElement = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            "data-game-element": `pipe-${pipe.id}-top`,
                            href: getAssetUrl("assets/building.png"),
                            preserveAspectRatio: "none",
                            transform: "scale(1, -1)",
                        },
                    );
                    const bottomPipeElement = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            "data-game-element": `pipe-${pipe.id}-bottom`,
                            href: getAssetUrl("assets/building.png"),
                            preserveAspectRatio: "none",
                        },
                    );
                    svg.appendChild(topPipeElement);
                    svg.appendChild(bottomPipeElement);
                    const newPipeElementPair = {
                        top: topPipeElement,
                        bottom: bottomPipeElement,
                    } as const;
                    pipeElements.set(pipe.id, newPipeElementPair);
                    return newPipeElementPair;
                })();
            pipeElementPair.top.setAttribute("x", `${pipe.x}`);
            pipeElementPair.top.setAttribute("y", `${-gapTop}`);
            pipeElementPair.top.setAttribute("width", `${pipe.width}`);
            pipeElementPair.top.setAttribute("height", `${gapTop}`);
            pipeElementPair.bottom.setAttribute("x", `${pipe.x}`);
            pipeElementPair.bottom.setAttribute("y", `${gapBottom}`);
            pipeElementPair.bottom.setAttribute("width", `${pipe.width}`);
            pipeElementPair.bottom.setAttribute(
                "height",
                `${Viewport.CANVAS_HEIGHT - gapBottom}`,
            );
        });
        pipeElements.forEach((pipeElementPair, pipeId) => {
            if (!currentPipeIds.has(pipeId)) {
                svg.removeChild(pipeElementPair.top);
                svg.removeChild(pipeElementPair.bottom);
                pipeElements.delete(pipeId);
            }
        });

        // Render power-ups
        const currentPowerUpIds = new Set<number>(
            currentState.powerUps.map(powerUp => powerUp.id),
        );
        currentState.powerUps.forEach(powerUp => {
            const existingPowerUpElement = powerUpElements.get(powerUp.id);
            const powerUpElement =
                existingPowerUpElement ??
                (() => {
                    const newPowerUpElement = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            "data-game-element": `powerup-${powerUp.id}`,
                            href: getAssetUrl("assets/power-up.png"),
                            width: `${Constants.POWERUP_SIZE}`,
                            height: `${Constants.POWERUP_SIZE}`,
                        },
                    );
                    svg.appendChild(newPowerUpElement);
                    powerUpElements.set(powerUp.id, newPowerUpElement);
                    return newPowerUpElement;
                })();

            powerUpElement.setAttribute("x", `${powerUp.pos.x}`);
            powerUpElement.setAttribute("y", `${powerUp.pos.y}`);
        });

        // Remove power-up elements that are no longer present
        powerUpElements.forEach((powerUpElement, powerUpId) => {
            if (!currentPowerUpIds.has(powerUpId)) {
                svg.removeChild(powerUpElement);
                powerUpElements.delete(powerUpId);
            }
        });

        if (currentState.gameEnd) {
            if (currentState.gameWon) {
                // Show victory screen
                gameOver.setAttribute("visibility", "hidden");
                (svg.querySelector("#victoryImage") as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "image",
                            {
                                id: "victoryImage",
                                href: getAssetUrl("assets/victory.png"),
                                x: "200",
                                y: "150",
                                width: "200",
                                height: "100",
                            },
                        );

                        // Add blinking animation to victory image
                        const animate = createSvgElement(
                            svg.namespaceURI,
                            "animate",
                            {
                                attributeName: "opacity",
                                values: "1;0;1",
                                dur: "1.5s",
                                repeatCount: "indefinite",
                            },
                        );
                        created.appendChild(animate);

                        svg.appendChild(created);
                        return created;
                    })();

                // Add blinking restart text for victory
                (svg.querySelector(
                    "#victoryRestartText",
                ) as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "text",
                            {
                                id: "victoryRestartText",
                                x: "300",
                                y: "300",
                                "text-anchor": "middle",
                                fill: "gold",
                                "font-size": "18",
                                "font-weight": "bold",
                                "font-family": "Arial, sans-serif",
                            },
                        );
                        created.textContent =
                            "Press SPACEBAR to restart the game";

                        // Add blinking animation
                        const animate = createSvgElement(
                            svg.namespaceURI,
                            "animate",
                            {
                                attributeName: "opacity",
                                values: "1;0;1",
                                dur: "1.5s",
                                repeatCount: "indefinite",
                            },
                        );
                        created.appendChild(animate);

                        svg.appendChild(created);
                        return created;
                    })();
            } else {
                // Show game over screen with blinking gameover.png
                gameOver.setAttribute("visibility", "hidden");

                // Create blinking game over image
                (svg.querySelector("#gameOverImage") as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "image",
                            {
                                id: "gameOverImage",
                                href: getAssetUrl("assets/gameover.png"),
                                x: "150",
                                y: "120",
                                width: "300",
                                height: "120",
                            },
                        );

                        // Add synchronized blinking animation
                        const animate = createSvgElement(
                            svg.namespaceURI,
                            "animate",
                            {
                                attributeName: "opacity",
                                values: "1;0;1",
                                dur: "1.5s",
                                repeatCount: "indefinite",
                            },
                        );
                        created.appendChild(animate);

                        svg.appendChild(created);
                        return created;
                    })();

                // Create blinking restart text (positioned close to image)
                (svg.querySelector(
                    "#gameOverRestartText",
                ) as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "text",
                            {
                                id: "gameOverRestartText",
                                x: "300",
                                y: "270",
                                "text-anchor": "middle",
                                fill: "white",
                                "font-size": "18",
                                "font-weight": "bold",
                                "font-family": "Arial, sans-serif",
                            },
                        );
                        created.textContent = "Press SPACEBAR to restart";

                        // Add synchronized blinking animation (same timing as image)
                        const animate = createSvgElement(
                            svg.namespaceURI,
                            "animate",
                            {
                                attributeName: "opacity",
                                values: "1;0;1",
                                dur: "1.5s",
                                repeatCount: "indefinite",
                            },
                        );
                        created.appendChild(animate);

                        svg.appendChild(created);
                        return created;
                    })();

                // Hide victory elements
                const victoryImage = svg.querySelector("#victoryImage");
                const victoryText = svg.querySelector("#victoryRestartText");
                if (victoryImage) victoryImage.remove();
                if (victoryText) victoryText.remove();
            }
        } else {
            // Hide all end game elements
            gameOver.setAttribute("visibility", "hidden");
            const restartText = svg.querySelector("#restartText");
            const victoryImage = svg.querySelector("#victoryImage");
            const victoryText = svg.querySelector("#victoryRestartText");
            const gameOverImage = svg.querySelector("#gameOverImage");
            const gameOverRestartText = svg.querySelector(
                "#gameOverRestartText",
            );
            if (restartText) restartText.remove();
            if (victoryImage) victoryImage.remove();
            if (victoryText) victoryText.remove();
            if (gameOverImage) gameOverImage.remove();
            if (gameOverRestartText) gameOverRestartText.remove();
        }

        if (!currentState.gameStarted && !currentState.gameEnd) {
            (svg.querySelector("#startButton") as SVGElement | null) ??
                (() => {
                    const created = createSvgElement(
                        svg.namespaceURI,
                        "image",
                        {
                            id: "startButton",
                            href: getAssetUrl("assets/start.png"),
                            x: "225",
                            y: "170",
                            width: "150",
                            height: "60",
                        },
                    );
                    svg.appendChild(created);
                    return created;
                })();
        } else {
            const startButton = svg.querySelector("#startButton");
            if (startButton) startButton.remove();
        }

        if (currentState.gameStarted && !currentState.gameEnd) {
            if (currentState.isPaused) {
                const pauseButton =
                    (svg.querySelector("#pauseButton") as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "image",
                            {
                                id: "pauseButton",
                                href: getAssetUrl("assets/pause.png"),
                                width: "120",
                                height: "120",
                            },
                        );
                        svg.appendChild(created);
                        return created;
                    })();
                pauseButton.setAttribute("x", "240");
                pauseButton.setAttribute("y", "140");
                pauseButton.setAttribute("width", "120");
                pauseButton.setAttribute("height", "120");
                bringToForeground(pauseButton);
            } else {
                const pauseButton =
                    (svg.querySelector("#pauseButton") as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "image",
                            {
                                id: "pauseButton",
                                href: getAssetUrl("assets/pause.png"),
                                width: "60",
                                height: "60",
                            },
                        );
                        svg.appendChild(created);
                        return created;
                    })();
                pauseButton.setAttribute("x", "530");
                pauseButton.setAttribute("y", "10");
                pauseButton.setAttribute("width", "60");
                pauseButton.setAttribute("height", "60");
                bringToForeground(pauseButton);
            }

            if (currentState.countdown > 0) {
                const countdownText =
                    (svg.querySelector(
                        "#countdownText",
                    ) as SVGElement | null) ??
                    (() => {
                        const created = createSvgElement(
                            svg.namespaceURI,
                            "text",
                            {
                                id: "countdownText",
                                x: "300",
                                y: "230",
                                "text-anchor": "middle",
                                fill: "white",
                                "font-size": "48",
                                "font-weight": "bold",
                                "font-family": "'Press Start 2P', cursive",
                            },
                        );
                        svg.appendChild(created);
                        return created;
                    })();
                countdownText.textContent = currentState.countdown.toString();
            } else {
                const countdownText = svg.querySelector("#countdownText");
                if (countdownText) countdownText.remove();
            }
        } else {
            const pauseButton = svg.querySelector("#pauseButton");
            const countdownText = svg.querySelector("#countdownText");
            if (pauseButton) pauseButton.remove();
            if (countdownText) countdownText.remove();
        }
    };
};
