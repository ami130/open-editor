import terser from '@rollup/plugin-terser';

// Same minified-only distribution posture as the core. vue and the core are
// externals — the wrapper is a few-KB shim by design.
const external = ['vue', '@open-editor-hq/core'];

export default [
  {
    input: 'src/index.js',
    external,
    output: [
      { file: 'dist/open-editor-vue.min.js', format: 'es', sourcemap: false, plugins: [terser()] },
      { file: 'dist/open-editor-vue.min.cjs', format: 'cjs', sourcemap: false, exports: 'named', plugins: [terser()] },
    ],
  },
];
