'use client';

import { useState, useEffect, useRef } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// Define types for ffmpeg instance
interface FFmpegInstance {
  load: () => Promise<void>;
  isLoaded: () => boolean;
  run: (...args: string[]) => Promise<void>;
  FS: (method: string, ...args: any[]) => any;
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
        // Create FFmpeg instance with logging
        const ffmpeg = createFFmpeg({
          log: true,
          progress: (progressData) => {
            // FFmpeg reports progress between 0-1
            const calculatedProgress = Math.round(progressData.ratio * 100);
            setProgress(calculatedProgress);
            if (onProgress) onProgress(calculatedProgress);
          },
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        }) as FFmpegInstance;
        
        console.log('Loading FFmpeg...');
        await ffmpeg.load();
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
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
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
        
        // Write the file to FFmpeg's virtual file system
        ffmpeg.FS('writeFile', inputFileName, await fetchFile(file));
        
        // Build FFmpeg command based on target format
        let ffmpegArgs: string[];
        
        if (targetFormat === 'wav') {
          // More optimized WAV conversion settings to reduce file size while maintaining quality
          ffmpegArgs = [
            '-i', inputFileName,
            '-c:a', 'pcm_s16le',  // 16-bit PCM audio codec
            '-ar', '22050',       // Reduced sample rate from 44100 to 22050 Hz
            '-ac', '1',           // Convert to mono (1 channel) instead of stereo
            outputFileName
          ];
        } else if (targetFormat === 'mp3') {
          // Optimized MP3 settings for speech/meeting audio
          ffmpegArgs = [
            '-i', inputFileName,
            '-c:a', 'libmp3lame', // MP3 codec
            '-b:a', '64k',        // Lower bitrate for speech (64kbps instead of 192k)
            '-ac', '1',           // Convert to mono
            '-ar', '22050',       // Lower sample rate
            outputFileName
          ];
        } else {
          throw new Error(`Unsupported target format: ${targetFormat}`);
        }
        
        // Run FFmpeg conversion
        await ffmpeg.run(...ffmpegArgs);
        
        // Read the result
        const data = ffmpeg.FS('readFile', outputFileName);
        
        // Create a new File object
        const convertedBlob = new Blob([data.buffer], { 
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
        ffmpeg.FS('unlink', inputFileName);
        ffmpeg.FS('unlink', outputFileName);
        
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