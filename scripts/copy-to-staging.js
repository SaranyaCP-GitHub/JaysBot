import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const stagingDir = join(process.cwd(), 'dist-staging', 'staging');
const distDir = join(process.cwd(), 'dist');
const distStagingRoot = join(process.cwd(), 'dist-staging');

// Clean up old staging directory
if (existsSync(distStagingRoot)) {
  rmSync(distStagingRoot, { recursive: true, force: true });
}

// Create staging subdirectory
mkdirSync(stagingDir, { recursive: true });

// Copy dist contents to dist-staging/staging
cpSync(distDir, stagingDir, { recursive: true });

// IMPORTANT: Preserve existing production files from gh-pages
const tempGhPages = join(process.cwd(), 'temp-gh-pages');
try {
  console.log('📥 Fetching existing production files from gh-pages...');
  // Clone gh-pages branch to temp directory
  execSync(`git clone --branch gh-pages --single-branch --depth 1 https://github.com/SaranyacP-GitHub/JaysBot.git ${tempGhPages}`, { stdio: 'ignore' });
  
  if (existsSync(tempGhPages)) {
    const files = readdirSync(tempGhPages);
    let preservedCount = 0;
    
    files.forEach(file => {
      // Skip staging folder (we're replacing it) and .git
      if (file !== 'staging' && file !== '.git' && file !== 'temp-gh-pages') {
        const src = join(tempGhPages, file);
        const dest = join(distStagingRoot, file);
        
        try {
          if (statSync(src).isDirectory()) {
            cpSync(src, dest, { recursive: true });
          } else {
            cpSync(src, dest);
          }
          preservedCount++;
        } catch (err) {
          // Ignore errors for individual files
        }
      }
    });
    
    console.log(`✅ Preserved ${preservedCount} production file(s)`);
  }
  
  // Clean up temp directory
  rmSync(tempGhPages, { recursive: true, force: true });
} catch (error) {
  // If clone fails (first deploy or no gh-pages branch), that's okay
  console.log('ℹ️ No existing production files to preserve (first deploy)');
}

console.log('✅ Staging files ready with production files preserved');

