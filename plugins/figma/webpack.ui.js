const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: false,
  entry: "./src/ui/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "ui.js",
    clean: false,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __API_BASE__: JSON.stringify(process.env.DESIGNFORGE_API_URL || "http://localhost:3000"),
    }),
    new HtmlWebpackPlugin({
      template: "./src/ui/ui-template.html",
      filename: "ui.html",
      inject: "body",
      scriptLoading: "defer",
    }),
  ],
};
