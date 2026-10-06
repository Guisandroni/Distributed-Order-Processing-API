"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminusModule = void 0;
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
var TerminusModule_1;
const common_1 = require("@nestjs/common");
const index_js_1 = require("./health-check/index.js");
const health_check_executor_service_js_1 = require("./health-check/health-check-executor.service.js");
const disk_usage_lib_provider_js_1 = require("./health-indicator/disk/disk-usage-lib.provider.js");
const health_indicator_service_js_1 = require("./health-indicator/health-indicator.service.js");
const health_indicators_provider_js_1 = require("./health-indicator/health-indicators.provider.js");
const terminus_providers_js_1 = require("./terminus.providers.js");
const baseProviders = [
    health_indicator_service_js_1.HealthIndicatorService,
    disk_usage_lib_provider_js_1.DiskUsageLibProvider,
    health_check_executor_service_js_1.HealthCheckExecutor,
    index_js_1.HealthCheckService,
    ...health_indicators_provider_js_1.HEALTH_INDICATORS,
];
const exports_ = [
    health_indicator_service_js_1.HealthIndicatorService,
    index_js_1.HealthCheckService,
    ...health_indicators_provider_js_1.HEALTH_INDICATORS,
];
/**
 * The Terminus module integrates health checks
 * and graceful shutdowns in your Nest application
 *
 * @publicApi
 */
let TerminusModule = TerminusModule_1 = class TerminusModule {
    /**
     * Register the module synchronously.
     */
    static forRoot(options = {}) {
        const providers = [
            ...baseProviders,
            (0, terminus_providers_js_1.createOptionsProvider)(options),
            ...(0, terminus_providers_js_1.createTerminusProviders)(options),
        ];
        return {
            module: TerminusModule_1,
            providers,
            exports: exports_,
        };
    }
    /**
     * Register the module asynchronously.
     */
    static forRootAsync(options) {
        const providers = [
            ...baseProviders,
            ...this.createAsyncProviders(options),
            ...(0, terminus_providers_js_1.createTerminusProviders)(),
        ];
        return {
            module: TerminusModule_1,
            imports: options.imports || [],
            providers,
            exports: exports_,
        };
    }
    static createAsyncProviders(options) {
        if (options.useExisting || options.useFactory) {
            return [(0, terminus_providers_js_1.createAsyncOptionsProvider)(options)];
        }
        return [
            (0, terminus_providers_js_1.createAsyncOptionsProvider)(options),
            {
                provide: options.useClass,
                useClass: options.useClass,
            },
        ];
    }
};
exports.TerminusModule = TerminusModule;
exports.TerminusModule = TerminusModule = TerminusModule_1 = __decorate([
    (0, common_1.Module)({
        providers: [
            ...baseProviders,
            (0, terminus_providers_js_1.createOptionsProvider)({}),
            ...(0, terminus_providers_js_1.createTerminusProviders)({}),
        ],
        exports: exports_,
    })
], TerminusModule);
