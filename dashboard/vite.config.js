import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any static host path (e.g. GitHub Pages project sites).
export default defineConfig({ plugins: [react()], base: './' });
