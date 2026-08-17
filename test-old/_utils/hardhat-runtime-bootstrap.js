require('@babel/register')({
    presets: [
        ['@babel/preset-env', {
            targets: {
                node: '22',
            },
            exclude: [
                'proposal-dynamic-import',
            ],
        }],
    ],
    extensions: ['.js', '.cjs'],
    only: [/test|scripts/],
    retainLines: true,
});
require('@babel/polyfill');
require('ts-node/register/transpile-only');
