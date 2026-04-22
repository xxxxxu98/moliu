import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// Plugin to copy resources to output
function copyResources() {
  return {
    name: 'copy-resources',
    closeBundle() {
      const resourcesDir = path.resolve(__dirname, 'resources');
      const outputDir = path.resolve(__dirname, '.vite/build');
      
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      
      const iconSrc = path.join(resourcesDir, 'icon.png');
      const iconDest = path.join(outputDir, 'icon.png');
      
      if (existsSync(iconSrc)) {
        copyFileSync(iconSrc, iconDest);
        console.log('Copied icon.png to build output');
      }
    }
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [copyResources()],
});
