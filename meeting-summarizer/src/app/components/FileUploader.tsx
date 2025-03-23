'use client';

import React, { useRef, useState, forwardRef, HTMLAttributes } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { motion, MotionProps } from 'framer-motion';
import { upload } from '@vercel/blob/client';
import AudioConverter from './AudioConverter';

// Toggle to enable or disable FFmpeg conversion
const ENABLE_FFMPEG_CONVERSION = false; // Set to false to bypass FFmpeg completely

// Define motion button component with proper typing
type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & { 
  disabled?: boolean;
  onClick?: () => void;
};

const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

// Define the BlobFile interface inline to prevent import errors
interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  originalName: string;
}

interface FileUploaderProps {
  onFileUploaded: (blob: BlobFile) => void;
}

export default function FileUploader({ onFileUploaded }: FileUploaderProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isClientUpload, setIsClientUpload] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  
  // Define the threshold for server vs client uploads - use a smaller size to improve performance
  const SERVER_UPLOAD_LIMIT = 2 * 1024 * 1024; // 2MB (reduced from 4MB to avoid timeout issues)

  // Handle file selection change
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFileName(file.name);
      setSelectedFile(file);
      setError('');
    }
  };

  // Handle file upload
  const handleUpload = async (fileToUpload: File) => {
    if (!fileToUpload) {
      setError('Geen bestand geselecteerd');
      return;
    }

    // Create a comprehensive mapping of file extensions to valid MIME types
    const validMimeTypes = {
      // Common audio formats
      mp3: ['audio/mp3', 'audio/mpeg', 'audio/x-mpeg', 'audio/mpeg3'],
      wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
      ogg: ['audio/ogg', 'audio/x-ogg', 'audio/vorbis', 'audio/oga'],
      flac: ['audio/flac', 'audio/x-flac'],
      m4a: ['audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mp4', 'audio/x-mp4'],
      aac: ['audio/aac', 'audio/x-aac', 'audio/aacp'],
      webm: ['audio/webm'],
      // Video formats that contain audio
      mp4: ['video/mp4', 'video/x-mp4', 'application/mp4'],
      videoWebm: ['video/webm']
    };
    
    // Get file extension from name and MIME type
    const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || '';
    const fileType = fileToUpload.type.toLowerCase();
    
    // Check if the file is a valid audio or video type
    const isValidType = 
      // Check if it's a recognized audio/video MIME type
      fileType.startsWith('audio/') || fileType.startsWith('video/') ||
      // Check against our specific mappings
      Object.values(validMimeTypes).some(mimeTypes => 
        mimeTypes.includes(fileType)
      ) ||
      // Fallback to extension check if browsers report generic MIME types
      (fileExt && Object.keys(validMimeTypes).includes(fileExt));
    
    if (!isValidType) {
      setError('Ongeldig bestandsformaat. Upload een audio of video bestand.');
      return;
    }
    
    // Check file size (reduced from 500MB to 200MB limit for better Vercel performance)
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB in bytes
    if (fileToUpload.size > MAX_FILE_SIZE) {
      setError(`Bestand te groot (${(fileToUpload.size / (1024 * 1024)).toFixed(2)}MB). Maximale bestandsgrootte is 200MB.`);
      return;
    }

    try {
      setUploading(true);
      setError('');
      setUploadProgress(0);
      
      let blobData: BlobFile;
      
      // Create a unique name to prevent collisions
      const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      const safeFileName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${uniquePrefix}-${safeFileName}`;
      
      // Determine upload method based on file size
      if (fileToUpload.size <= SERVER_UPLOAD_LIMIT) {
        // Small file: Use server upload (faster, simpler)
        setIsClientUpload(false);
        
        // Create FormData to send file
        const formData = new FormData();
        formData.append('file', fileToUpload);
        
        const response = await fetch('/api/upload-blob', {
          method: 'POST',
          body: formData,
        });
        
        // First check if the response is OK before attempting to parse JSON
        if (!response.ok) {
          // Try to parse as JSON, but handle the case where it's not valid JSON
          try {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload mislukt');
          } catch (jsonError) {
            // If JSON parsing fails, use the status text or a generic message
            throw new Error(`Upload mislukt: ${response.status} ${response.statusText || 'Onbekende fout'}`);
          }
        }
        
        // Now parse the response as JSON, with error handling
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error('JSON parsing error:', jsonError);
          throw new Error('Kon serverrespons niet verwerken. Probeer het opnieuw.');
        }
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        blobData = data.blob;
      } else {
        // Large file: Use client upload with chunked progress tracking
        setIsClientUpload(true);
        
        // For very large files, we'll display a warning
        if (fileToUpload.size > 50 * 1024 * 1024) { // 50MB
          console.warn('Large file upload initiated, this may take some time');
        }
        
        // Direct browser-to-blob upload
        try {
          const blob = await upload(uniqueFileName, fileToUpload, {
            access: 'public',
            handleUploadUrl: '/api/client-upload',
            onUploadProgress: (progress) => {
              // Update UI with upload progress
              setUploadProgress(progress.percentage);
            }
            // Note: We've removed the maxRetries property here since it's not part of the type
          });
          
          // Create a compatible BlobFile object from the result
          blobData = {
            url: blob.url,
            pathname: blob.pathname,
            size: fileToUpload.size,
            contentType: fileToUpload.type,
            originalName: fileToUpload.name
          };
        } catch (uploadError) {
          console.error('Upload failed:', uploadError);
          // If direct upload fails, try with smaller chunk size - this is a fallback
          throw new Error(`Directe upload mislukt: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
        }
      }
      
      // Call the callback with the blob data
      if (onFileUploaded) {
        onFileUploaded(blobData);
      }
      
      // Reset state after successful upload
      setFileName('');
      setSelectedFile(null);
      setIsClientUpload(false);
      if (inputFileRef.current) {
        inputFileRef.current.value = '';
      }
      
    } catch (err) {
      console.error('Upload fout:', err);
      
      // Provide more detailed error messages
      if (err instanceof Error) {
        if (err.message.includes('413')) {
          setError('Bestand is te groot voor directe upload. Verwerk de 413 fout intern.');
        } else if (err.message.includes('network') || err.message.includes('connection')) {
          setError('Netwerkfout tijdens uploaden. Controleer je verbinding en probeer opnieuw.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Upload mislukt');
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle conversion complete
  const handleConversionComplete = (convertedFile: File) => {
    console.log(`Conversion complete: ${convertedFile.name} (${convertedFile.size} bytes)`);
    setIsConverting(false);
    setFileName(convertedFile.name);
    // Automatically start upload after conversion
    handleUpload(convertedFile);
  };

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

  // Start the upload or conversion process
  const startProcess = () => {
    if (!selectedFile) {
      setError('Geen bestand geselecteerd');
      return;
    }

    setError('');
    
    // If FFmpeg is disabled, upload directly
    if (!ENABLE_FFMPEG_CONVERSION) {
      handleUpload(selectedFile);
      return;
    }
    
    // Check if this is a format that needs conversion
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    
    // For larger files, we'll always try to convert to a more efficient format
    const shouldConvert = 
      // These formats definitely need conversion
      ['m4a', 'mp4', 'aac', 'flac', 'ogg', 'webm'].includes(fileExt) ||
      // For larger files, even MP3 should be optimized
      (fileExt === 'mp3' && selectedFile.size > 10 * 1024 * 1024) ||
      // For WAV, always convert as they're uncompressed
      fileExt === 'wav';
    
    if (shouldConvert) {
      // Set converting state
      setIsConverting(true);
      setConversionProgress(0);
      // Conversion will trigger upload automatically when complete
    } else {
      // For small MP3 files, proceed directly to upload
      handleUpload(selectedFile);
    }
  };

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
      
      // Check if the file is a valid audio or video type
      const isValidType = 
        // Check if it's a recognized audio/video MIME type
        fileType.startsWith('audio/') || fileType.startsWith('video/') ||
        // Check against our specific mappings
        Object.values(validMimeTypes).some(mimeTypes => 
          mimeTypes.includes(fileType)
        ) ||
        // Fallback to extension check if browsers report generic MIME types
        (fileExt && Object.keys(validMimeTypes).includes(fileExt));
        
      if (isValidType) {
        if (inputFileRef.current) {
          // Create a DataTransfer object to set the files on the input
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          inputFileRef.current.files = dataTransfer.files;
          
          // Set the filename and reset error
          setFileName(file.name);
          setSelectedFile(file);
          setError('');
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
          
          {fileName && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center">
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
              {fileName}
            </div>
          )}
          
          {error && (
            <div className="mt-3 p-2 bg-red-50 rounded-lg text-sm text-red-700">
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
        {/* Audio Converter Component - only renders when enabled and needed */}
        {isConverting && selectedFile && ENABLE_FFMPEG_CONVERSION && (
          <div className="mt-4">
            <AudioConverter
              file={selectedFile}
              onConversionComplete={handleConversionComplete}
              onError={handleConversionError}
              targetFormat="mp3" // Changed from wav to mp3 for more efficient file size
              onProgress={handleConversionProgress}
            />
          </div>
        )}
        
        {/* Upload Progress Bar */}
        {uploading && isClientUpload && (
          <div className="mt-4 w-full">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-center mt-1 text-neutral-500">
              {uploadProgress.toFixed(0)}% verwerkt
            </p>
          </div>
        )}
        
        {/* Upload/Convert Button */}
        <MotionButton
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={startProcess}
          disabled={!fileName || uploading || isConverting}
          className={`mt-4 px-6 py-2 rounded-lg text-white font-medium flex items-center transition-all w-full justify-center ${
            !fileName || uploading || isConverting
              ? 'bg-neutral-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-md'
          }`}
        >
          {uploading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isClientUpload ? 'Direct uploaden naar Vercel Blob...' : 'Uploaden...'}
            </>
          ) : isConverting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Bestand converteren naar MP3... ({conversionProgress}%)
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Bestand uploaden
            </>
          )}
        </MotionButton>
      </div>
    </div>
  );
}