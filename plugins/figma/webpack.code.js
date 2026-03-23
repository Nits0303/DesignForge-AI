const fs = require("fs");
const path = require("path");
const webpack = require("webpack");

const uiHtmlPath = path.join(__dirname, "dist", "ui.html");
if (!fs.existsSync(uiHtmlPath)) {
  throw new Error("Build UI first: npm run build (webpack.ui.js must run before webpack.code.js)");
}
const uiHtml = fs.readFileSync(uiHtmlPath, "utf8");

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: false,
  entry: "./src/plugin/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "code.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader", exclude: /node_modules/ }],
  },
  plugins: [
    new webpack.DefinePlugin({
      __html__: JSON.stringify(uiHtml),
    }),
  ],
};
