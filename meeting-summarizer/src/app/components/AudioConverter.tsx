// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { formatBytes } from '@/lib/audioChunker';

// Define custom FFmpeg types
interface FFmpegInstance extends FFmpeg {
  isLoaded: boolean;
}

// No need for a utility function, we'll handle the ArrayBuffer directly

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
                // For simplicity, we'll use a trick - we'll start at 5% and gradually increase
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
        const inputFileName = 'input.' + (fileExtension || 'mp4');
        
        // Determine output filename based on target format
        const outputFileName = `output.${targetFormat}`;
        
        console.log(`Converting ${inputFileName} (${formatBytes(file.size)}) to ${outputFileName}...`);
        
        // Convert file to ArrayBuffer and create a compatible Uint8Array
        const fileData = await file.arrayBuffer();

        // Get the raw function and call it directly to bypass TypeScript's type system completely
        const rawFFmpeg = ffmpeg as any;
        await rawFFmpeg.writeFile(inputFileName, new Uint8Array(fileData));
        
        // For very large files (>50MB), use more aggressive compression and segmentation
        // This ensures the API can process the audio files more reliably
        const ffmpegArgs = isLargeFile ? [
          '-i', inputFileName,
          '-vn',                       // No video
          '-c:a', 'libmp3lame',        // Use MP3 codec
          '-b:a', '48k',               // Lower bitrate (48kbps) for speech
          '-ac', '1',                  // Convert to mono
          '-ar', '16000',              // Lower sample rate (16kHz) for speech
          '-f', 'segment',             // Enable segmentation
          '-segment_time', '300',      // 5 minutes per segment
          '-reset_timestamps', '1',
          outputFileName.replace('.mp3', '_%03d.mp3') // Output pattern for segments
        ] : [
          '-i', inputFileName,
          '-vn',                       // No video
          '-c:a', targetFormat === 'wav' ? 'pcm_s16le' : 'libmp3lame',
          '-ar', '22050',              // Reduced sample rate
          '-ac', '1',                  // Convert to mono
          ...(targetFormat === 'mp3' ? ['-b:a', '64k'] : []), // MP3-specific settings
          outputFileName
        ];
        
        // Run FFmpeg conversion with appropriate args
        await ffmpeg.exec(ffmpegArgs);
        
        let combinedData = new Uint8Array(0);
        
        // For large files that were segmented, combine the segments
        if (isLargeFile && targetFormat === 'mp3') {
          let segmentIndex = 0;
          
          while (true) {
            try {
              const segmentName = outputFileName.replace('.mp3', `_${String(segmentIndex).padStart(3, '0')}.mp3`);
              const segmentData = await ffmpeg.readFile(segmentName);
              
              // Convert FileData to Uint8Array
              // Alternative approach with stronger type assertion
              const segmentUint8 = segmentData instanceof Uint8Array ? 
                (segmentData as unknown as Uint8Array) : 
                new TextEncoder().encode(segmentData as string);
              
              // Combine with existing data
              const newData = new Uint8Array(combinedData.length + segmentUint8.length);
              newData.set(combinedData);
              newData.set(segmentUint8, combinedData.length);
              combinedData = newData;
              
              // Clean up segment
              await ffmpeg.deleteFile(segmentName);
              segmentIndex++;
              
              // Update progress (allocate 95% of progress to conversion, 5% to combining)
              const combiningProgress = 95 + (segmentIndex * 5 / (segmentIndex + 1));
              setProgress(Math.min(99, Math.round(combiningProgress)));
              if (onProgress) onProgress(Math.min(99, Math.round(combiningProgress)));
            } catch (segmentError) {
              // No more segments (or error reading segments)
              console.log(`Processed ${segmentIndex} segments`);
              break;
            }
          }
        } else {
          // For regular files, just read the output
          const data = await ffmpeg.readFile(outputFileName);
          combinedData = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
        }
        
        // Create a new File object
        const convertedBlob = new Blob([combinedData], { 
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
        if (!isLargeFile) {
          await ffmpeg.deleteFile(outputFileName);
        }
        
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
