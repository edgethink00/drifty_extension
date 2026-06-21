import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { driftyManifest } from './src/manifest';

const projectRoot = __dirname;
const sourceRoot = resolve(projectRoot, 'src');
const distRoot = resolve(projectRoot, 'dist');
const iconsRoot = resolve(projectRoot, 'icons');

function copyDirectory(sourcePath: string, destinationPath: string) {
  if (!existsSync(sourcePath)) {
    return;
  }

  mkdirSync(destinationPath, { recursive: true });
  cpSync(sourcePath, destinationPath, { recursive: true });
}

export default defineConfig({
  root: sourceRoot,
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'drifty-extension-scaffold',
      closeBundle() {
        mkdirSync(distRoot, { recursive: true });
        writeFileSync(
          resolve(distRoot, 'manifest.json'),
          `${JSON.stringify(driftyManifest, null, 2)}\n`
        );
        copyDirectory(resolve(sourceRoot, 'background'), resolve(distRoot, 'background'));
        copyDirectory(resolve(sourceRoot, 'content'), resolve(distRoot, 'content'));
        copyDirectory(iconsRoot, resolve(distRoot, 'icons'));
      }
    }
  ],
  build: {
    outDir: distRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(sourceRoot, 'popup/index.html'),
        dashboard: resolve(sourceRoot, 'dashboard/index.html'),
        onboarding: resolve(sourceRoot, 'onboarding/index.html')
      }
    }
  }
});
