// One-shot generator for the vendored CJS terminus shim.
// Run from the repo root: node apps/simple-crud-nestjs/test/vendor/regen-terminus-shim.cjs
// Regenerate after any @nestjs/terminus upgrade.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '../../../..');
const pnpmDir = path.join(base, 'node_modules/.pnpm');
const terminusDir = fs
  .readdirSync(pnpmDir)
  .filter((d) => d.startsWith('@nestjs+terminus@'))
  .map((d) => path.join(pnpmDir, d, 'node_modules/@nestjs/terminus/dist'))[0];
const dist = terminusDir;
const outDir = path.join(
  base,
  'apps/simple-crud-nestjs/test/vendor/nestjs-terminus',
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
  // transpileModule não reescreve import.meta: sem isso o Node classifica
  // o arquivo como ESM e `exports` deixa de existir. O fonte original declara
  // `const require = createRequire(...)`, o que sombrearia o require do CJS
  // após o transpile (TDZ) — por isso o helper vai para `fileRequire`.
  const cjs = transpiled.outputText
    .replace(
      /import\.meta\.url/g,
      "require('url').pathToFileURL(__filename).toString()",
    )
    .replace(/import\.meta\.dirname/g, '__dirname')
    .replace(
      /import\.meta\.resolve\(packageName\)/g,
      'require.resolve(packageName)',
    )
    .replace(
      'const require = (0,',
      'const fileRequire = (0,',
    )
    .replace(/swagger = require\('@nestjs\/swagger'\)/g, `swagger = fileRequire('@nestjs/swagger')`);
  fs.writeFileSync(target, cjs);
}

const shim = require(path.join(outDir, 'index.js'));
console.log(
  'exports: TerminusModule=%s HealthCheckService=%s Prisma=%s Microservice=%s HealthIndicatorService=%s',
  typeof shim.TerminusModule,
  typeof shim.HealthCheckService,
  typeof shim.PrismaHealthIndicator,
  typeof shim.MicroserviceHealthIndicator,
  typeof shim.HealthIndicatorService,
);
