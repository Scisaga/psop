import { defineConfig } from 'vite';

export default defineConfig({
  // Device assets are served from validated DKP mounts, never copied from a UI data folder.
  publicDir: 'static',
});
