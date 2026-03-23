const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "manifest.json");
const dest = path.join(__dirname, "..", "dist", "manifest.json");
fs.copyFileSync(src, dest);
console.log("Copied manifest.json → dist/");
