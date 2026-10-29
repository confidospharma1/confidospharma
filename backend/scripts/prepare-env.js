/**
 * Confidos Pharma Enterprise OS - Deployment & Environment Preparation Script
 * 
 * Safely resolves and validates DATABASE_URL and DIRECT_URL for Prisma Client generation
 * and Render production deployments without hardcoding credentials or breaking local development.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.RENDER === 'true' ||
  process.env.CI === 'true';

// Helper to parse simple key-value .env files without external dependencies
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.substring(1, val.length - 1);
      }
      result[key] = val;
    }
  }
  return result;
}

// 1. In local development only, create .env from .env.example if missing
if (!isProduction && !fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('ℹ️ [prepare-env] Created initial local .env from .env.example.');
  console.log('ℹ️ [prepare-env] Remember to configure your local or Neon PostgreSQL credentials in .env.');
}

// 2. Load any existing variables from .env into process.env if not already present in environment
const localEnv = parseEnvFile(envPath);
for (const [key, val] of Object.entries(localEnv)) {
  if (!process.env[key]) {
    process.env[key] = val;
  }
}

// 3. Resolve DATABASE_URL and DIRECT_URL
let dbUrl = process.env.DATABASE_URL;
let directUrl = process.env.DIRECT_URL;

if (dbUrl && !directUrl) {
  // Graceful fallback: If DATABASE_URL is provided (e.g., in Render dashboard) but DIRECT_URL was omitted,
  // use DATABASE_URL as DIRECT_URL so Prisma CLI commands (generate, push) succeed without throwing P1012.
  console.log('ℹ️ [prepare-env] DIRECT_URL not set in environment. Defaulting DIRECT_URL to DATABASE_URL.');
  process.env.DIRECT_URL = dbUrl;
  directUrl = dbUrl;

  // Persist fallback to .env so subsequent CLI steps (e.g. npx prisma db push) automatically find DIRECT_URL
  try {
    if (fs.existsSync(envPath)) {
      const currentContent = fs.readFileSync(envPath, 'utf8');
      if (!currentContent.includes('DIRECT_URL=')) {
        fs.appendFileSync(
          envPath,
          `\n# Auto-configured fallback directUrl for Prisma CLI compatibility\nDIRECT_URL="${dbUrl}"\n`
        );
      }
    } else {
      fs.writeFileSync(
        envPath,
        `# Auto-generated runtime environment for Prisma CLI\nDIRECT_URL="${dbUrl}"\n`
      );
    }
  } catch (err) {
    console.warn('⚠️ [prepare-env] Could not update .env file with DIRECT_URL fallback:', err.message);
  }
} else if (!dbUrl && !directUrl) {
  // If neither is defined (e.g. during a headless CI build), provide dummy values in memory
  // so `prisma generate` can build the client without failing schema validation.
  console.warn('⚠️ [prepare-env] DATABASE_URL and DIRECT_URL are not set. Supplying build-time dummy values for client generation.');
  const dummy = 'postgresql://build_dummy:build_dummy@localhost:5432/build_dummy';
  process.env.DATABASE_URL = dummy;
  process.env.DIRECT_URL = dummy;

  try {
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(
        envPath,
        `# Build-time dummy environment for Prisma generation\nDATABASE_URL="${dummy}"\nDIRECT_URL="${dummy}"\n`
      );
    }
  } catch (err) {
    // Ignore error if filesystem is read-only
  }
} else if (directUrl) {
  console.log('✓ [prepare-env] DIRECT_URL is properly configured.');
}

console.log('✓ [prepare-env] Environment preparation complete.');
