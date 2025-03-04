// src/app/components/AudioRecorder.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { AudioRecorder, useAudioRecorder } from 'react-audio-voice-recorder';
import { motion } from 'framer-motion';

interface AudioRecorderProps {
  onAudioRecorded: (file: File) => void;
}

export default function RecordAudio({ onAudioRecorded }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use the hook from the library
  const recorderControls = useAudioRecorder();
  
  // Monitor recording state changes
  useEffect(() => {
    if (recorderControls.isRecording && !isRecording) {
      startRecording();
    } else if (!recorderControls.isRecording && isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [recorderControls.isRecording, isRecording]);

  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const addAudioElement = async (blob: Blob) => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Format as .wav file
    const file = new File([blob], 'recording.wav', { type: 'audio/wav' });
    onAudioRecorded(file);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800">Record Meeting</h2>
      
      <div className="relative">
        <motion.div
          animate={isRecording ? {
            scale: [1, 1.1, 1],
            opacity: [1, 0.8, 1],
          } : {}}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute -inset-3 bg-red-100 rounded-full z-0"
          style={{ display: isRecording ? 'block' : 'none' }}
        />
        
        <div className="relative z-10">
          <AudioRecorder 
            onRecordingComplete={addAudioElement}
            recorderControls={recorderControls}
            classes={{
              AudioRecorderClass: "!w-16 !h-16 !bg-gradient-to-r !from-blue-500 !to-purple-600 rounded-full flex items-center justify-center cursor-pointer hover:shadow-lg transition-all",
              AudioRecorderStartSaveClass: "",
            }}
          />
        </div>
      </div>
      
      {isRecording && (
        <div className="flex items-center text-red-500 font-medium animate-pulse">
          <span className="mr-2 h-2 w-2 bg-red-500 rounded-full inline-block"></span>
          Recording {formatTime(recordingTime)}
        </div>
      )}
      
      <p className="text-sm text-gray-500 mt-2">
        Click to {isRecording ? 'stop' : 'start'} recording
      </p>
    </div>
  );
}