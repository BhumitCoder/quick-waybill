function commonjsRequire(path) {
  throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var inquire_1;
var hasRequiredInquire;
function requireInquire() {
  if (hasRequiredInquire) return inquire_1;
  hasRequiredInquire = 1;
  inquire_1 = inquire;
  function inquire(moduleName) {
    try {
      if (typeof commonjsRequire !== "function") {
        return null;
      }
      var mod = commonjsRequire(moduleName);
      if (mod && (mod.length || Object.keys(mod).length)) return mod;
      return null;
    } catch (err) {
      return null;
    }
  }
  return inquire_1;
}
export {
  requireInquire as r
};
