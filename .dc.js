const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = (config) => {
    delete config.devServer.static;
    const { resolve } = require('path');
    const htmlPlugin = config.plugins.find((plugin) => plugin instanceof HtmlWebpackPlugin);
    if (htmlPlugin) {
        htmlPlugin.userOptions = {
            filename: 'index.html',
            template: resolve(__dirname, './index.html'),
            meta: { buildTime: new Date().toLocaleString() },
        };
    }

    const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
    config.plugins.unshift(new NodePolyfillPlugin());

    const CopyPlugin = require('copy-webpack-plugin');
    config.plugins.push(
        new CopyPlugin({
            patterns: [
                { from: resolve('./public'), to: resolve('./dist') },
            ],
        }),
    );

    // config.module.rules.push({
    //     test: /\.wasm$/,
    //     type: 'webassembly/async',
    // });

    config.resolve.alias = {
        '@': resolve(__dirname, './src')
    };

    // config.experiments = {
    //     ...config.experiments,
    //     asyncWebAssembly: true,
    // }

    return config;
};
