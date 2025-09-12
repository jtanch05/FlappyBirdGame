/**
 * Application Entry Point - Starting up the Reactive Game Architecture
 *
 * This module demonstrates the following principles:
 * - Pure business logic (state management) at the core
 * - I/O operations (file loading, DOM rendering) at the edges
 * - Reactive streams connecting pure and impure code cleanly
 *
 * Key FP/FRP Patterns:
 * 1. Dependency Injection: state$ factory receives CSV data as parameter
 * 2. Stream Composition: File loading → State management → View rendering
 * 3. Error Handling: Functional error handling with catchError operator
 * 4. Side Effect Isolation: All impure operations contained to this entry point
 */

// Import CSS for styling - side effect contained to startup
import "./style.css";
import { catchError, switchMap } from "rxjs";
import { fromFetch } from "rxjs/fetch";
import { state$ } from "./observable";
import { render } from "./view";

// Re-export state$ for testing - enables unit tests to access the state stream
// This follows the principle of making pure functions easily testable
export { state$ };

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    const csvUrl = `${baseUrl}/assets/map.csv`;

    // Get the file from URL
    const csv$ = fromFetch(csvUrl).pipe(
        switchMap(response => {
            // Transform successful response to text content
            if (response.ok) return response.text();
            // Convert HTTP errors to stream errors for consistent handling
            throw new Error(`Fetch error: ${response.status}`);
        }),
        catchError(err => {
            // Log error for debugging while maintaining stream semantics
            console.error("Error fetching the CSV file:", err);
            throw err; // Re-throw to allow upstream error handling
        }),
    );

    csv$.pipe(switchMap(contents => state$(contents))).subscribe(render());
}
