"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interval = Interval;
const common_1 = require("@nestjs/common");
const scheduler_type_enum_js_1 = require("../enums/scheduler-type.enum.js");
const schedule_constants_js_1 = require("../schedule.constants.js");
/**
 * Schedules an interval (`setInterval`).
 *
 * @publicApi
 */
function Interval(nameOrTimeout, timeout) {
    const [name, intervalTimeout] = typeof nameOrTimeout === 'string'
        ? [nameOrTimeout, timeout]
        : [undefined, nameOrTimeout];
    return (0, common_1.applyDecorators)((0, common_1.SetMetadata)(schedule_constants_js_1.SCHEDULE_INTERVAL_OPTIONS, { timeout: intervalTimeout }), (0, common_1.SetMetadata)(schedule_constants_js_1.SCHEDULER_NAME, name), (0, common_1.SetMetadata)(schedule_constants_js_1.SCHEDULER_TYPE, scheduler_type_enum_js_1.SchedulerType.INTERVAL));
}
