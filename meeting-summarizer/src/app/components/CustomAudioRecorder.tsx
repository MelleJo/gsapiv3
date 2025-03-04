'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CustomAudioRecorderProps {
  onAudioRecorded: (file: File) => void;
}

export default function CustomAudioRecorder({ onAudioRecorded }: CustomAudioRecorderProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        
        // Release microphone
        stream.getTracks().forEach(track => track.stop());
        
        onAudioRecorded(audioFile);
      };
      
      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Failed to access microphone. Please make sure you have granted permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
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
        
        <button
          onClick={toggleRecording}
          className="relative z-10 w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center cursor-pointer hover:shadow-lg transition-all"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <div className="w-5 h-5 bg-white rounded"></div>
          ) : (
            <div className="w-5 h-5 bg-white rounded-full"></div>
          )}
        </button>
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