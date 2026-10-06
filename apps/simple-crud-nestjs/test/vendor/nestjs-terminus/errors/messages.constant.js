"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATABASE_NOT_CONNECTED = exports.STORAGE_EXCEEDED = void 0;
/**
 * @internal
 */
const STORAGE_EXCEEDED = (keyword) => `Used ${keyword} exceeded the set threshold`;
exports.STORAGE_EXCEEDED = STORAGE_EXCEEDED;
/**
 * @internal
 */
exports.DATABASE_NOT_CONNECTED = `Not connected to database`;
