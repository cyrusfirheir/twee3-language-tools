const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
	outputDir: 'res/story-map',
	configureWebpack: {
		plugins: [
			new CopyWebpackPlugin({
				patterns: [
					{
						from: './story-map/public',
						globOptions: {
							ignore: [
								"**/index.html"
							]
						}
					}
				]
			}),
		]
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
				return [param];
			});
	},
	css: {
		loaderOptions: {
			css: {
				url: false
			}
		}
	},
})