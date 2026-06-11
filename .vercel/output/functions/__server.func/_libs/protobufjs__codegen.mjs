var codegen_1;
var hasRequiredCodegen;
function requireCodegen() {
  if (hasRequiredCodegen) return codegen_1;
  hasRequiredCodegen = 1;
  codegen_1 = codegen;
  var reservedRe = /^(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$/;
  function codegen(functionParams, functionName) {
    if (typeof functionParams === "string") {
      functionName = functionParams;
      functionParams = void 0;
    }
    var body = [];
    function Codegen(formatStringOrScope) {
      if (typeof formatStringOrScope !== "string") {
        var source = toString();
        if (codegen.verbose)
          console.log("codegen: " + source);
        source = "return " + source;
        if (formatStringOrScope) {
          var scopeKeys = Object.keys(formatStringOrScope), scopeParams = new Array(scopeKeys.length + 1), scopeValues = new Array(scopeKeys.length), scopeOffset = 0;
          while (scopeOffset < scopeKeys.length) {
            scopeParams[scopeOffset] = scopeKeys[scopeOffset];
            scopeValues[scopeOffset] = formatStringOrScope[scopeKeys[scopeOffset++]];
          }
          scopeParams[scopeOffset] = source;
          return Function.apply(null, scopeParams).apply(null, scopeValues);
        }
        return Function(source)();
      }
      var formatParams = new Array(arguments.length - 1), formatOffset = 0;
      while (formatOffset < formatParams.length)
        formatParams[formatOffset] = arguments[++formatOffset];
      formatOffset = 0;
      formatStringOrScope = formatStringOrScope.replace(/%([%dfijs])/g, function replace($0, $1) {
        var value = formatParams[formatOffset++];
        switch ($1) {
          case "d":
          case "f":
            return String(Number(value));
          case "i":
            return String(Math.floor(value));
          case "j":
            return JSON.stringify(value);
          case "s":
            return String(value);
        }
        return "%";
      });
      if (formatOffset !== formatParams.length)
        throw Error("parameter count mismatch");
      body.push(formatStringOrScope);
      return Codegen;
    }
    function toString(functionNameOverride) {
      return "function " + safeFunctionName(functionNameOverride || functionName) + "(" + (functionParams && functionParams.join(",") || "") + "){\n  " + body.join("\n  ") + "\n}";
    }
    Codegen.toString = toString;
    return Codegen;
  }
  codegen.verbose = false;
  function safeFunctionName(name) {
    if (!name)
      return "";
    name = String(name).replace(/[^\w$]/g, "");
    if (!name)
      return "";
    if (/^\d/.test(name))
      name = "_" + name;
    return reservedRe.test(name) ? name + "_" : name;
  }
  return codegen_1;
}
export {
  requireCodegen as r
};
