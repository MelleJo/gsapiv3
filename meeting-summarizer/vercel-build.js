const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure the output.css file exists
const outputPath = path.join(__dirname, 'src', 'app', 'output.css');
if (!fs.existsSync(outputPath)) {
  console.log('Creating output.css file...');
  fs.writeFileSync(outputPath, '/* Generated by Tailwind */');
}

// Run Tailwind CLI to generate the CSS
console.log('Generating Tailwind CSS...');
try {
  execSync('npx tailwindcss -i ./src/app/globals.css -o ./src/app/output.css', { 
    stdio: 'inherit' 
  });
  console.log('Tailwind CSS successfully generated!');
} catch (error) {
  console.error('Error generating Tailwind CSS:', error);
  process.exit(1);
}

// Now run the Next.js build
console.log('Running Next.js build...');
try {
  execSync('next build', { stdio: 'inherit' });
  console.log('Next.js build completed successfully!');
} catch (error) {
  console.error('Error during Next.js build:', error);
  process.exit(1);
}
