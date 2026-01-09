import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const stagingDir = join(process.cwd(), 'dist-staging', 'staging');
const distDir = join(process.cwd(), 'dist');

// Clean up old staging directory
if (existsSync(join(process.cwd(), 'dist-staging'))) {
  rmSync(join(process.cwd(), 'dist-staging'), { recursive: true, force: true });
}

// Create staging/staging subdirectory
mkdirSync(stagingDir, { recursive: true });

// Copy dist contents to dist-staging/staging
cpSync(distDir, stagingDir, { recursive: true });

console.log('✅ Files copied to staging directory');

