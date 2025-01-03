import {createRequire} from 'node:module';
import path from 'node:path';
import rspack from '@rspack/core';
import * as Repack from '@callstack/repack';
import TerserPlugin from 'terser-webpack-plugin';
import * as mobileSdk from '@zephyr-merch/mobile-sdk';
import Dotenv from 'dotenv-webpack';
import {withZephyr} from 'zephyr-repack-plugin';

const dirname = Repack.getDirname(import.meta.url);
const {resolve} = createRequire(import.meta.url);
const {getSharedDependencies} = mobileSdk;
const STANDALONE = Boolean(process.env.STANDALONE);
const USE_ZEPHYR = Boolean(process.env.ZC);
/**
 * More documentation, installation, usage, motivation and differences with Metro is available at:
 * https://github.com/callstack/repack/blob/main/README.md
 *
 * The API documentation for the functions and plugins used in this file is available at:
 * https://re-pack.dev
 */

/**
 * Webpack configuration.
 * You can also export a static object or a function returning a Promise.
 *
 * @param env Environment options passed from either Webpack CLI or React Native Community CLI
 *            when running with `react-native start/bundle`.
 */
export default env => {
  const {
    mode = 'development',
    context = dirname,
    entry = './index.js',
    platform = process.env.PLATFORM,
    minimize = mode === 'production',
    devServer = undefined,
    bundleFilename = undefined,
    sourceMapFilename = undefined,
    assetsPath = undefined,
    reactNativePath = resolve('react-native'),
  } = env;

  if (!platform) {
    throw new Error('Missing platform');
  }

  /**
   * Using Module Federation might require disabling hmr.
   * Uncomment below to set `devServer.hmr` to `false`.
   *
   * Keep in mind that `devServer` object is not available
   * when running `webpack-bundle` command. Be sure
   * to check its value to avoid accessing undefined value,
   * otherwise an error might occur.
   */
  // if (devServer) {
  //   devServer.hmr = false;
  // }

  /**
   * Depending on your Babel configuration you might want to keep it.
   * If you don't use `env` in your Babel config, you can remove it.
   *
   * Keep in mind that if you remove it you should set `BABEL_ENV` or `NODE_ENV`
   * to `development` or `production`. Otherwise your production code might be compiled with
   * in development mode by Babel.
   */
  process.env.BABEL_ENV = mode;

  const config = {
    mode,
    /**
     * This should be always `false`, since the Source Map configuration is done
     * by `SourceMapDevToolPlugin`.
     */
    devtool: false,
    context,
    // If this is a miniapp, Repack runtime only compile the MF part
    // If this is the host only pass in the entry point
    entry: entry,
    resolve: {
      /**
       * `getResolveOptions` returns additional resolution configuration for React Native.
       * If it's removed, you won't be able to use `<file>.<platform>.<ext>` (eg: `file.ios.js`)
       * convention and some 3rd-party libraries that specify `react-native` field
       * in their `package.json` might not work correctly.
       */
      ...Repack.getResolveOptions(platform),

      /**
       * Uncomment this to ensure all `react-native*` imports will resolve to the same React Native
       * dependency. You might need it when using workspaces/monorepos or unconventional project
       * structure. For simple/typical project you won't need it.
       */
      // alias: {
      //   'react-native': reactNativePath,
      // },
    },
    /**
     * Configures output.
     * It's recommended to leave it as it is unless you know what you're doing.
     * By default Webpack will emit files into the directory specified under `path`. In order for the
     * React Native app use them when bundling the `.ipa`/`.apk`, they need to be copied over with
     * `Repack.OutputPlugin`, which is configured by default inside `Repack.RepackPlugin`.
     */
    output: {
      clean: true,
      hashFunction: 'xxhash64',
      path: path.join(dirname, 'build/generated', platform),
      filename: 'index.bundle',
      chunkFilename: '[name].chunk.bundle',
      publicPath: Repack.getPublicPath({platform, devServer}),
      uniqueName: 'zephyr-merch-host',
    },
    /**
     * Configures optimization of the built bundle.
     */
    optimization: {
      /** Enables minification based on values passed from React Native Community CLI or from fallback. */
      minimize,
      // /** Configure minimizer to process the bundle. */
      // minimizer: [
      //   new TerserPlugin({
      //     test: /\.(js)?bundle(\?.*)?$/i,
      //     /**
      //      * Prevents emitting text file with comments, licenses etc.
      //      * If you want to gather in-file licenses, feel free to remove this line or configure it
      //      * differently.
      //      */
      //     extractComments: false,
      //     terserOptions: {
      //       format: {
      //         comments: false,
      //       },
      //     },
      //   }),
      // ],
      chunkIds: 'named',
    },
    module: {
      /**
       * This rule will process all React Native related dependencies with Babel.
       * If you have a 3rd-party dependency that you need to transpile, you can add it to the
       * `include` list.
       *
       * You can also enable persistent caching with `cacheDirectory` - please refer to:
       * https://github.com/babel/babel-loader#options
       */
      rules: [
        Repack.REACT_NATIVE_LOADING_RULES,
        Repack.NODE_MODULES_LOADING_RULES,
        Repack.FLOW_TYPED_MODULES_LOADING_RULES,
        // {
        //   test: /\.[cm]?[jt]sx?$/,
        //   include: [
        //     /node_modules(.*[/\\])+react-native/,
        //     /node_modules(.*[/\\])+@react-native/,
        //     /node_modules(.*[/\\])+@react-navigation/,
        //     /node_modules(.*[/\\])+@react-native-community/,
        //     /node_modules(.*[/\\])+expo/,
        //     /node_modules(.*[/\\])+pretty-format/,
        //     /node_modules(.*[/\\])+metro/,
        //     /node_modules(.*[/\\])+abort-controller/,
        //     /node_modules(.*[/\\])+@callstack[/\\]repack/,
        //   ],
        //   use: 'babel-loader',
        // },

        /** Here you can adjust loader that will process your files. */
        {
          test: /\.[jt]sx?$/,
          exclude: [/node_modules/],
          type: 'javascript/auto',
          use: {
            loader: 'builtin:swc-loader',
            /** @type {import('@rspack/core').SwcLoaderOptions} */
            options: {
              env: {
                targets: {
                  'react-native': '0.74',
                },
              },
              jsc: {
                externalHelpers: true,
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: mode === 'development',
                    refresh: mode === 'development' && Boolean(devServer),
                  },
                },
              },
            },
          },
        },
        /** Run React Native codegen, required for utilizing new architecture */
        Repack.REACT_NATIVE_CODEGEN_RULES,
        /**
         * Here you can adjust loader that will process your files.
         *
         * You can also enable persistent caching with `cacheDirectory` - please refer to:
         * https://github.com/babel/babel-loader#options
         */
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              /** Add React Refresh transform only when HMR is enabled. */
              plugins:
                devServer && devServer.hmr
                  ? ['module:react-refresh/babel']
                  : undefined,
            },
          },
        },
        /** Additional rule to enable HMR for local workspace packages */
        {
          test: /\.[jt]sx?$/,
          include: [/zephyr-merch/],
          use: 'builtin:react-refresh-loader',
        },
        /**
         * This loader handles all static assets (images, video, audio and others), so that you can
         * use (reference) them inside your application.
         *
         * If you want to handle specific asset type manually, filter out the extension
         * from `ASSET_EXTENSIONS`, for example:
         * ```
         * Repack.ASSET_EXTENSIONS.filter((ext) => ext !== 'svg')
         * ```
         */
        {
          test: Repack.getAssetExtensionsRegExp(Repack.ASSET_EXTENSIONS),
          use: {
            loader: '@callstack/repack/assets-loader',
            options: {
              platform,
              devServerEnabled: Boolean(devServer),
              /**
               * Defines which assets are scalable - which assets can have
               * scale suffixes: `@1x`, `@2x` and so on.
               * By default all images are scalable.
               */
              scalableAssetExtensions: Repack.SCALABLE_ASSETS,
            },
          },
        },
      ],
    },
    plugins: [
      new Dotenv(),
      /**
       * Configure other required and additional plugins to make the bundle
       * work in React Native and provide good development experience with
       * sensible defaults.
       *
       * `Repack.RepackPlugin` provides some degree of customization, but if you
       * need more control, you can replace `Repack.RepackPlugin` with plugins
       * from `Repack.plugins`.
       */
      new Repack.RepackPlugin({
        context,
        mode,
        platform,
        devServer,
        output: {
          bundleFilename,
          sourceMapFilename,
          assetsPath,
        },
      }),
      // silence missing @react-native-masked-view optionally required by @react-navigation/elements
      new rspack.IgnorePlugin({
        resourceRegExp: /^@react-native-masked-view/,
      }),
      new Repack.plugins.ModuleFederationPluginV2({
        name: 'MobileHost',
        filename: 'MobileHost.container.js.bundle',
        remotes: {
          MobileCart: `MobileCart@http://localhost:9000/${platform}/MobileCart.container.js.bundle`,
        },

        shared: getSharedDependencies({eager: true}),
      }),
    ],
  };

  if (USE_ZEPHYR) {
    return withZephyr()(config);
  }

  return config;
};
