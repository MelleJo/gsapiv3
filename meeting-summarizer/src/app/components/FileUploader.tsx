// @ts-nocheck
'use client';

import React, { useRef, useState, forwardRef, HTMLAttributes, useEffect } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { motion, MotionProps } from 'framer-motion';
import { upload } from '@vercel/blob/client'; // Import the upload function
import AudioConverter from './AudioConverter'; // Assuming path is correct
import { formatBytes } from '@/lib/enhancedAudioChunker'; // Ensure path is correct
import { type PutBlobResult } from '@vercel/blob'; // Import PutBlobResult

// Toggle to enable or disable FFmpeg conversion
const ENABLE_FFMPEG_CONVERSION = true;

// Define BlobFile interface matching the backend response and expected prop type
export interface BlobFile { // Export interface if used elsewhere
  url: string;           // This will be the download URL
  pathname: string;      // Path within the blob store
  size: number;
  contentType: string;
  originalName: string;
}

// Define motion button component with proper typing
type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & {
  disabled?: boolean;
  onClick?: () => void;
};

const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

interface FileUploaderProps {
  // Modified: Expects PutBlobResult now, let's rename to reflect Vercel Blob structure
  onFileUploadComplete: (blob: PutBlobResult) => void; // Renamed prop
  // Keep other props if needed, but remove transcription-specific ones handled by page.tsx
  // onTranscriptionStart?: () => void; // Remove
  // onTranscriptionComplete?: (transcription: string) => void; // Remove
  // onTranscriptionError?: (error: string) => void; // Remove
  // onTranscriptionProgress?: (progress: number, status: string) => void; // Remove
  // onTranscriptionStatusUpdate?: (status: { ... }) => void; // Remove
  // transcriptionModel?: string; // Remove (will be passed to backend later)
}

export default function FileUploader({
  onFileUploadComplete, // Use the renamed prop
}: FileUploaderProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false); // Tracks Blob upload state
  const [uploadProgress, setUploadProgress] = useState<number>(0); // Tracks Blob upload progress (0-100)
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>(''); // General status message
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [convertedFile, setConvertedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  // const [isTranscribing, setIsTranscribing] = useState<boolean>(false); // Remove transcription state
  const [fileInfo, setFileInfo] = useState<{
    size: string;
    duration: string;
    format: string;
  } | null>(null);

  // Reset state when selected file changes
  useEffect(() => {
      setConvertedFile(null);
      setIsConverting(false);
      setConversionProgress(0);
      setUploading(false);
      setUploadProgress(0);
      setStatusMessage('');
      // Keep setError('') within handleFileChange/handleDrop
  }, [selectedFile]);


  // Handle file selection change
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processSelectedFile(file);
    }
  };

  // Process a selected or dropped file
  const processSelectedFile = (file: File) => {
    setFileName(file.name);
    setSelectedFile(file);
    setError(''); // Reset error on new file selection

    // Display file information
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const fileSizeStr = formatBytes(file.size);

    let estimatedDuration = "Onbekend";
    if (file.size) {
      const durationMinutes = Math.round(file.size / (1024 * 1024)); // Rough estimate
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

    // Display warning for large files (handled during conversion/upload now)
    // Reset conversion/upload state
    setConvertedFile(null);
    setIsConverting(false);
    setConversionProgress(0);
    setUploading(false);
    setUploadProgress(0);
    setStatusMessage('');
  };

  // Handle conversion complete
  const handleConversionComplete = (resultFile: File) => {
    console.log(`Conversion complete: ${resultFile.name} (${formatBytes(resultFile.size)})`);
    setIsConverting(false);
    setFileName(resultFile.name); // Update filename to reflect conversion
    setConvertedFile(resultFile);

    // Update file info after conversion
    setFileInfo(prev => prev ? { ...prev, format: 'MP3', size: formatBytes(resultFile.size) } : prev);

    // Immediately trigger the upload process with the converted file
    uploadToBlob(resultFile);
  };

  // Handle conversion error
  const handleConversionError = (errorMessage: string) => {
    setIsConverting(false);
    setError(`Conversie fout: ${errorMessage}`);
    setStatusMessage('Conversie mislukt.');
  };

  // Handle conversion progress
  const handleConversionProgress = (progress: number) => {
    setConversionProgress(progress);
    setStatusMessage(`Audio converteren... (${progress}%)`);
  };

  // Trigger the hidden file input
  const triggerFileInput = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
    }
  };

  // Function to upload the file to Vercel Blob
  const uploadToBlob = async (fileToUpload: File) => {
    if (!fileToUpload) {
      setError('Geen bestand beschikbaar om te uploaden.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setStatusMessage('Voorbereiden voor upload...');
    setError('');

    try {
      // 1. Get the upload URL from our backend
      setStatusMessage(`Uploaden naar cloud opslag (${formatBytes(fileToUpload.size)})...`);

      const newBlob = await upload(
        fileToUpload.name, // Pass filename
        fileToUpload,      // Pass file object
        {
          access: 'public', // Set access level
          handleUploadUrl: '/api/upload-blob', // Backend endpoint
          // Optional: Pass clientPayload if needed by backend
          // clientPayload: JSON.stringify({ customData: 'example' }),
          onUploadProgress: (progress) => {
            setUploadProgress(progress);
            setStatusMessage(`Uploaden... (${progress}%)`);
          },
        }
      );

      console.log('✅ Upload naar Vercel Blob voltooid:', newBlob);
      setStatusMessage('Upload voltooid!');
      onFileUploadComplete(newBlob); // Pass the result from upload()

    } catch (err: any) {
      console.error('Fout tijdens upload proces:', err);
      // Use the error message from the upload function if available
      setError(`Fout: ${err.message || 'Onbekende uploadfout'}`);
      setStatusMessage('Upload mislukt.');
      setUploading(false);
    }
  };


  // Start the overall process (conversion or direct upload)
  const startProcess = () => {
    if (!selectedFile) {
      setError('Geen bestand geselecteerd');
      return;
    }

    setError('');
    setStatusMessage(''); // Clear previous status

    const fileToProcess = selectedFile;
    const fileExt = fileToProcess.name.split('.').pop()?.toLowerCase() || '';

    // Check if we should convert this file
    const needsConversion =
      ENABLE_FFMPEG_CONVERSION &&
      (fileExt !== 'mp3' || fileToProcess.size > 20 * 1024 * 1024); // Convert non-mp3 or large mp3

    if (needsConversion) {
      // Start conversion - upload will be triggered by handleConversionComplete
      console.log('Starting conversion process...');
      setIsConverting(true);
      setConversionProgress(0);
      setStatusMessage('Starten conversie...');
      // The AudioConverter component will be rendered and start processing via useEffect
    } else {
      // No conversion needed, start upload directly
      console.log('Skipping conversion, starting upload directly...');
      uploadToBlob(fileToProcess);
    }
  };


  // Handle drag events (no changes needed here)
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { /* ... */ };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { /* ... */ };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { /* ... */ };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      // Simple validation - check if it looks like audio/video
       const fileType = file.type.toLowerCase();
       const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
       const isValid = fileType.startsWith('audio/') || fileType.startsWith('video/') || ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'avi', 'webm', 'flac', 'ogg'].includes(fileExt);

      if (isValid) {
        if (inputFileRef.current) {
          // Update input files (good practice)
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          inputFileRef.current.files = dataTransfer.files;
        }
        // Process the dropped file
        processSelectedFile(file);
      } else {
        setError('Ongeldig bestandsformaat. Upload een audio of video bestand.');
        setFileInfo(null);
        setFileName('');
        setSelectedFile(null);
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
        {/* Inner content: Icon, text, file info (no changes needed) */}
        <div className="flex flex-col items-center justify-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-neutral-400"
            viewBox="0 0 24 24" /* Icon details */>
            {/* SVG Path data */}
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
          {fileInfo && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex flex-col w-full">
              <div className="flex items-center mb-1">
                <svg /* Mic icon */>
                   <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                   <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                   <line x1="12" x2="12" y1="19" y2="22"></line>
                </svg>
                <span className="font-medium truncate ml-2">{fileName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pl-6">
                <div><span className="text-blue-500">Formaat:</span> {fileInfo.format}</div>
                <div><span className="text-blue-500">Grootte:</span> {fileInfo.size}</div>
                <div><span className="text-blue-500">Duur:</span> {fileInfo.duration}</div>
              </div>
            </div>
          )}
          {statusMessage && !error && (
              <div className="mt-3 text-sm text-neutral-600">{statusMessage}</div>
          )}
          {error && (
            <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded-lg text-sm text-yellow-800 w-full">
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
        {/* Audio Converter Component - Render conditionally based on isConverting state */}
        {isConverting && selectedFile && ENABLE_FFMPEG_CONVERSION && (
          <div className="mt-4">
            <AudioConverter
              file={selectedFile}
              onConversionComplete={handleConversionComplete}
              onError={handleConversionError}
              targetFormat="mp3" // Always convert to MP3
              onProgress={handleConversionProgress} // Pass progress handler
            />
          </div>
        )}

        {/* Upload Progress Bar - Render conditionally based on uploading state */}
        {uploading && (
          <div className="mt-4">
            <div className="text-sm text-neutral-600 mb-2">{statusMessage}</div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-100 ease-linear"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
          </div>
        )}

        {/* Process Button */}
        <MotionButton
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={startProcess}
          disabled={!selectedFile || isConverting || uploading} // Disable during conversion or upload
          className={`mt-4 px-6 py-2 rounded-lg text-white font-medium flex items-center transition-all w-full justify-center ${
            !selectedFile || isConverting || uploading
              ? 'bg-neutral-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-md'
          }`}
        >
          {isConverting ? (
            <>
              <svg /* Spinner */ className="animate-spin -ml-1 mr-2 h-4 w-4 text-white">...</svg>
              Audio converteren... ({conversionProgress}%)
            </>
          ) : uploading ? (
             <>
              <svg /* Spinner */ className="animate-spin -ml-1 mr-2 h-4 w-4 text-white">...</svg>
              Uploaden... ({uploadProgress}%)
             </>
          ) : (
            <>
              <svg /* Check icon */ className="h-4 w-4 mr-2" >...</svg>
              Start Verwerking
            </>
          )}
        </MotionButton>
      </div>
    </div>
  );
}
