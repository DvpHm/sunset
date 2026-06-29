const fs = require("fs");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
      return;
    }

    if (fullPath.includes("vendor")) return;

    if (!file.endsWith(".js")) return;

    const code = fs.readFileSync(fullPath, "utf8");

    const result = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      stringArray: true,
      stringArrayEncoding: ["base64"],
      rotateStringArray: true,
      selfDefending: true,
      disableConsoleOutput: true
    });

    fs.writeFileSync(fullPath, result.getObfuscatedCode());
    console.log("✔ " + fullPath);
  });
}

walk("./dist/js");
