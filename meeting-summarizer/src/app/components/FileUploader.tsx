'use client';

import React, { useRef, useState, forwardRef, HTMLAttributes, useEffect } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { motion, MotionProps } from 'framer-motion';
import AudioConverter from './AudioConverter';
import EnhancedTranscriber from './EnhancedTranscriber';
import { formatBytes } from '@/lib/enhancedAudioChunker';

// Toggle to enable or disable FFmpeg conversion
const ENABLE_FFMPEG_CONVERSION = true;

// Define motion button component with proper typing
type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & { 
  disabled?: boolean;
  onClick?: () => void;
};

const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

// Define the BlobFile interface inline for completeness
interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  originalName: string;
}

interface FileUploaderProps {
  onFileUploaded: (blob: BlobFile) => void;
  onTranscriptionStart?: () => void;
  onTranscriptionComplete?: (transcription: string) => void;
  onTranscriptionError?: (error: string) => void;
  onTranscriptionProgress?: (progress: number, status: string) => void;
  onTranscriptionStatusUpdate?: (status: {
    stage: string;
    currentChunk?: number;
    totalChunks?: number;
    message?: string;
  }) => void;
  transcriptionModel?: string;
}

export default function FileUploader({ 
  onFileUploaded, 
  onTranscriptionStart,
  onTranscriptionComplete,
  onTranscriptionError,
  onTranscriptionProgress,
  onTranscriptionStatusUpdate,
  transcriptionModel = 'whisper-1'
}: FileUploaderProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [convertedFile, setConvertedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [fileInfo, setFileInfo] = useState<{
    size: string;
    duration: string;
    format: string;
  } | null>(null);
  
  // Handle file selection change
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFileName(file.name);
      setSelectedFile(file);
      setError('');
      
      // Display file information
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const fileSizeStr = formatBytes(file.size);
      
      // Estimate duration roughly based on file size and format
      let estimatedDuration = "Onbekend";
      
      // Very rough estimate: 1MB ≈ 1 minute for compressed audio
      if (file.size) {
        const durationMinutes = Math.round(file.size / (1024 * 1024));
        
        if (durationMinutes < 60) {
          estimatedDuration = `~${durationMinutes} ${durationMinutes === 1 ? 'minuut' : 'minuten'}`;
        } else {
          const hours = Math.floor(durationMinutes / 60);
          const mins = durationMinutes % 60;
          estimatedDuration = `~${hours} ${hours === 1 ? 'uur' : 'uren'}${mins > 0 ? ` ${mins} ${mins === 1 ? 'minuut' : 'minuten'}` : ''}`;
        }
      }
      
      setFileInfo({
        size: fileSizeStr,
        duration: estimatedDuration,
        format: fileExt.toUpperCase()
      });
      
      // Display warning for large files
      if (file.size > 100 * 1024 * 1024) {
        setError('Let op: dit bestand is erg groot. De verwerking wordt opgedeeld in meerdere delen.');
      }
    }
  };

  // Handle conversion complete
  // In FileUploader.tsx, update handleConversionComplete:

// Handle conversion complete
const handleConversionComplete = (convertedFile: File) => {
  console.log(`Conversion complete: ${convertedFile.name} (${formatBytes(convertedFile.size)})`);
  setIsConverting(false);
  setFileName(convertedFile.name);
  setConvertedFile(convertedFile);
  
  // Update file info after conversion
  setFileInfo(prev => {
    if (prev) {
      return {
        ...prev,
        format: 'MP3', // Always MP3 after conversion
        size: formatBytes(convertedFile.size)
      };
    }
    return prev;
  });
  
  // IMPORTANT: Start transcription immediately after conversion
  setIsTranscribing(true);
  
  // Notify parent that transcription is starting
  if (onTranscriptionStart) {
    onTranscriptionStart();
  }
}

  // Handle conversion error
  const handleConversionError = (errorMessage: string) => {
    setIsConverting(false);
    setError(errorMessage);
  };

  // Handle conversion progress
  const handleConversionProgress = (progress: number) => {
    setConversionProgress(progress);
  };

  // Trigger the hidden file input
  const triggerFileInput = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
    }
  };

  // Handle transcription completion
  const handleTranscriptionComplete = (transcription: string) => {
    setIsTranscribing(false);
    
    // Forward the transcription to the parent component if provided
    if (onTranscriptionComplete) {
      onTranscriptionComplete(transcription);
    }
  };

  // Handle transcription error
  const handleTranscriptionError = (error: string) => {
    setIsTranscribing(false);
    setError(`Transcriptie fout: ${error}`);
    
    // Forward the error to the parent component if provided
    if (onTranscriptionError) {
      onTranscriptionError(error);
    }
  };

// Replace the current startProcess function in FileUploader.tsx with this:

// Start the transcription and processing flow
// Replace the current startProcess function in FileUploader.tsx with this:

// Start the transcription and processing flow
const startProcess = () => {
  if (!selectedFile && !convertedFile) {
    setError('Geen bestand geselecteerd');
    return;
  }

  setError('');
  
  // Get file to process
  const fileToProcess = convertedFile || selectedFile;
  if (!fileToProcess) return;
  
  const fileExt = fileToProcess.name.split('.').pop()?.toLowerCase() || '';
  
  // Check if we should convert this file
  const needsConversion = 
    ENABLE_FFMPEG_CONVERSION && 
    // Always convert non-MP3 files
    (fileExt !== 'mp3' || 
     // Also convert large MP3 files for optimization
     (fileExt === 'mp3' && fileToProcess.size > 20 * 1024 * 1024));
  
  if (needsConversion && !convertedFile) {
    setIsConverting(true);
    setConversionProgress(0);
  } else {
    // Start transcription process using enhanced transcriber directly
    // without Vercel Blob upload step
    setIsTranscribing(true);
    
    // Notify parent that transcription is starting
    if (onTranscriptionStart) {
      onTranscriptionStart();
    }
  }
}

  // Handle drag events
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Use the same validation logic as handleUpload
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const fileType = file.type.toLowerCase();
      
      // Create a comprehensive mapping of file extensions to valid MIME types
      const validMimeTypes = {
        mp3: ['audio/mp3', 'audio/mpeg', 'audio/x-mpeg', 'audio/mpeg3'],
        wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
        ogg: ['audio/ogg', 'audio/x-ogg', 'audio/vorbis', 'audio/oga'],
        flac: ['audio/flac', 'audio/x-flac'],
        m4a: ['audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mp4', 'audio/x-mp4'],
        aac: ['audio/aac', 'audio/x-aac', 'audio/aacp'],
        webm: ['audio/webm'],
        mp4: ['video/mp4', 'video/x-mp4', 'application/mp4'],
        videoWebm: ['video/webm']
      };
      
      // Valid extensions list
      const validExtensions = Object.keys(validMimeTypes);
      
      // Check if the file is a valid audio or video type
      const isValidType = 
        // Check if it's a recognized audio/video MIME type
        fileType.startsWith('audio/') || fileType.startsWith('video/') ||
        // Check against our specific mappings
        Object.values(validMimeTypes).some(mimeTypes => 
          mimeTypes.includes(fileType)
        ) ||
        // Fallback to extension check if browsers report generic MIME types
        (fileExt && validExtensions.includes(fileExt));
        
      if (isValidType) {
        if (inputFileRef.current) {
          // Create a DataTransfer object to set the files on the input
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          inputFileRef.current.files = dataTransfer.files;
          
          // Set the filename and reset error
          setFileName(file.name);
          setSelectedFile(file);
          setConvertedFile(null); // Reset converted file when new file is selected
          setError('');
          
          // Display file information
          const fileSizeStr = formatBytes(file.size);
          let estimatedDuration = "Onbekend";
          
          // Estimate duration based on file size
          if (file.size) {
            const durationMinutes = Math.round(file.size / (1024 * 1024));
            
            if (durationMinutes < 60) {
              estimatedDuration = `~${durationMinutes} ${durationMinutes === 1 ? 'minuut' : 'minuten'}`;
            } else {
              const hours = Math.floor(durationMinutes / 60);
              const mins = durationMinutes % 60;
              estimatedDuration = `~${hours} ${hours === 1 ? 'uur' : 'uren'}${mins > 0 ? ` ${mins} ${mins === 1 ? 'minuut' : 'minuten'}` : ''}`;
            }
          }
          
          setFileInfo({
            size: fileSizeStr,
            duration: estimatedDuration,
            format: fileExt.toUpperCase()
          });
          
          // Display warning for large files
          if (file.size > 100 * 1024 * 1024) {
            setError('Let op: dit bestand is erg groot. De verwerking wordt opgedeeld in meerdere delen.');
          }
        }
      } else {
        setError('Ongeldig bestandsformaat. Upload een audio of video bestand.');
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div 
        className={`w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-neutral-300 hover:border-blue-400 hover:bg-neutral-50'
        }`}
        onClick={triggerFileInput}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-10 w-10 text-neutral-400"
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          
          <h3 className="text-lg font-medium text-neutral-700">
            Sleep een audiobestand hierheen
          </h3>
          
          <p className="text-sm text-neutral-500 mb-2">
            of <span className="text-blue-600 font-medium">klik om te bladeren</span>
          </p>
          
          <p className="text-xs text-neutral-400">
            Ondersteunde bestanden: MP3, WAV, FLAC, OGG, M4A, MP4, etc.
          </p>
          
          {/* Display file information if a file is selected */}
          {fileInfo && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex flex-col">
              <div className="flex items-center mb-1">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 mr-2" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" x2="12" y1="19" y2="22"></line>
                </svg>
                <span className="font-medium">{fileName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pl-6">
                <div><span className="text-blue-500">Formaat:</span> {fileInfo.format}</div>
                <div><span className="text-blue-500">Grootte:</span> {fileInfo.size}</div>
                <div><span className="text-blue-500">Duur:</span> {fileInfo.duration}</div>
              </div>
            </div>
          )}
          
          {error && (
            <div className="mt-3 p-2 bg-yellow-50 rounded-lg text-sm text-yellow-700">
              {error}
            </div>
          )}
        </div>

        <input 
          type="file" 
          ref={inputFileRef}
          className="hidden" 
          accept="audio/*,video/*" 
          onChange={handleFileChange}
        />
      </div>
      
      <div className="w-full">
        {/* Audio Converter Component - only renders when needed */}
        {isConverting && selectedFile && ENABLE_FFMPEG_CONVERSION && (
          <div className="mt-4">
            <AudioConverter
              file={selectedFile}
              onConversionComplete={handleConversionComplete}
              onError={handleConversionError}
              targetFormat="mp3"
              onProgress={handleConversionProgress}
            />
          </div>
        )}
        
        {/* Enhanced Transcriber Component */}
        {isTranscribing && (fileToProcess => {
          if (fileToProcess) {
            return (
              <div className="mt-4">
                <EnhancedTranscriber
                  audioFile={fileToProcess}
                  onTranscriptionComplete={handleTranscriptionComplete}
                  onError={handleTranscriptionError}
                  onProgress={onTranscriptionProgress}
                  onStatusUpdate={onTranscriptionStatusUpdate}
                  model={transcriptionModel}
                />
              </div>
            );
          }
          return null;
        })(convertedFile || selectedFile)}
        
        {/* Process Button */}
        <MotionButton
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={startProcess}
          disabled={!fileName || isConverting || isTranscribing}
          className={`mt-4 px-6 py-2 rounded-lg text-white font-medium flex items-center transition-all w-full justify-center ${
            !fileName || isConverting || isTranscribing
              ? 'bg-neutral-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-md'
          }`}
        >
          {isConverting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Audio converteren... ({conversionProgress}%)
            </>
          ) : isTranscribing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Transcriberen...
            </>
          ) : (
            <>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-4 w-4 mr-2" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Start Verwerking
            </>
          )}
        </MotionButton>
      </div>
    </div>
  );
}