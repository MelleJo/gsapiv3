// @ts-nocheck
'use client';

import React, { useRef, useState, useEffect } from 'react'; // Removed forwardRef, HTMLAttributes
import type { ChangeEvent, DragEvent } from 'react';
// Removed motion import
import { upload } from '@vercel/blob/client';
import { Button } from "@/components/ui/button"; // Import Shadcn Button
import { Progress } from "@/components/ui/progress"; // Import Shadcn Progress
import { UploadCloud, FileAudio, Clock, Info, Loader2, CheckCircle } from 'lucide-react'; // Import icons
import AudioConverter from './AudioConverter';
import { formatBytes } from '@/lib/enhancedAudioChunker';
import { type PutBlobResult } from '@vercel/blob'; // Import PutBlobResult
import { cn } from "@/lib/utils"; // Import the missing cn utility

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

// Removed MotionButton definition

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
          onUploadProgress: (progressStatus) => {
            // Extract percentage from the progress status object
            const percentage = progressStatus.percentage;
            setUploadProgress(percentage);
            setStatusMessage(`Uploaden... (${percentage}%)`);
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
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }; // Necessary to allow drop

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
      {/* Updated dropzone styles for glass theme */}
      <div
        className={cn(
          "w-full rounded-xl p-6 text-center cursor-pointer transition-colors border border-white/20 bg-white/5", // Subtle bg and border
          isDragging
            ? 'bg-white/10 ring-2 ring-white/50' // Highlight on drag
            : 'hover:bg-white/10' // Hover effect
        )}
        onClick={triggerFileInput}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Inner content: Adjusted text colors for light text */}
        <div className="flex flex-col items-center justify-center gap-2 text-center text-white">
          <UploadCloud className={`h-12 w-12 transition-colors ${isDragging ? 'text-white' : 'text-white/70'}`} />
          <h3 className="text-lg font-medium">
            Sleep een audiobestand hierheen
          </h3>
          <p className="text-sm text-white/60 mb-2">
            of <span className="text-white font-medium">klik om te bladeren</span>
          </p>
          <p className="text-xs text-white/50">
            Ondersteunde bestanden: MP3, WAV, M4A, MP4, etc.
          </p>
          {/* File info display adjustments */}
          {fileInfo && (
            <div className="mt-3 p-3 bg-black/20 rounded-lg text-sm text-white/90 flex flex-col w-full text-left border border-white/10">
              <div className="flex items-center mb-1 font-medium">
                <FileAudio className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{fileName}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pl-6">
                {/* Adjusted muted text color */}
                <div><span className="text-white/60">Formaat:</span> {fileInfo.format}</div>
                <div><span className="text-white/60">Grootte:</span> {fileInfo.size}</div>
                <div><span className="text-white/60">Duur:</span> {fileInfo.duration}</div>
              </div>
            </div>
          )}
          {/* Combined Status/Error Display */}
          {(statusMessage || error) && (
            <div className={`mt-3 p-2 rounded-lg text-sm w-full ${
              error
                ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                : 'bg-info/10 border border-info/30 text-info-foreground' // Assuming info color vars exist
            }`}>
              {error || statusMessage}
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

        {/* Upload/Conversion Progress Bar */}
        {(uploading || isConverting) && (
          <div className="mt-4 w-full">
            <div className="text-sm text-muted-foreground mb-1 text-center">{statusMessage}</div>
            <Progress value={uploading ? uploadProgress : conversionProgress} className="w-full h-2" />
          </div>
        )}

        {/* Process Button */}
        <Button
          onClick={startProcess}
          disabled={!selectedFile || isConverting || uploading}
          className="mt-4 w-full"
          size="lg" // Make button larger
        >
          {isConverting ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
              Converteren... ({conversionProgress}%)
            </>
          ) : uploading ? (
             <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
              Uploaden... ({uploadProgress}%)
             </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Start Verwerking
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
