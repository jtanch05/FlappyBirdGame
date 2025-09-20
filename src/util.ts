/**
 * Utility functions implementing pure functional programming principles
 *
 * Key FP Concepts Demonstrated:
 * - Pure functions: deterministic output, no side effects
 * - Immutable data structures: functions return new values instead of mutating
 * - Functional random number generation: reproducible randomness for testing
 */

/**
 * The following RNG class was adapted from the FIT2102 Applied Class 4 materials.
 * A random number generator which provides two pure functions
 * `hash` and `scale`. Call `hash` repeatedly to generate the
 * sequence of hashes.
 */
class RNG {
    private static m = 0x80000000;

    private static a = 1103515245;

    private static c = 12345;

    static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;
    /** Scale hash to 0-1 range - maps integer hash to floating point probability */
    static scale01 = (hash: number) => hash / (RNG.m - 1);
}

/**
 * A pseudo-random number generator (PRNG)
 * Pure function: same seed always produces the same sequence.
 */
type RandomResult = Readonly<{ value: number; seed: number }>;

/**
 * Generate random number in specified range using functional approach
 *
 * @param seed - Current random seed (determines output)
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Object with random value and next seed to use
 *
 * This threading of state is what makes the randomness functional and pure
 */
export const randomBetween = (
    currentSeed: number,
    minValue: number,
    maxValue: number,
): RandomResult => {
    const nextSeed = RNG.hash(currentSeed);
    const randomValue =
        RNG.scale01(nextSeed) * (maxValue - minValue) + minValue;
    return { value: randomValue, seed: nextSeed };
};

/**
 * Clamp value to specified range - pure utility function
 *
 * @param value - Input value to constrain
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Value constrained to [min, max] range
 *
 * Used throughout the game for:
 * - Keeping bird within screen boundaries
 * - Constraining physics values to reasonable ranges
 * - Ensuring power-up effects don't break game balance
 *
 * Pure function: same inputs always produce same output, no side effects
 */
export const clamp = (
    inputValue: number,
    minBound: number,
    maxBound: number,
): number => Math.max(minBound, Math.min(maxBound, inputValue));

/**
 * Get the asset URL with the correct base path for deployment
 *
 * This function ensures that asset paths work correctly in both development
 * and production environments (like Vercel deployment).
 *
 * @param assetPath - Relative path to the asset (e.g., "assets/birb.png")
 * @returns Full URL to the asset that works in all environments
 */
export const getAssetUrl = (assetPath: string): string => {
    if (typeof window === "undefined") {
        // Server-side rendering case
        return assetPath;
    }

    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    return `${baseUrl}/${assetPath}`;
};
