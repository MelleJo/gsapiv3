import { Readable } from 'stream';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { nanoid } from './nanoid';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Converts an audio blob to MP3 format using FFmpeg
 * @param audioBlob The input audio blob
 * @param originalFormat The original file format/extension
 * @returns A new blob containing the MP3 audio
 */
export async function convertToMp3(audioBlob: Blob, originalFormat: string): Promise<Blob> {
  // Create temporary file paths
  const tempDir = tmpdir();
  const tempId = nanoid();
  const inputPath = join(tempDir, `input_${tempId}.${originalFormat}`);
  const outputPath = join(tempDir, `output_${tempId}.mp3`);

  try {
    // Write the blob to a temporary file
    const buffer = await audioBlob.arrayBuffer();
    await writeFile(inputPath, Buffer.from(buffer));

    // Convert to MP3 using fluent-ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .outputOptions([
          '-vn', // No video
          '-acodec', 'libmp3lame',
          '-ab', '192k', // High quality bitrate
          '-ar', '44100', // Standard sample rate
        ])
        .output(outputPath)
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg conversion failed: ${err.message}`));
        })
        .run();
    });

    // Read the converted file
    const mp3Buffer = await Readable.from(await readFile(outputPath)).read();
    
    // Create a new blob with MP3 type
    return new Blob([mp3Buffer], { type: 'audio/mpeg' });
  } finally {
    // Clean up temporary files
    try {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    } catch (error) {
      console.error('Error cleaning up temporary files:', error);
    }
  }
}

/**
 * Helper function to read a file into a buffer
 */
async function readFile(path: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.from(await import('fs').then(fs => fs.createReadStream(path)))) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
