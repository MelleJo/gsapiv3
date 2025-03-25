const https = require('https');
const fs = require('fs');
const path = require('path');

const ffmpegFiles = [
  {
    url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    filename: 'ffmpeg-core.js'
  },
  {
    url: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    filename: 'ffmpeg-core.wasm'
  }
];

const ffmpegDir = path.join(__dirname, '..', 'public', 'ffmpeg');

// Ensure the ffmpeg directory exists
if (!fs.existsSync(ffmpegDir)) {
  fs.mkdirSync(ffmpegDir, { recursive: true });
}

// Download function
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${dest}`);
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {}); // Delete the file if there was an error
      reject(err);
    });
  });
}

// Download all files
async function downloadAll() {
  for (const file of ffmpegFiles) {
    const dest = path.join(ffmpegDir, file.filename);
    console.log(`Downloading ${file.url}...`);
    await downloadFile(file.url, dest);
  }
  console.log('All files downloaded successfully!');
}

downloadAll().catch(console.error);
