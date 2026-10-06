"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckService = void 0;
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
var HealthCheckService_1;
const common_1 = require("@nestjs/common");
const terminus_constants_js_1 = require("../terminus.constants.js");
const error_logger_provider_js_1 = require("./error-logger/error-logger.provider.js");
const health_check_executor_service_js_1 = require("./health-check-executor.service.js");
/**
 * Handles Health Checks which can be used in
 * Controllers.
 */
let HealthCheckService = HealthCheckService_1 = class HealthCheckService {
    constructor(healthCheckExecutor, errorLogger, logger) {
        this.healthCheckExecutor = healthCheckExecutor;
        this.errorLogger = errorLogger;
        this.logger = logger;
        if (this.logger instanceof common_1.ConsoleLogger) {
            this.logger.setContext(HealthCheckService_1.name);
        }
    }
    /**
     * Checks the given health indicators
     *
     * ```typescript
     *
     * healthCheckService.check([
     *   () => this.http.pingCheck('google', 'https://google.com'),
     * ]);
     *
     *
     * ```
     * @param healthIndicators The health indicators which should be checked
     */
    async check(healthIndicators) {
        const result = await this.healthCheckExecutor.execute(healthIndicators);
        switch (result.status) {
            case 'ok':
            case 'degraded':
                return result;
            case 'error':
                const msg = this.errorLogger.getErrorMessage('Health Check has failed!', result.details);
                this.logger.error(msg);
                throw new common_1.ServiceUnavailableException(result);
            case 'shutting_down':
                throw new common_1.ServiceUnavailableException(result);
            default:
                // Ensure that we have exhaustively checked all cases
                const exhaustiveCheck = result.status;
                throw new common_1.InternalServerErrorException();
        }
    }
};
exports.HealthCheckService = HealthCheckService;
exports.HealthCheckService = HealthCheckService = HealthCheckService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(error_logger_provider_js_1.ERROR_LOGGER)),
    __param(2, (0, common_1.Inject)(terminus_constants_js_1.TERMINUS_LOGGER)),
    __metadata("design:paramtypes", [health_check_executor_service_js_1.HealthCheckExecutor, Object, Object])
], HealthCheckService);
