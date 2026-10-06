"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskUsageLibProvider = exports.checkDiskSpace = void 0;
const promises_1 = require("node:fs/promises");
const terminus_constants_js_1 = require("../../terminus.constants.js");
/**
 * Reads the disk usage of the file system the given path lives on.
 *
 * @internal
 */
const checkDiskSpace = async (path) => {
    const { bsize, bavail, blocks } = await (0, promises_1.statfs)(path);
    return {
        free: bsize * bavail,
        size: bsize * blocks,
    };
};
exports.checkDiskSpace = checkDiskSpace;
/**
 * Wrapper of the disk space check, so that it can be replaced in tests.
 *
 * @internal
 */
exports.DiskUsageLibProvider = {
    provide: terminus_constants_js_1.CHECK_DISK_SPACE_LIB,
    useValue: exports.checkDiskSpace,
};
