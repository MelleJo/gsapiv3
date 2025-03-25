import { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpeg: FFmpeg | null = null;

/**
 * Initialize FFmpeg instance
 */
async function initFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm'
    });
  }
  return ffmpeg;
}

/**
 * Converts an audio blob to MP3 format using FFmpeg WASM
 * @param audioBlob The input audio blob
 * @param originalFormat The original file format/extension
 * @returns A new blob containing the MP3 audio
 */
export async function convertToMp3(audioBlob: Blob, originalFormat: string): Promise<Blob> {
  try {
    const ffmpegInstance = await initFFmpeg();
    if (!ffmpegInstance) {
      throw new Error('Failed to initialize FFmpeg');
    }
    
    // Convert blob to array buffer
    const inputData = await audioBlob.arrayBuffer();
    const inputFileName = `input.${originalFormat}`;
    const outputFileName = 'output.mp3';

    // Write input file
    await ffmpegInstance.writeFile(inputFileName, new Uint8Array(inputData));

    // Run FFmpeg command
    await ffmpegInstance.exec([
      '-i', inputFileName,
      '-vn', // No video
      '-acodec', 'libmp3lame',
      '-ab', '192k', // High quality bitrate
      '-ar', '44100', // Standard sample rate
      '-y', // Overwrite output
      outputFileName
    ]);

    // Read the output file
    const data = await ffmpegInstance.readFile(outputFileName);
    
    // Clean up
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);

    // Create MP3 blob
    return new Blob([data], { type: 'audio/mpeg' });
  } catch (error: any) {
    console.error('FFmpeg conversion error:', error);
    throw new Error(`Audio conversion failed: ${error.message}`);
  }
}
