'use strict';
/**
 * Limitador de peticiones en memoria, reutilizable y con poda periódica.
 */

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 100;
const DEFAULT_MESSAGE = 'Demasiadas peticiones';
const CLEANUP_INTERVAL_MS = 60 * 1000;

const registry = new Set();

function createRateLimiter(options = {}) {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const max = options.max ?? DEFAULT_MAX;
    const message = options.message ?? DEFAULT_MESSAGE;
    const hits = new Map();

    function prune(now = Date.now()) {
        for (const [key, record] of hits) {
            if (now > record.resetTime) {
                hits.delete(key);
            }
        }
        return hits.size;
    }

    function middleware(req, res, next) {
        if (process.env.NEUBAT_DISABLE_RATE_LIMIT === '1') {
            return next();
        }
        const now = Date.now();
        const key = req.ip || 'desconocida';
        let record = hits.get(key);
        if (!record || now > record.resetTime) {
            record = { count: 0, resetTime: now + windowMs };
            hits.set(key, record);
        }
        record.count += 1;
        if (record.count > max) {
            return res.status(429).json({ error: message });
        }
        return next();
    }

    middleware.hits = hits;
    middleware.prune = prune;
    middleware.reset = () => hits.clear();

    const timer = setInterval(prune, CLEANUP_INTERVAL_MS);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }

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
    DEFAULT_MAX,
    CLEANUP_INTERVAL_MS
};
