'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline';

interface FileUploaderProps {
  onFileUploaded: (file: File) => void;
}

export default function FileUploader({ onFileUploaded }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    // Check if file is audio
    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file.');
      return;
    }
    
    setFileName(file.name);
    onFileUploaded(file);
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800">Upload Meeting Recording</h2>
      
      <div 
        className={`w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <DocumentArrowUpIcon className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">
          Drag and drop or click to upload
        </p>
        {fileName && (
          <p className="mt-2 text-sm text-blue-500 font-medium">{fileName}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="audio/*"
          onChange={handleChange}
        />
      </div>
      
      <p className="text-xs text-gray-400">
        Supported formats: MP3, WAV, M4A, FLAC (Max 25MB)
      </p>
    </div>
  );
}