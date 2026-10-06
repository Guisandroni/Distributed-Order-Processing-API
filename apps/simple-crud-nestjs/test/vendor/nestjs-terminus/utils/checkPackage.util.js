"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPackages = assertPackages;
exports.loadPackages = loadPackages;
exports.loadPackage = loadPackage;
/**
 * Generates the string which packages are missing and
 * how to install them
 *
 * @param name The name of the packages
 * @param reason The reason why these packages are important
 *
 * @internal
 */
const MISSING_REQUIRED_DEPENDENCY = (names, reason) => `The "${names.join('", "')}" package${names.length > 1 ? 's are' : ' is'} missing. Please, make sure to install the librar${names.length > 1 ? 'ies' : 'y'} ($ npm install ${names.join(' ')}) to take advantage of ${reason}.`;
/**
 * Cache of already-loaded packages, keyed by package name, so that a health
 * check does not pay for a dynamic import on every probe.
 *
 * @internal
 */
const packageCache = new Map();
/**
 * Asserts that the given optional peer packages are installed, without loading
 * them. Meant for indicator constructors, which are synchronous.
 *
 * `import.meta.resolve` resolves a specifier without evaluating the module and
 * honours an `import`-only `exports` condition, which the ESM-only siblings
 * publish.
 *
 * @param packageNames The package names
 * @param reason The reason why these packages are important
 *
 * @throws {Error} If one of the packages cannot be resolved. A missing peer is
 * a wiring mistake that can never recover, so it aborts the bootstrap instead
 * of surfacing later as a failing probe.
 *
 * @internal
 */
function assertPackages(packageNames, reason) {
    const missing = packageNames.filter((packageName) => {
        try {
            require.resolve(packageName);
            return false;
        }
        catch {
            return true;
        }
    });
    if (missing.length) {
        throw new Error(MISSING_REQUIRED_DEPENDENCY(missing, reason));
    }
}
/**
 * Loads the given optional peer packages, caching each one after its first
 * load. Meant for the (already asynchronous) check methods.
 *
 * @param packageNames The package names
 *
 * @internal
 *
 * @returns The loaded modules, in the order they were requested
 */
async function loadPackages(packageNames) {
    return await Promise.all(packageNames.map(loadPackage));
}
/**
 * Loads a single optional peer package, caching it after its first load.
 *
 * @internal
 */
async function loadPackage(packageName) {
    const cached = packageCache.get(packageName);
    if (cached) {
        return cached;
    }
    const pkg = await Promise.resolve(`${packageName}`).then(s => __importStar(require(s)));
    packageCache.set(packageName, pkg);
    return pkg;
}
