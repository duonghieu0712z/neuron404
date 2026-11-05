import process from 'node:process';

import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'NEURON404_');
    if (env.NEURON404_DATA_DIR && !process.env.NEURON404_DATA_DIR)
        process.env.NEURON404_DATA_DIR = env.NEURON404_DATA_DIR;

    return {
        plugins: [
            tailwindcss(),
            sveltekit({
                compilerOptions: {
                    // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                    runes: ({ filename }) =>
                        filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
                },

                adapter: adapter(),
            }),
        ],
    };
});
