'use strict';
/**
 * Limitador de peticiones basado en express-rate-limit, con un registry para
 * poder reiniciar todos los limitadores (tests) y bypass por entorno.
 */

const { rateLimit, MemoryStore } = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 100;
const DEFAULT_MESSAGE = 'Demasiadas peticiones';

const registry = new Set();

function createRateLimiter(options = {}) {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const max = options.max ?? DEFAULT_MAX;
    const message = options.message ?? DEFAULT_MESSAGE;
    const store = new MemoryStore();

    const middleware = rateLimit({
        windowMs,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
        store,
        skip: () => process.env.NEUBAT_DISABLE_RATE_LIMIT === '1',
        validate: false
    });

    middleware.store = store;
    middleware.reset = () => store.resetAll();

    registry.add(middleware);
    return middleware;
}

function resetAllRateLimiters() {
    for (const limiter of registry) {
        limiter.reset();
    }
}

module.exports = {
    createRateLimiter,
    resetAllRateLimiters,
    DEFAULT_WINDOW_MS,
    DEFAULT_MAX
};
