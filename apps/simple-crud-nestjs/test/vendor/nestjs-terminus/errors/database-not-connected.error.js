"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseNotConnectedError = void 0;
const messages_constant_js_1 = require("./messages.constant.js");
/**
 * Error which gets thrown when the database is not connected
 * @publicApi
 */
class DatabaseNotConnectedError extends Error {
    constructor() {
        super(messages_constant_js_1.DATABASE_NOT_CONNECTED);
    }
}
exports.DatabaseNotConnectedError = DatabaseNotConnectedError;
