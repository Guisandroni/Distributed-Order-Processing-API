"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEALTH_INDICATORS = void 0;
const index_js_1 = require("./index.js");
const mikro_orm_health_js_1 = require("./database/mikro-orm.health.js");
/**
 * All the health indicators terminus provides as array
 */
exports.HEALTH_INDICATORS = [
    index_js_1.TypeOrmHealthIndicator,
    index_js_1.HttpHealthIndicator,
    index_js_1.MongooseHealthIndicator,
    index_js_1.SequelizeHealthIndicator,
    index_js_1.DiskHealthIndicator,
    index_js_1.MemoryHealthIndicator,
    index_js_1.MicroserviceHealthIndicator,
    index_js_1.GRPCHealthIndicator,
    mikro_orm_health_js_1.MikroOrmHealthIndicator,
    index_js_1.PrismaHealthIndicator,
];
