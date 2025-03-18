'use client';

// Use proper import syntax
import React, { useRef, useState, forwardRef, HTMLAttributes } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { motion, MotionProps } from 'framer-motion';

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

  // Handle file selection change
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileName(e.target.files[0].name);
      setError('');
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!inputFileRef.current?.files || inputFileRef.current.files.length === 0) {
      setError('Geen bestand geselecteerd');
      return;
    }

    const file = inputFileRef.current.files[0];
    
    // Check file type
    const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/m4a', 'audio/oga', 'audio/webm', 'video/mp4', 'video/webm'];
    const fileType = file.type;
    
    if (!validTypes.some(type => fileType.includes(type.split('/')[1]))) {
      setError('Ongeldig bestandsformaat. Upload een audio of video bestand.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      
      // Create FormData to send file
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-blob', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload mislukt');
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Call the callback with the blob data
      if (onFileUploaded) {
        onFileUploaded(data.blob);
      }
      
      // Reset filename after successful upload
      setFileName('');
      if (inputFileRef.current) {
        inputFileRef.current.value = '';
      }
      
    } catch (err) {
      console.error('Upload fout:', err);
      setError(err instanceof Error ? err.message : 'Upload mislukt');
    } finally {
      setUploading(false);
    }
  };

  // Trigger the hidden file input
  const triggerFileInput = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
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
      
      // Check if the file is an audio or video file
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        if (inputFileRef.current) {
          // Create a DataTransfer object to set the files on the input
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          inputFileRef.current.files = dataTransfer.files;
          
          // Set the filename and reset error
          setFileName(file.name);
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
      
      <MotionButton
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleUpload}
        disabled={!fileName || uploading}
        className={`mt-4 px-6 py-2 rounded-lg text-white font-medium flex items-center transition-all ${
          !fileName || uploading
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
            Uploaden...
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
  );
}