"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTerminusProviders = exports.createAsyncOptionsProvider = exports.createOptionsProvider = void 0;
const common_1 = require("@nestjs/common");
const error_logger_provider_js_1 = require("./health-check/error-logger/error-logger.provider.js");
const json_error_logger_service_js_1 = require("./health-check/error-logger/json-error-logger.service.js");
const pretty_error_logger_service_js_1 = require("./health-check/error-logger/pretty-error-logger.service.js");
const noop_logger_js_1 = require("./health-check/logger/noop-logger.js");
const terminus_constants_js_1 = require("./terminus.constants.js");
const createOptionsProvider = (options = {}) => ({
    provide: terminus_constants_js_1.TERMINUS_MODULE_OPTIONS,
    useValue: options,
});
exports.createOptionsProvider = createOptionsProvider;
const createAsyncOptionsProvider = (options) => {
    if (options.useFactory) {
        return {
            provide: terminus_constants_js_1.TERMINUS_MODULE_OPTIONS,
            useFactory: options.useFactory,
            inject: options.inject || [],
        };
    }
    return {
        provide: terminus_constants_js_1.TERMINUS_MODULE_OPTIONS,
        useFactory: async (optionsFactory) => await optionsFactory.createTerminusOptions(),
        inject: [options.useExisting || options.useClass],
    };
};
exports.createAsyncOptionsProvider = createAsyncOptionsProvider;
const createTerminusProviders = (options) => {
    return [
        {
            provide: error_logger_provider_js_1.ERROR_LOGGER,
            useFactory: (options) => {
                switch (options.errorLogStyle) {
                    case 'pretty':
                        return new pretty_error_logger_service_js_1.PrettyErrorLogger();
                    default:
                        return new json_error_logger_service_js_1.JsonErrorLogger();
                }
            },
            inject: [terminus_constants_js_1.TERMINUS_MODULE_OPTIONS],
        },
        createLoggerProvider(options),
    ];
};
exports.createTerminusProviders = createTerminusProviders;
function createLoggerProvider(options) {
    // When options are known at registration time (forRoot / static @Module),
    // use static providers so NestJS resolves the logger through DI.
    if (options) {
        if (options.logger === false) {
            return { provide: terminus_constants_js_1.TERMINUS_LOGGER, useValue: noop_logger_js_1.NOOP_LOGGER };
        }
        return {
            provide: terminus_constants_js_1.TERMINUS_LOGGER,
            useClass: options.logger === true || options.logger === undefined
                ? common_1.Logger
                : options.logger,
        };
    }
    // When options are not known at registration time (forRootAsync),
    // the factory returns a resolved logger instance directly.
    return {
        provide: terminus_constants_js_1.TERMINUS_LOGGER,
        useFactory: (opts) => {
            if (opts.logger === false) {
                return noop_logger_js_1.NOOP_LOGGER;
            }
            if (opts.logger === true || opts.logger === undefined) {
                return new common_1.Logger();
            }
            return opts.logger;
        },
        inject: [terminus_constants_js_1.TERMINUS_MODULE_OPTIONS],
    };
}
