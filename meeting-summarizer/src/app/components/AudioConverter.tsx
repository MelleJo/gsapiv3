// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { formatBytes } from '@/lib/audioChunker';

// Define custom FFmpeg types
interface FFmpegInstance extends FFmpeg {
  isLoaded: boolean;
}

interface AudioConverterProps {
  file: File | null;
  onConversionComplete: (convertedFile: File) => void;
  onError: (error: string) => void;
  targetFormat?: 'wav' | 'mp3';
  onProgress?: (progress: number) => void;
}

export default function AudioConverter({
  file,
  onConversionComplete,
  onError,
  targetFormat = 'mp3', // Default to MP3 for better compression
  onProgress
}: AudioConverterProps) {
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const ffmpegRef = useRef<FFmpegInstance | null>(null);
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load FFmpeg when component mounts
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        console.log('Loading FFmpeg...');
        
        // Create FFmpeg instance with type assertion
        const ffmpeg = new FFmpeg() as unknown as FFmpegInstance;
        
        // Load FFmpeg with progress logging
        ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg log:', message);
          
          // Extract progress from log messages if they contain percentage info
          if (message.includes('time=') && message.includes('bitrate=')) {
            // Try to parse the progress more accurately from FFmpeg output
            try {
              // Example message: "frame=   30 fps=0.0 q=-1.0 size=     384kB time=00:00:01.20 bitrate=2621.4kbits/s speed=2.08x"
              const timeMatch = message.match(/time=(\d+:\d+:\d+\.\d+)/);
              if (timeMatch && timeMatch[1]) {
                const timeString = timeMatch[1]; // e.g. "00:00:01.20"
                const [hours, minutes, seconds] = timeString.split(':').map(parseFloat);
                const currentTimeInSeconds = hours * 3600 + minutes * 60 + seconds;
                
                // We also need the duration to calculate percentage
                // For simplicity, we'll start at 5% and gradually increase
                // This isn't perfect but gives the user feedback
                const estimatedProgress = Math.min(95, Math.round(currentTimeInSeconds * 3 + 5));
                setProgress(estimatedProgress);
                if (onProgress) onProgress(estimatedProgress);
              }
            } catch (parseError) {
              // Fall back to approximate progress if parsing fails
              const approximate = Math.min(95, progress + Math.random() * 5);
              setProgress(Math.round(approximate));
              if (onProgress) onProgress(Math.round(approximate));
            }
          }
        });

        // Load FFmpeg
        await ffmpeg.load({
          coreURL: '/ffmpeg/ffmpeg-core.js',
          wasmURL: '/ffmpeg/ffmpeg-core.wasm'
        });
        
        ffmpegRef.current = ffmpeg;
        setIsFFmpegLoaded(true);
        console.log('FFmpeg loaded successfully');
      } catch (loadError) {
        console.error('Failed to load FFmpeg:', loadError);
        setError('FFmpeg kon niet worden geladen. Probeer de pagina te verversen.');
        onError(`Failed to load audio conversion library: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
      }
    };

    loadFFmpeg();

    // Cleanup function
    return () => {
      // FFmpeg doesn't have an explicit destroy method, but we can reset our ref
      ffmpegRef.current = null;
    };
  }, [onError]);

  // Convert file when it changes and FFmpeg is loaded
  useEffect(() => {
    const convertFile = async () => {
      if (!file || !ffmpegRef.current || !isFFmpegLoaded) return;

      // Check file size for appropriate conversion settings
      const isLargeFile = file.size > 50 * 1024 * 1024; // 50MB
      const isHugeFile = file.size > 100 * 1024 * 1024; // 100MB
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      
      // Only skip if it's already an optimized MP3 file (under 10MB)
      const skipConversion = 
        fileExtension === targetFormat && 
        targetFormat === 'mp3' && 
        file.size < 10 * 1024 * 1024;
        
      if (skipConversion) {
        console.log(`File is already an optimized ${targetFormat} format, skipping conversion`);
        onConversionComplete(file);
        return;
      }

      setIsConverting(true);
      setProgress(0);
      setError(null);

      try {
        const ffmpeg = ffmpegRef.current;
        
        // Get a clean input filename
        const inputFileName = `input.${fileExtension || 'mp4'}`;
        
        // Determine output filename based on target format
        const outputFileName = `output.${targetFormat}`;
        
        console.log(`Converting ${inputFileName} (${formatBytes(file.size)}) to ${outputFileName}...`);
        
        // Convert file to ArrayBuffer and create a compatible Uint8Array
        const fileData = await file.arrayBuffer();

        // Write input file to FFmpeg's virtual filesystem
        await ffmpeg.writeFile(inputFileName, new Uint8Array(fileData));
        
        // For very large files (>50MB), use more aggressive compression and optimization
        // This ensures the API can process the audio files more reliably
        const ffmpegArgs = [];
        
        // Input file
        ffmpegArgs.push('-i', inputFileName);
        
        // Common options
        ffmpegArgs.push('-vn');  // No video
        ffmpegArgs.push('-c:a', targetFormat === 'wav' ? 'pcm_s16le' : 'libmp3lame');
        ffmpegArgs.push('-ac', '1');  // Convert to mono
        
        // Quality settings based on file size
        if (isHugeFile) {
          // Very aggressive settings for huge files
          ffmpegArgs.push('-ar', '16000');  // 16kHz sample rate
          if (targetFormat === 'mp3') {
            ffmpegArgs.push('-b:a', '32k');  // Very low bitrate
          }
        } else if (isLargeFile) {
          // Aggressive settings for large files
          ffmpegArgs.push('-ar', '22050');  // Lower sample rate
          if (targetFormat === 'mp3') {
            ffmpegArgs.push('-b:a', '48k');  // Low bitrate for speech
          }
        } else {
          // Standard settings for normal files
          ffmpegArgs.push('-ar', '22050');  // Reduced sample rate
          if (targetFormat === 'mp3') {
            ffmpegArgs.push('-b:a', '64k');  // Reasonable bitrate for speech
          }
        }
        
        // For large files, use segmentation to avoid memory issues
        if (isLargeFile && targetFormat === 'mp3') {
          ffmpegArgs.push(
            '-f', 'segment',             // Enable segmentation
            '-segment_time', isHugeFile ? '180' : '300',  // 3 or 5 minutes per segment
            '-reset_timestamps', '1',
            outputFileName.replace('.mp3', '_%03d.mp3')   // Output pattern for segments
          );
        } else {
          // Standard output file
          ffmpegArgs.push(outputFileName);
        }
        
        // Run FFmpeg command
        await ffmpeg.exec(ffmpegArgs);
        
        // Process the output
        let combinedData: Uint8Array;
        
        if (isLargeFile && targetFormat === 'mp3') {
          // Combine segments for large files
          combinedData = await combineSegments(ffmpeg, outputFileName);
        } else {
          // Direct file read for smaller files
          const data = await ffmpeg.readFile(outputFileName);
          combinedData = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
          await ffmpeg.deleteFile(outputFileName);
        }
        
        // Clean up input file
        await ffmpeg.deleteFile(inputFileName);
        
        // Create final converted file
        const contentType = targetFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
        const convertedBlob = new Blob([combinedData], { type: contentType });
        
        // Generate new file name with correct extension
        const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const newFileName = `${originalName}.${targetFormat}`;
        
        const convertedFile = new File([convertedBlob], newFileName, {
          type: contentType,
          lastModified: Date.now()
        });
        
        console.log(`Conversion complete: ${newFileName} (${formatBytes(convertedFile.size)})`);
        
        // Update progress to 100%
        setProgress(100);
        if (onProgress) onProgress(100);
        
        onConversionComplete(convertedFile);
        
      } catch (conversionError) {
        console.error('Conversion failed:', conversionError);
        setError(`Conversie mislukt: ${conversionError instanceof Error ? conversionError.message : 'Onbekende fout'}`);
        onError(`Audio conversion failed: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
      } finally {
        setIsConverting(false);
      }
    };

    if (file && isFFmpegLoaded && !isConverting) {
      convertFile();
    }
  }, [file, isFFmpegLoaded, targetFormat, onConversionComplete, onError, isConverting, onProgress]);

  // Helper function to combine segmented files
  const combineSegments = async (ffmpeg: any, outputFilePattern: string): Promise<Uint8Array> => {
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
  };

  // Helper to check if a file exists in the FFmpeg virtual filesystem
  const checkFileExists = async (ffmpeg: any, fileName: string): Promise<boolean> => {
    try {
      // Try to read the file stats
      await ffmpeg.stat(fileName);
      return true;
    } catch (error) {
      return false;
    }
  };

  return (
    <div className="audio-converter">
      {isConverting && (
        <div className="conversion-progress">
          <div className="text-sm text-neutral-600 mb-2">
            {error ? (
              <span className="text-red-500">Error: {error}</span>
            ) : (
              <span>Audio wordt geconverteerd naar {targetFormat.toUpperCase()} ({progress}%)</span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Dit kan enkele minuten duren voor grote bestanden...
          </p>
        </div>
      )}
    </div>
  );
}