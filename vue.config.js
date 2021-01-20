const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  outputDir: 'res/story-map',
  configureWebpack: {
    plugins: [
      new CopyWebpackPlugin([{ from: './story-map/public' }]),
    ],
  },
  chainWebpack: (config) => {
    config
      .entry("app")
      .clear()
      .add("./story-map/src/main.ts")
      .end();
    
    config
      .resolve.alias.set("@", path.join(__dirname, "./story-map/src"));

    config
      .plugin('html')
      .tap((args) => {
        const param = args[0]
        param.template = path.join(__dirname, "./story-map/public/index.html");
        return [ param ];
      });
  },
}