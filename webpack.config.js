//  const path = require('path');
// // const fs = require('fs');
// // var webpack = require('webpack');
// const HtmlWebpackPlugin = require('html-webpack-plugin')


// module.exports = {
//   entry: './app.js',
//   mode: 'development',
//   "target": "node",
//   externals: [
//     "child_process",
//     "dns",
//     "fs",
//     "net",
//     "tls",
//   ],
//   output: {
//     path: __dirname + '/dist',
//     filename: 'nft_index.js',
//     publicPath: '/'
//   },
//    resolve: {
//     symlinks: false,
//     aliasFields: ['browser'],
//     fallback: {
//     util: require.resolve("util/"),
//     fs: false,
//     "tls": false,
//     "net": false,
//     "path": false,
//     "zlib": false,
//     "http": false,
//     "https": false,
//     "stream": false,
//     "crypto": false,
//     "assert": false,
//     "path": false,
//     "os": require.resolve("os-browserify/browser"),
//     }
// },

//  module: {
//     rules: [{ test: /\.m?hbs/, exclude: /node_modules/, type: "javascript/auto" }],
//   },
//   plugins: [
//     new HtmlWebpackPlugin()
//   ]
// }






const path = require('path');
let fs = require("fs");
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const autoprefixer = require('autoprefixer');
module.exports = {
    entry: {
        bundle: './app.js',
    },
    mode: 'development',
    output: {
        path: path.resolve(__dirname, '../dist')
    },
    devtool: "source-map",
    devServer: {
        port: 3000,
        open: true
    },
    externals: [
          "child_process",
          "dns",
           "fs",
          "net",
          "tls",
        ],
    resolve: {
          symlinks: false,
          aliasFields: ['browser'],
          fallback: {
          util: require.resolve("util/"),
          fs: false,
          "tls": false,
          "net": false,
          "path": false,
          "zlib": false,
          "http": false,
          "https": false,
          "stream": false,
          "crypto": false,
          "assert": false,
          "path": false,
          "os": require.resolve("os-browserify/browser"),
          }
      },      
    module: {
        rules: [
            { test: /\.handlebars$/, loader: "handlebars-loader" },
            {
                test: /\.(jpg|png|gif)$/,
                use: [
                    {
                        loader: "file-loader",
                        options: {
                            name: '[name].[ext]',
                            outputPath: 'static/',
                            useRelativePath: true,
                        }
                    },
                    {
                        loader: 'image-webpack-loader',
                        options: {
                          mozjpeg: {
                            progressive: true,
                            quality: 65
                          },
                          optipng: {
                            enabled: true,
                          },
                          pngquant: {
                            quality: '65-90',
                            speed: 4
                          },
                          gifsicle: {
                            interlaced: false,
                          },
                          webp: {
                            quality: 75
                          }
                        }
                    }
                ]
            },
            {
                test: /\.(scss|css)$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    {
                        loader: "css-loader",
                        options: {
                            sourceMap: true
                        }
                    },
                    {
                        loader: "postcss-loader",
                        options: {
                            autoprefixer: {
                                browsers: ["last 2 versions"]
                            },
                            sourceMap: true,
                            plugins: () => [
                                autoprefixer
                            ]
                        },
                    },
                    {
                        loader: "sass-loader",
                        options: {
                            sourceMap: true
                        }
                    }
                ]
            },
            {
              test: /\.css$/i,
              loader: "css-loader",
            },
        ] 
    },
    plugins: [
        /** Since Webpack 4 */
        new webpack.LoaderOptionsPlugin({
            options: {
              handlebarsLoader: {}
            }
          }),
          new MiniCssExtractPlugin({
            filename: "admin.css",
            // chunkFilename: "[id].css"
          }),  
        new HtmlWebpackPlugin({
            title: 'NFT store',
            template: './views/themes/Cloth/customer-login.hbs'
          })
      ]
  };

