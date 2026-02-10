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

// Get the git remote URL from the current repository
let gitRemoteUrl = 'https://github.com/SaranyacP-GitHub/JaysBot.git';
try {
  const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8', stdio: 'pipe' }).trim();
  if (remoteUrl) {
    // Convert SSH URL to HTTPS if needed, or keep as-is if already HTTPS
    if (remoteUrl.startsWith('git@')) {
      gitRemoteUrl = remoteUrl.replace(/git@github.com:/, 'https://github.com/').replace(/\.git$/, '') + '.git';
    } else if (remoteUrl.includes('github.com')) {
      gitRemoteUrl = remoteUrl.endsWith('.git') ? remoteUrl : remoteUrl + '.git';
    }
    console.log(`📦 Using repository: ${gitRemoteUrl}`);
  }
} catch (err) {
  console.log(`⚠️ Could not get git remote URL, using default: ${gitRemoteUrl}`);
}

try {
  console.log('📥 Fetching existing production files from gh-pages branch...');
  
  // Clean up temp directory if it exists
  if (existsSync(tempGhPages)) {
    rmSync(tempGhPages, { recursive: true, force: true });
  }
  
  // Try cloning with more verbose error output for debugging
  let cloneOutput = '';
  try {
    cloneOutput = execSync(`git clone --branch gh-pages --single-branch --depth 1 "${gitRemoteUrl}" "${tempGhPages}" 2>&1`, { 
      encoding: 'utf8'
    });
  } catch (cloneError) {
    // Get stderr for better error messages
    const errorMsg = cloneError.stderr?.toString() || cloneError.message || 'Unknown error';
    throw new Error(`Git clone failed: ${errorMsg}`);
  }
  
  if (!existsSync(tempGhPages)) {
    throw new Error('Temp directory was not created after clone');
  }
  
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
        console.log(`  ✓ Preserved: ${file}`);
      } catch (err) {
        console.warn(`  ⚠️ Could not preserve ${file}:`, err.message);
      }
    }
  });
  
  if (preservedCount > 0) {
    console.log(`✅ Preserved ${preservedCount} production file(s)`);
  } else {
    console.log('ℹ️ No production files found in gh-pages branch to preserve');
    console.log('   This might be the first deployment or production files were not found');
  }
  
  // Clean up temp directory
  if (existsSync(tempGhPages)) {
    rmSync(tempGhPages, { recursive: true, force: true });
  }
} catch (error) {
  const errorMsg = error.message || error.toString();
  console.error('❌ Error fetching production files:', errorMsg);
  console.log('');
  console.log('💡 Troubleshooting tips:');
  console.log('   1. Make sure the gh-pages branch exists in your repository');
  console.log('   2. Try deploying production first: npm run deploy:production');
  console.log('   3. Wait a few seconds after production deployment before deploying staging');
  console.log('   4. Check if you have access to the repository');
  console.log('');
  console.log('ℹ️ Continuing deployment without preserving production files');
  console.log('⚠️  Production files at root will be removed!');
}

console.log('✅ Staging files ready with production files preserved');

