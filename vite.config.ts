import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import glsl from 'vite-plugin-glsl';

export default defineConfig({
    base: '/genshin-start/',
    plugins: [
        wasm(),
        glsl({
            include: ['**/*.wgsl', '**/*.vert', '**/*.frag'],
            warnDuplicatedImports: true,
        }),
    ],
});
