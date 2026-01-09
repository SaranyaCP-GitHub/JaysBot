import { cpSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const distRoot = join(process.cwd(), 'dist');
const tempGhPages = join(process.cwd(), 'temp-gh-pages');

try {
  console.log('📥 Fetching existing staging files from gh-pages...');
  // Clone gh-pages branch to temp directory
  execSync(`git clone --branch gh-pages --single-branch --depth 1 https://github.com/SaranyacP-GitHub/JaysBot.git ${tempGhPages}`, { stdio: 'ignore' });
  
  if (existsSync(tempGhPages)) {
    const stagingSrc = join(tempGhPages, 'staging');
    const stagingDest = join(distRoot, 'staging');
    
    if (existsSync(stagingSrc)) {
      cpSync(stagingSrc, stagingDest, { recursive: true });
      console.log('✅ Preserved staging files');
    } else {
      console.log('ℹ️ No existing staging files to preserve');
    }
  }
  
  // Clean up temp directory
  rmSync(tempGhPages, { recursive: true, force: true });
} catch (error) {
  console.log('ℹ️ No existing staging files to preserve (first deploy)');
}

