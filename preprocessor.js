/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transform: babelTransform, util: babelUtil } = require('@babel/core');
const babelIstanbulPlugin = require('babel-plugin-istanbul');

const BABELRC_FILENAME = '.babelrc';
const BABELRC_JS_FILENAME = '.babelrc.js';
const BABEL_CONFIG_KEY = 'babel';
const PACKAGE_JSON = 'package.json';
const THIS_FILE = fs.readFileSync(__filename);

const jestPreset = {
    plugins: [
        require("babel-plugin-jest-hoist")
    ]
}

const createTransformer = (options) => {
    const cache = Object.create(null);

    const getBabelRC = filename => {
        const paths = [];
        let directory = filename;
        while (directory !== (directory = path.dirname(directory))) {
            if (cache[directory]) {
                break;
            }

            paths.push(directory);
            const configFilePath = path.join(directory, BABELRC_FILENAME);
            if (fs.existsSync(configFilePath)) {
                cache[directory] = fs.readFileSync(configFilePath, 'utf8');
                break;
            }
            const configJsFilePath = path.join(directory, BABELRC_JS_FILENAME);
            if (fs.existsSync(configJsFilePath)) {
                // $FlowFixMe
                cache[directory] = JSON.stringify(require(configJsFilePath));
                break;
            }
            const resolvedJsonFilePath = path.join(directory, PACKAGE_JSON);
            const packageJsonFilePath =
                resolvedJsonFilePath === PACKAGE_JSON
                    ? path.resolve(directory, PACKAGE_JSON)
                    : resolvedJsonFilePath;
            if (fs.existsSync(packageJsonFilePath)) {
                // $FlowFixMe
                const packageJsonFileContents = require(packageJsonFilePath);
                if (packageJsonFileContents[BABEL_CONFIG_KEY]) {
                    cache[directory] = JSON.stringify(
                        packageJsonFileContents[BABEL_CONFIG_KEY],
                    );
                    break;
                }
            }
        }
        paths.forEach(directoryPath => (cache[directoryPath] = cache[directory]));
        return cache[directory] || '';
    };

    options = Object.assign({}, options, {
        plugins: (options && options.plugins) || [],
        presets: ((options && options.presets) || []).concat([jestPreset]),
        retainLines: true,
        sourceMaps: 'inline',
    });
    delete options.cacheDirectory;
    delete options.filename;

    return {
        canInstrument: true,
        getCacheKey(
            fileData,
            filename,
            configString,
            { instrument, rootDir },
        ) {
            return crypto
                .createHash('md5')
                .update(THIS_FILE)
                .update('\0', 'utf8')
                .update(fileData)
                .update('\0', 'utf8')
                .update(path.relative(rootDir, filename))
                .update('\0', 'utf8')
                .update(configString)
                .update('\0', 'utf8')
                .update(getBabelRC(filename))
                .update('\0', 'utf8')
                .update(instrument ? 'instrument' : '')
                .digest('hex');
        },
        process(
            src,
            filename,
            config,
            transformOptions,
        ) {
            if (babelUtil && !babelUtil.canCompile(filename)) {
                return src;
            }

            const theseOptions = Object.assign({ filename }, options);
            if (transformOptions && transformOptions.instrument) {
                theseOptions.auxiliaryCommentBefore = ' istanbul ignore next ';
                // Copied from jest-runtime transform.js
                theseOptions.plugins = theseOptions.plugins.concat([
                    [
                        babelIstanbulPlugin,
                        {
                            // files outside `cwd` will not be instrumented
                            cwd: config.rootDir,
                            exclude: [],
                        },
                    ],
                ]);
            }

            // babel v7 might return null in the case when the file has been ignored.
            const transformResult = babelTransform(src, theseOptions);
            return transformResult ? transformResult.code : src;
        },
    };
};

module.exports = createTransformer();
module.exports.createTransformer = createTransformer;