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

    // Run FFmpeg command with segmentation
    await ffmpegInstance.exec([
      '-i', inputFileName,
      '-vn', // No video
      '-acodec', 'libmp3lame',
      '-ab', '64k', // Lower bitrate for speech
      '-ar', '22050', // Lower sample rate for speech
      '-ac', '1', // Mono
      '-f', 'segment', // Enable segmentation
      '-segment_time', '300', // 5 minutes per segment
      '-reset_timestamps', '1',
      outputFileName.replace('.mp3', '_%03d.mp3') // Output pattern for segments
    ]);

    // Read all segments and combine them
    let combinedData = new Uint8Array(0);
    let segmentIndex = 0;
    
    while (true) {
      try {
        const segmentName = outputFileName.replace('.mp3', `_${String(segmentIndex).padStart(3, '0')}.mp3`);
        const segmentData = await ffmpegInstance.readFile(segmentName);
        
        // Convert FileData to Uint8Array if it's a string
        const segmentUint8 = segmentData instanceof Uint8Array ? 
          segmentData : 
          new TextEncoder().encode(segmentData as string);
        
        // Combine with existing data
        const newData = new Uint8Array(combinedData.length + segmentUint8.length);
        newData.set(combinedData);
        newData.set(segmentUint8, combinedData.length);
        combinedData = newData;
        
        // Clean up segment
        await ffmpegInstance.deleteFile(segmentName);
        segmentIndex++;
      } catch {
        break; // No more segments
      }
    }

    // Clean up input file
    await ffmpegInstance.deleteFile(inputFileName);

    // Create final MP3 blob
    return new Blob([combinedData], { type: 'audio/mpeg' });
  } catch (error: any) {
    console.error('FFmpeg conversion error:', error);
    throw new Error(`Audio conversion failed: ${error.message}`);
  }
}
