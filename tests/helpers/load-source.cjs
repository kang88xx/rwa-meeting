const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const allowedSources = new Set([
  "lib/date.ts",
  "lib/rooms.ts",
  "lib/validate.ts",
  "lib/mobile-calendar.ts",
  "components/MobileAgenda.tsx",
]);

// Load real pure dependencies, but refuse storage, environment, and API modules.
// These tests exercise exported logic; they do not render React components.
function loadSource(relativePath) {
  if (!allowedSources.has(relativePath)) {
    throw new Error(`Unexpected test dependency: ${relativePath}`);
  }
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const requireDependency = (specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") {
      return require(specifier);
    }
    if (specifier.endsWith(".module.css")) return {};
    const resolved = specifier.startsWith("@/")
      ? specifier.slice(2)
      : path.posix.join(path.posix.dirname(relativePath), specifier);
    return loadSource(`${resolved}.ts`);
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: requireDependency,
    console,
  }, { filename });
  return module.exports;
}

module.exports = { loadSource };
