"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequelizeHealthIndicator = void 0;
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
const core_1 = require("@nestjs/core");
const index_js_1 = require("../../utils/index.js");
const health_indicator_service_js_1 = require("../health-indicator.service.js");
/**
 * The SequelizeHealthIndicator contains health indicators
 * which are used for health checks related to Sequelize
 *
 * @publicApi
 * @module TerminusModule
 */
let SequelizeHealthIndicator = class SequelizeHealthIndicator {
    constructor(moduleRef, healthIndicatorService) {
        this.moduleRef = moduleRef;
        this.healthIndicatorService = healthIndicatorService;
        this.checkDependantPackages();
    }
    /**
     * Checks if the dependant packages are present
     */
    checkDependantPackages() {
        (0, index_js_1.assertPackages)(['@nestjs/sequelize', 'sequelize'], this.constructor.name);
    }
    /**
     * Returns the connection of the current DI context
     */
    async getContextConnection() {
        const { getConnectionToken } = await (0, index_js_1.loadPackage)('@nestjs/sequelize');
        try {
            return this.moduleRef.get(getConnectionToken(), {
                strict: false,
            });
        }
        catch (err) {
            return null;
        }
    }
    /**
     * Pings a sequelize connection
     * @param connection The connection which the ping should get executed
     *
     */
    async pingDb(connection) {
        await connection.query('SELECT 1');
    }
    /**
     * Checks if the Sequelize responds in (default) 1000ms and
     * returns a result object corresponding to the result
     *
     * @param key The key which will be used for the result object
     * @param options The options for the ping
     * @example
     * sequelizeHealthIndicator.pingCheck('database').withTimeout(1500);
     */
    pingCheck(key, options = {}) {
        return this.healthIndicatorService
            .check(key)
            .attempt(async () => {
            const connection = options.connection || (await this.getContextConnection());
            if (!connection) {
                throw new Error('Connection provider not found in application context');
            }
            await this.pingDb(connection);
        })
            .withTimeout(options.timeout ?? 1000);
    }
};
exports.SequelizeHealthIndicator = SequelizeHealthIndicator;
exports.SequelizeHealthIndicator = SequelizeHealthIndicator = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.TRANSIENT }),
    __metadata("design:paramtypes", [core_1.ModuleRef,
        health_indicator_service_js_1.HealthIndicatorService])
], SequelizeHealthIndicator);
