"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicroserviceHealthIndicator = void 0;
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
const common_1 = require("@nestjs/common");
const index_js_1 = require("../../utils/index.js");
const health_indicator_service_js_1 = require("../health-indicator.service.js");
/**
 * The MicroserviceHealthIndicator is a health indicators
 * which is used for health checks related to microservices
 *
 * @publicApi
 * @module TerminusModule
 */
let MicroserviceHealthIndicator = class MicroserviceHealthIndicator {
    constructor(healthIndicatorService) {
        this.healthIndicatorService = healthIndicatorService;
        (0, index_js_1.assertPackages)(['@nestjs/microservices'], this.constructor.name);
    }
    /**
     * Loads `@nestjs/microservices`, which is only an optional peer
     */
    async loadMicroservices() {
        return await (0, index_js_1.loadPackage)('@nestjs/microservices');
    }
    async pingMicroservice(options) {
        const { ClientProxyFactory } = await this.loadMicroservices();
        const client = ClientProxyFactory.create(options);
        try {
            await client.connect();
        }
        finally {
            await client.close();
        }
    }
    /**
     * Checks if the given microservice is up
     * @param key The key which will be used for the result object
     * @param options The options of the microservice
     *
     * @example
     * microservice.pingCheck<TcpClientOptions>('tcp', {
     *   transport: Transport.TCP,
     *   options: { host: 'localhost', port: 3001 },
     * })
     */
    pingCheck(key, options) {
        return this.healthIndicatorService
            .check(key)
            .attempt(async () => {
            const { Transport } = await this.loadMicroservices();
            // A probe only connects, so it must be cheap and leave nothing behind:
            // https://github.com/nestjs/terminus/issues/1690
            // https://github.com/nestjs/terminus/issues/2680
            const probeDefaults = {
                [Transport.KAFKA]: { producerOnlyMode: true },
                [Transport.RMQ]: { noAssert: options.options?.queue == null },
            };
            const clientOptions = {
                ...options,
                options: {
                    ...probeDefaults[options.transport],
                    ...options.options,
                },
            };
            try {
                await this.pingMicroservice(clientOptions);
            }
            catch (err) {
                throw (0, index_js_1.isError)(err) ? err : new Error(`${key} is not available`);
            }
        })
            .withTimeout(options.timeout ?? 1000);
    }
};
exports.MicroserviceHealthIndicator = MicroserviceHealthIndicator;
exports.MicroserviceHealthIndicator = MicroserviceHealthIndicator = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.TRANSIENT }),
    __metadata("design:paramtypes", [health_indicator_service_js_1.HealthIndicatorService])
], MicroserviceHealthIndicator);
