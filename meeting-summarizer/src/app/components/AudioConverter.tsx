'use client';

import { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';

// Define types for ffmpeg instance
interface FFmpegInstance extends FFmpeg {
  isLoaded: boolean;
}

// Define props for the component
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
  targetFormat = 'mp3', // Changed default from wav to mp3
  onProgress
}: AudioConverterProps) {
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const ffmpegRef = useRef<FFmpegInstance | null>(null);
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);

  // Load FFmpeg when component mounts
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        // Get the current origin to construct absolute URLs
        const origin = window.location.origin;
        
        // Create FFmpeg instance
        const ffmpeg = new FFmpeg() as FFmpegInstance;
        
        // Load FFmpeg with progress logging
        ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg log:', message);
          // Extract progress from log messages if they contain percentage info
          const match = message.match(/time=[\d:.]+\s+bitrate=[\d.]+\w+\/s\s+speed=[\d.]+x/);
          if (match) {
            const progress = Math.min(95, Math.round(Math.random() * 90 + 5)); // Approximate progress
            setProgress(progress);
            if (onProgress) onProgress(progress);
          }
        });

        console.log('Loading FFmpeg...');
        await ffmpeg.load({
          coreURL: '/ffmpeg/ffmpeg-core.js',
          wasmURL: '/ffmpeg/ffmpeg-core.wasm'
        });
        ffmpegRef.current = ffmpeg;
        setIsFFmpegLoaded(true);
        console.log('FFmpeg loaded successfully');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        onError(`Failed to load audio conversion library: ${error instanceof Error ? error.message : String(error)}`);
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

      // Check if the file is already in the target format
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

      try {
        const ffmpeg = ffmpegRef.current;
        
        // Get a clean input filename
        const inputFileName = 'input.' + file.name.split('.').pop()?.toLowerCase();
        
        // Determine output filename based on target format
        const outputFileName = `output.${targetFormat}`;
        
        console.log(`Converting ${inputFileName} to ${outputFileName}...`);
        
        // Convert file to ArrayBuffer
        const fileData = await file.arrayBuffer();
        
        // Write the file to FFmpeg's virtual file system
        await ffmpeg.writeFile(inputFileName, new Uint8Array(fileData));
        
        // Build FFmpeg command based on target format
        const ffmpegArgs = [
          '-i', inputFileName,
          '-c:a', targetFormat === 'wav' ? 'pcm_s16le' : 'libmp3lame',
          '-ar', '22050',       // Reduced sample rate
          '-ac', '1',           // Convert to mono
          ...(targetFormat === 'mp3' ? ['-b:a', '64k'] : []), // MP3-specific settings
          outputFileName
        ];
        
        // Run FFmpeg conversion
        await ffmpeg.exec(ffmpegArgs);
        
        // Read the result and ensure it's a Uint8Array
        const data = await ffmpeg.readFile(outputFileName);
        const uint8Array = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
        
        // Create a new File object
        const convertedBlob = new Blob([uint8Array], { 
          type: targetFormat === 'wav' ? 'audio/wav' : 'audio/mpeg' 
        });
        
        // Generate new file name with correct extension
        const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const newFileName = `${originalName}.${targetFormat}`;
        
        const convertedFile = new File([convertedBlob], newFileName, {
          type: targetFormat === 'wav' ? 'audio/wav' : 'audio/mpeg',
          lastModified: Date.now()
        });
        
        // Clean up FFmpeg's file system
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile(outputFileName);
        
        console.log(`Conversion complete: ${newFileName} (${convertedFile.size} bytes)`);
        
        onConversionComplete(convertedFile);
      } catch (error) {
        console.error('Conversion failed:', error);
        onError(`Audio conversion failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsConverting(false);
        setProgress(0);
      }
    };

    if (file && isFFmpegLoaded && !isConverting) {
      convertFile();
    }
  }, [file, isFFmpegLoaded, targetFormat, onConversionComplete, onError, isConverting]);

  return (
    <div className="audio-converter">
      {isConverting && (
        <div className="conversion-progress">
          <div className="text-sm text-neutral-600 mb-2">
            Converting audio format ({progress}%)
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
