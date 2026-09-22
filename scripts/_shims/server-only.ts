/**
 * Stub for Next's `server-only` marker, used ONLY by the gate scripts.
 *
 * `server-only` is not a real package in node_modules: Next aliases it inside
 * its own webpack config, so `import "server-only"` compiles in the app but
 * explodes under plain tsx. The gates need to import the REAL server modules
 * (that is the whole point — every other dk-*-check reimplements the logic it
 * is checking, which is how the measureFdv pool-ordering bug survived), so
 * they resolve this file instead.
 *
 * Wired up in scripts/tsconfig.gate.json, NEVER in the root tsconfig: a root
 * paths entry would make the Next build resolve this stub too and silently
 * disable the server-only protection across the whole app.
 */
export {};
