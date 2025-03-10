'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline';

interface BlobFile {
  url: string;
  size: number;
  contentType: string;
  originalName: string;
}

interface FileUploaderProps {
  onFileUploaded: (file: BlobFile) => void;
}

export default function FileUploader({ onFileUploaded }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lijst van ondersteunde formaten
  const supportedFormats = ['mp3', 'mp4', 'wav', 'm4a', 'flac', 'ogg', 'webm'];

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFile(file);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFile(file);
    }
  };

  const handleFile = async (file: File) => {
    // Bestandsextensie controleren
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    if (!fileExt || !validExtensions.includes(fileExt)) {
      setError(`Ongeldig bestandsformaat. Ondersteunde formaten: ${supportedFormats.join(', ')}`);
      return;
    }

    // Upload het bestand naar Vercel Blob
    try {
      setIsUploading(true);
      setFileName(file.name);
      
      // Upload simulatie voor grote bestanden
      const fileSizeMB = file.size / (1024 * 1024);
      console.log(`Uploading ${file.name} (${fileSizeMB.toFixed(2)}MB) naar Vercel Blob`);
      
      // Progress simulatie voor grote bestanden
      const simulateProgress = () => {
        const interval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 95) {
              clearInterval(interval);
              return prev;
            }
            return prev + 5;
          });
        }, 300);
        return interval;
      };
      
      const progressInterval = simulateProgress();
      
      // Formulier aanmaken voor upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Uploaden naar onze Vercel Blob upload route
      const response = await fetch('/api/upload-blob', {
        method: 'POST',
        body: formData,
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload mislukt');
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Geef de blob gegevens terug aan de parent component
      onFileUploaded(data.blob);
      
    } catch (error) {
      console.error("Fout bij uploaden naar Vercel Blob:", error);
      setError(error instanceof Error ? error.message : 'Upload mislukt');
      setFileName('');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearFile = () => {
    setFileName('');
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800">Vergaderopname Uploaden</h2>
      
      <div 
        className={`w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors relative overflow-hidden ${
          dragActive ? 'border-blue-500 bg-blue-50' : 
          isUploading ? 'border-blue-300' : 
          error ? 'border-red-300' : 'border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}
      >
        {isUploading && (
          <div 
            className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all" 
            style={{ width: `${uploadProgress}%` }}
          />
        )}
        
        <DocumentArrowUpIcon className={`h-8 w-8 ${
          isUploading ? 'text-blue-400' : 
          error ? 'text-red-400' : 'text-gray-400'
        } mb-2`} />
        
        {isUploading ? (
          <div className="flex flex-col items-center">
            <p className="text-sm text-blue-600 font-medium">{fileName}</p>
            <p className="text-xs text-gray-500 mt-1">
              Uploaden... {uploadProgress}%
            </p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center">
            <p className="text-sm text-blue-600 font-medium">{fileName}</p>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }} 
              className="mt-1 text-xs text-gray-500 hover:text-red-500"
            >
              Verwijderen
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Sleep bestanden hierheen of klik om te uploaden
          </p>
        )}
        
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="audio/*,video/mp4"
          onChange={handleChange}
          disabled={isUploading}
        />
      </div>
      
      {error && (
        <div className="w-full text-sm text-red-600 bg-red-50 p-2 rounded-md">
          {error}
        </div>
      )}
      
      <div className="flex flex-wrap gap-1 justify-center">
        {supportedFormats.map((format, index) => (
          <span key={index} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
            {format.toUpperCase()}
          </span>
        ))}
      </div>
      
      <p className="text-xs text-gray-400">
        Grote bestanden worden ondersteund! MP4-videobestanden worden ook verwerkt (alleen het audiospoor)
      </p>
    </div>
  );
}