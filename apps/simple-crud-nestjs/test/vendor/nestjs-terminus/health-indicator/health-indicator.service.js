"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckAttempt = exports.HealthIndicatorSession = exports.HealthIndicatorService = void 0;
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
const common_1 = require("@nestjs/common");
const is_error_js_1 = require("../utils/is-error.js");
const rejectOnAbort_js_1 = require("../utils/rejectOnAbort.js");
const anySignal_js_1 = require("../utils/anySignal.js");
/**
 * Helper service which can be used to create health indicator results
 * @publicApi
 */
let HealthIndicatorService = class HealthIndicatorService {
    constructor() {
        this.cache = new Map();
    }
    check(key) {
        return new HealthIndicatorSession(key, this.cache);
    }
};
exports.HealthIndicatorService = HealthIndicatorService;
exports.HealthIndicatorService = HealthIndicatorService = __decorate([
    (0, common_1.Injectable)()
], HealthIndicatorService);
function assertNotReserved(data, keys) {
    for (const key of keys) {
        if (key in data) {
            throw new Error(`"${key}" is a reserved key and cannot be used in additional data`);
        }
    }
}
/**
 * Indicate the health of a health indicator with the given key
 *
 * @publicApi
 */
class HealthIndicatorSession {
    constructor(key, cache = new Map()) {
        this.key = key;
        this.cache = cache;
    }
    compose(status, data) {
        let additionalData = {};
        if (typeof data === 'string') {
            additionalData = { message: data };
        }
        else if (typeof data === 'object' && data !== null) {
            additionalData = data;
        }
        assertNotReserved(additionalData, ['status']);
        const detail = { ...additionalData, status };
        return {
            [this.key]: detail,
            // TypeScript does not infer this.key as Key correctly.
        };
    }
    down(data) {
        return this.compose('down', data);
    }
    degraded(data) {
        return this.compose('degraded', data);
    }
    up(data) {
        return this.compose('up', data);
    }
    /**
     * Attempt to execute a function and mark the health indicator as `up` or `down` based on whether it throws.
     * Returns a `HealthCheckAttempt` builder that can be further configured (e.g. `.withTimeout()`).
     *
     * @param fn The function to execute
     * @returns A `HealthCheckAttempt` builder
     * @remarks The `status`, `responseTime` and `cachedResponse` keys are reserved and cannot be used in the returned data.
     *
     * @example
     * ```typescript
     * this.healthIndicatorService
     *   .check('db')
     *   .attempt(async () => sql`SELECT(1)`)
     *
     * this.healthIndicatorService
     *   .check('external')
     *   .attempt(async ({ signal }) => { await fetch('https://example.com', { signal }) })
     *   .withTimeout(3000)
     * ```
     */
    attempt(fn) {
        return new HealthCheckAttempt(this, fn, this.key, this.cache);
    }
}
exports.HealthIndicatorSession = HealthIndicatorSession;
/**
 * A builder that describes a health check attempt.
 * Use `.withTimeout()` to configure a timeout.
 *
 * @publicApi
 */
class HealthCheckAttempt {
    constructor(session, fn, cacheKey = '', cacheStore = new Map()) {
        this.then = (onfulfilled, onrejected) => this.execute().then(onfulfilled, onrejected);
        this.session = session;
        this.fn = fn;
        this.cacheKey = cacheKey;
        this.cacheStore = cacheStore;
    }
    toResult(outcome, cachedResponse = false) {
        assertNotReserved(outcome.data, ['responseTime', 'cachedResponse']);
        const data = {
            ...outcome.data,
            responseTime: outcome.responseTime,
            ...(cachedResponse && { cachedResponse: true }),
        };
        return outcome.status === 'up'
            ? this.session.up(data)
            : this.session.down(data);
    }
    async execute() {
        const ttl = this.cacheTtlMs;
        if (ttl === undefined) {
            return this.toResult(await this.run());
        }
        const cached = this.cacheStore.get(this.cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            const isCacheHit = cached.settled;
            return this.toResult(await cached.promise, isCacheHit);
        }
        const entry = {
            promise: this.run(),
            expiresAt: Date.now() + ttl,
            settled: false,
        };
        this.cacheStore.set(this.cacheKey, entry);
        const outcome = await entry.promise;
        entry.expiresAt = Date.now() + ttl;
        entry.settled = true;
        return this.toResult(outcome);
    }
    async run() {
        const start = performance.now();
        const controller = new AbortController();
        const signals = [controller.signal];
        let timeout;
        if (this.timeoutMs !== undefined) {
            timeout = AbortSignal.timeout(this.timeoutMs);
            signals.push(timeout);
        }
        const signal = (0, anySignal_js_1.anySignal)(signals);
        try {
            const promise = Promise.resolve(this.fn({ signal }));
            const result = await (0, rejectOnAbort_js_1.rejectOnAbort)(promise, signal);
            return {
                status: 'up',
                data: toAdditionalData(result),
                responseTime: Math.round(performance.now() - start),
            };
        }
        catch (err) {
            const message = timeout?.aborted
                ? `timeout of ${this.timeoutMs}ms exceeded`
                : errorMessage(err);
            return {
                status: 'down',
                data: { message },
                responseTime: Math.round(performance.now() - start),
            };
        }
        finally {
            controller.abort();
        }
    }
    /**
     * Set a timeout for the health check attempt.
     * If the function does not resolve within the given time, the health indicator will be marked as `down`.
     * An `AbortSignal` is passed to the callback so the underlying operation can be cancelled.
     *
     * @param ms The timeout in milliseconds
     * @returns this (for chaining)
     */
    withTimeout(ms) {
        if (ms < 0 || ms > 2 ** 32 - 1) {
            throw new Error(`Timeout must be between 0 and ${2 ** 32 - 1} milliseconds`);
        }
        this.timeoutMs = ms;
        return this;
    }
    /**
     * Cache the result of this attempt for the given time.
     *
     * The cache is shared across requests and keyed by the indicator key:
     * while a fresh result exists, executing the attempt returns it without
     * running the function again, and concurrent executions share a single
     * in-flight run. Results served from the cache are marked with
     * `cachedResponse: true`.
     *
     * @param ttlMs Time to live in milliseconds
     * @returns this (for chaining)
     */
    cacheFor(ttlMs) {
        if (ttlMs < 0 || ttlMs > 2 ** 32 - 1) {
            throw new Error(`Cache TTL must be between 0 and ${2 ** 32 - 1} milliseconds`);
        }
        this.cacheTtlMs = ttlMs;
        return this;
    }
}
exports.HealthCheckAttempt = HealthCheckAttempt;
function toAdditionalData(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value;
}
function errorMessage(err) {
    if ((0, is_error_js_1.isError)(err)) {
        return err.message;
    }
    return String(err);
}
