"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAxiosError = isAxiosError;
exports.isError = isError;
function isAxiosError(err) {
    return err?.isAxiosError;
}
function isError(err) {
    return !!err?.message;
}
