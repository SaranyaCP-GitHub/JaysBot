import { cpSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const distRoot = join(process.cwd(), 'dist');
const tempGhPages = join(process.cwd(), 'temp-gh-pages');

// Get the git remote URL from the current repository
let gitRemoteUrl = 'https://github.com/SaranyacP-GitHub/JaysBot.git';
try {
  const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8', stdio: 'pipe' }).trim();
  if (remoteUrl) {
    // Convert SSH URL to HTTPS if needed
    gitRemoteUrl = remoteUrl.replace(/git@github.com:/, 'https://github.com/').replace(/\.git$/, '') + '.git';
    console.log(`📦 Using repository: ${gitRemoteUrl}`);
  }
} catch (err) {
  console.log(`⚠️ Could not get git remote URL, using default: ${gitRemoteUrl}`);
}

try {
  console.log('📥 Fetching existing staging files from gh-pages branch...');
  
  // Clean up temp directory if it exists
  if (existsSync(tempGhPages)) {
    rmSync(tempGhPages, { recursive: true, force: true });
  }
  
  // Clone gh-pages branch to temp directory
  execSync(`git clone --branch gh-pages --single-branch --depth 1 "${gitRemoteUrl}" "${tempGhPages}"`, { 
    stdio: 'pipe',
    encoding: 'utf8'
  });
  
  if (existsSync(tempGhPages)) {
    const stagingSrc = join(tempGhPages, 'staging');
    const stagingDest = join(distRoot, 'staging');
    
    if (existsSync(stagingSrc)) {
      cpSync(stagingSrc, stagingDest, { recursive: true });
      console.log('✅ Preserved staging files');
    } else {
      console.log('ℹ️ No existing staging files to preserve');
    }
  } else {
    console.log('⚠️ Temp directory was not created after clone');
  }
  
  // Clean up temp directory
  if (existsSync(tempGhPages)) {
    rmSync(tempGhPages, { recursive: true, force: true });
  }
} catch (error) {
  console.error('❌ Error fetching staging files:', error.message);
  console.log('ℹ️ Continuing deployment without preserving staging files');
  console.log('💡 Tip: Make sure gh-pages branch exists and is accessible');
}

