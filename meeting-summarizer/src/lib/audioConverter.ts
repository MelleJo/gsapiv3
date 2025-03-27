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
// Modifications for the convertToMp3 function in audioConverter.ts 
// This replaces the existing function for better performance

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

    // Determine best settings based on file size
    const isLargeFile = audioBlob.size > 50 * 1024 * 1024; // 50MB
    const isHugeFile = audioBlob.size > 100 * 1024 * 1024; // 100MB

    // Common options, but more aggressive for larger files
    const options = [
      '-i', inputFileName,
      '-vn', // No video
      '-c:a', 'libmp3lame',
      '-ac', '1', // Convert to mono
    ];

    // Add quality settings based on file size
    if (isHugeFile) {
      // Very aggressive settings for huge files
      options.push(
        '-ab', '32k', // Very low bitrate
        '-ar', '16000', // 16kHz sample rate
      );
    } else if (isLargeFile) {
      // Aggressive settings for large files
      options.push(
        '-ab', '48k', // Low bitrate for speech
        '-ar', '22050', // Lower sample rate
      );
    } else {
      // Standard settings for normal files
      options.push(
        '-ab', '64k', // Reasonable bitrate for speech
        '-ar', '22050', // Lower sample rate for speech
      );
    }

    // For segmentation (helps prevent memory issues with large files)
    if (isLargeFile) {
      options.push(
        '-f', 'segment', // Enable segmentation
        '-segment_time', isHugeFile ? '180' : '300', // 3 or 5 minutes per segment
        '-reset_timestamps', '1',
        outputFileName.replace('.mp3', '_%03d.mp3') // Output pattern for segments
      );
    } else {
      // Standard output for smaller files
      options.push(outputFileName);
    }

    // Run FFmpeg command
    await ffmpegInstance.exec(options);

    // Read output file(s)
    let combinedData: Uint8Array;
    
    if (isLargeFile) {
      // Combine segments
      combinedData = await combineSegments(ffmpegInstance, outputFileName);
    } else {
      // Direct file read for smaller files
      const data = await ffmpegInstance.readFile(outputFileName);
      combinedData = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
      await ffmpegInstance.deleteFile(outputFileName);
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

// Helper function to combine segmented files
async function combineSegments(ffmpeg: any, outputFilePattern: string): Promise<Uint8Array> {
  let combinedData = new Uint8Array(0);
  let segmentIndex = 0;
  
  while (true) {
    try {
      const segmentName = outputFilePattern.replace('.mp3', `_${String(segmentIndex).padStart(3, '0')}.mp3`);
      const segmentExists = await checkFileExists(ffmpeg, segmentName);
      
      if (!segmentExists) {
        break; // No more segments
      }
      
      const segmentData = await ffmpeg.readFile(segmentName);
      
      // Convert FileData to Uint8Array
      const segmentUint8 = segmentData instanceof Uint8Array ? 
        segmentData : 
        new TextEncoder().encode(segmentData as string);
      
      // Combine with existing data
      const newData = new Uint8Array(combinedData.length + segmentUint8.length);
      newData.set(combinedData);
      newData.set(segmentUint8, combinedData.length);
      combinedData = newData;
      
      // Clean up segment
      await ffmpeg.deleteFile(segmentName);
      segmentIndex++;
    } catch (error) {
      if (segmentIndex === 0) {
        // If no segments were processed, this is a real error
        throw error;
      }
      // Otherwise we've just run out of segments
      break;
    }
  }
  
  if (combinedData.length === 0) {
    throw new Error('No output was generated during conversion');
  }
  
  return combinedData;
}

// Helper to check if a file exists in the FFmpeg virtual filesystem
async function checkFileExists(ffmpeg: any, fileName: string): Promise<boolean> {
  try {
    // Try to read the file stats
    await ffmpeg.stat(fileName);
    return true;
  } catch (error) {
    return false;
  }
}
