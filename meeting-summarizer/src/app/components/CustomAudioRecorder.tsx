'use client';

import { useState, useRef, useEffect } from 'react';
import React from 'react'; // Removed forwardRef, HTMLAttributes
import { Button } from "@/components/ui/button"; // Import Shadcn Button
import { Mic, Square, Loader2 } from 'lucide-react'; // Import icons

// Removed MotionDiv definition

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
      console.error('Fout bij toegang tot microfoon:', error);
      alert('Geen toegang tot microfoon. Controleer of je toestemming hebt verleend.');
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
    <div className="flex flex-col items-center space-y-4 p-6"> {/* Removed bg and shadow, handled by Card in page.tsx */}
      <h2 className="text-lg font-semibold text-foreground">Vergadering Opnemen</h2>

      <Button
        onClick={toggleRecording}
        variant={isRecording ? "destructive" : "default"} // Change variant based on state
        size="lg" // Make button larger
        className="w-20 h-20 rounded-full" // Make it circular
        aria-label={isRecording ? "Stop opname" : "Start opname"}
      >
        {isRecording ? (
          <Square className="h-8 w-8" /> // Stop icon
        ) : (
          <Mic className="h-8 w-8" /> // Mic icon
        )}
      </Button>

      {isRecording && (
        <div className="flex items-center text-destructive font-medium">
          <span className="relative flex h-3 w-3 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
          </span>
          Opname {formatTime(recordingTime)}
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-2">
        Klik om opname te {isRecording ? 'stoppen' : 'starten'}
      </p>
    </div>
  );
}
