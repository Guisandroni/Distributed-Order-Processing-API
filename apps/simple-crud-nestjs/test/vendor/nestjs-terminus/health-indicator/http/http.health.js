"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpHealthIndicator = void 0;
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
var HttpHealthIndicator_1;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const terminus_constants_js_1 = require("../../terminus.constants.js");
const index_js_1 = require("../../utils/index.js");
const health_indicator_service_js_1 = require("../health-indicator.service.js");
/**
 * The HTTPHealthIndicator contains health indicators
 * which are used for health checks related to HTTP requests
 *
 * @publicApi
 * @module TerminusModule
 */
let HttpHealthIndicator = HttpHealthIndicator_1 = class HttpHealthIndicator {
    constructor(logger, healthIndicatorService) {
        this.logger = logger;
        this.healthIndicatorService = healthIndicatorService;
        if (this.logger instanceof common_1.ConsoleLogger) {
            this.logger.setContext(HttpHealthIndicator_1.name);
        }
        (0, index_js_1.assertPackages)(['@nestjs/axios'], this.constructor.name);
    }
    async getHttpService() {
        const { HttpService } = await (0, index_js_1.loadPackage)('@nestjs/axios');
        return new HttpService();
    }
    /**
     * Builds the `down` result for a failed request
     * @param key The key which will be used for the result object
     * @param error The thrown error
     */
    generateHttpError(check, error) {
        const response = {
            message: error.message,
        };
        if (error.response) {
            response.statusCode = error.response.status;
            response.statusText = error.response.statusText;
        }
        return check.down(response);
    }
    /**
     * Checks if the given url response in the given timeout
     * and returns a result object corresponding to the result
     * @param key The key which will be used for the result object
     * @param url The url which should be request
     * @param options Optional axios options
     *
     * @example
     * httpHealthIndicator.pingCheck('google', 'https://google.com', { timeout: 800 })
     */
    async pingCheck(key, url, { httpClient, ...options } = {}) {
        const check = this.healthIndicatorService.check(key);
        const httpService = httpClient || (await this.getHttpService());
        try {
            await (0, rxjs_1.lastValueFrom)(httpService.request({ url: url.toString(), ...options }));
        }
        catch (err) {
            if ((0, index_js_1.isAxiosError)(err)) {
                return this.generateHttpError(check, err);
            }
            throw err;
        }
        return check.up();
    }
    async responseCheck(key, url, callback, { httpClient, ...options } = {}) {
        const check = this.healthIndicatorService.check(key);
        const httpService = httpClient || (await this.getHttpService());
        let response;
        let axiosError = null;
        try {
            response = await (0, rxjs_1.lastValueFrom)(httpService.request({ url: url.toString(), ...options }));
        }
        catch (error) {
            if (!(0, index_js_1.isAxiosError)(error)) {
                throw error;
            }
            // We received an Axios Error but no response for unknown reasons.
            if (!error.response) {
                return check.down(error.message);
            }
            // We store the response no matter if the http request was successful or not.
            // So that we can pass it to the callback function and the user can decide
            // if the response is healthy or not.
            response = error.response;
            axiosError = error;
        }
        const isHealthy = await callback(response);
        if (!isHealthy) {
            if (axiosError) {
                return this.generateHttpError(check, axiosError);
            }
            return check.down();
        }
        return check.up();
    }
};
exports.HttpHealthIndicator = HttpHealthIndicator;
exports.HttpHealthIndicator = HttpHealthIndicator = HttpHealthIndicator_1 = __decorate([
    (0, common_1.Injectable)({
        scope: common_1.Scope.TRANSIENT,
    }),
    __param(0, (0, common_1.Inject)(terminus_constants_js_1.TERMINUS_LOGGER)),
    __metadata("design:paramtypes", [common_1.ConsoleLogger,
        health_indicator_service_js_1.HealthIndicatorService])
], HttpHealthIndicator);
