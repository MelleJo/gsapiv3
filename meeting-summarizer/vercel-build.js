const { execSync } = require('child_process');
const path = require('path');

// Print working directory for debugging
console.log('Current working directory:', process.cwd());

try {
  // Run Tailwind CSS compilation
  console.log('Running Tailwind CSS build...');
  execSync('npx tailwindcss -i ./src/app/tailwind.css -o ./src/app/output.css', { 
    stdio: 'inherit',
    cwd: process.cwd() 
  });
  console.log('Tailwind CSS build completed successfully');
  
  // Continue with Next.js build
  console.log('Starting Next.js build...');
} catch (error) {
  console.error('Error during Vercel build:', error.message);
  process.exit(1);
}
