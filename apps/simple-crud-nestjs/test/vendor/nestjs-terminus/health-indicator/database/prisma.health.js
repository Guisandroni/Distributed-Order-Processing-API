"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaHealthIndicator = void 0;
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
const health_indicator_service_js_1 = require("../health-indicator.service.js");
/**
 * The PrismaHealthIndicator contains health indicators
 * which are used for health checks related to Prisma
 *
 * @publicApi
 * @module TerminusModule
 */
let PrismaHealthIndicator = class PrismaHealthIndicator {
    constructor(healthIndicatorService) {
        this.healthIndicatorService = healthIndicatorService;
    }
    async pingDb(prismaClientSQLOrMongo) {
        // The prisma client generates two different typescript types for different databases
        // but inside they've the same methods
        // But they will fail when using a document method on sql database, that's why we do the try catch down below
        const prismaClient = prismaClientSQLOrMongo;
        try {
            await prismaClient.$runCommandRaw({ ping: 1 });
        }
        catch (error) {
            if (error instanceof Error &&
                error.toString().includes('Use the mongodb provider')) {
                await prismaClient.$queryRawUnsafe('SELECT 1');
                return;
            }
            throw error;
        }
    }
    /**
     * Checks if the Prisma responds in (default) 1000ms and
     * returns a result object corresponding to the result
     *
     * @param key The key which will be used for the result object
     * @param prismaClient PrismaClient
     * @param options The options for the ping
     */
    pingCheck(key, prismaClient, options = {}) {
        return this.healthIndicatorService
            .check(key)
            .attempt(() => this.pingDb(prismaClient))
            .withTimeout(options.timeout ?? 1000);
    }
};
exports.PrismaHealthIndicator = PrismaHealthIndicator;
exports.PrismaHealthIndicator = PrismaHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [health_indicator_service_js_1.HealthIndicatorService])
], PrismaHealthIndicator);
