// One-shot generator for the vendored CJS schedule shim.
// Run from the repo root: node apps/simple-crud-nestjs/test/vendor/regen-schedule-shim.cjs
// Regenerate after any @nestjs/schedule upgrade.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '../../../..');
const dist = path.join(base, 'node_modules/@nestjs/schedule/dist');
const outDir = path.join(
  base,
  'apps/simple-crud-nestjs/test/vendor/nestjs-schedule',
);

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
    .filter((file) => file.endsWith('.js'));
}

for (const file of walk(dist)) {
  const relative = path.relative(dist, file);
  const target = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const source = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
    fileName: file,
  });
  fs.writeFileSync(target, transpiled.outputText);
}

const shim = require(path.join(outDir, 'index.js'));
console.log(
  'exports: ScheduleModule=%s Interval=%s Cron=%s',
  typeof shim.ScheduleModule,
  typeof shim.Interval,
  typeof shim.Cron,
);
