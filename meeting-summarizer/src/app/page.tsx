'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatModels, whisperModels, defaultConfig, ModelConfig } from '@/lib/config';
import TranscriptionDisplay from './components/TranscriptionDisplay';
import SummaryDisplay from './components/SummaryDisplay';

// Settings type definition
interface UserSettings {
  transcriptionModel: string;
  summarizationModel: string;
  temperature: number;
  showCosts: boolean;
}

export default function Home() {
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [microphoneAvailable, setMicrophoneAvailable] = useState<boolean | null>(null);
  
  // Settings and cost tracking
  const [settings, setSettings] = useState<UserSettings>({
    transcriptionModel: defaultConfig.transcriptionModel,
    summarizationModel: defaultConfig.summarizationModel,
    temperature: defaultConfig.temperature,
    showCosts: defaultConfig.showCosts
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [usageCosts, setUsageCosts] = useState<{
    transcription: { model: string; durationMinutes: number; cost: number } | null;
    summarization: { model: string; inputTokens: number; outputTokens: number; cost: number } | null;
    total: number;
  }>({
    transcription: null,
    summarization: null,
    total: 0
  });
  
  // Selected model for display purposes
  const [selectedSummarizationModel, setSelectedSummarizationModel] = useState<ModelConfig | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Load saved settings from localStorage on initial load
  useEffect(() => {
    const loadSavedSettings = () => {
      try {
        const savedSettings = localStorage.getItem('meetingSummarizerSettings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings) as UserSettings;
          setSettings(parsedSettings);
        }
      } catch (error) {
        console.error('Fout bij het laden van opgeslagen instellingen:', error);
        // If there's an error, continue with default settings
      }
    };
    
    loadSavedSettings();
    checkMicrophoneAvailability();
  }, []);
  
  // Update selected model when settings change
  useEffect(() => {
    const model = chatModels.find(m => m.id === settings.summarizationModel) || null;
    setSelectedSummarizationModel(model);
  }, [settings.summarizationModel]);
  
  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('meetingSummarizerSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Fout bij het opslaan van instellingen:', error);
    }
  }, [settings]);

  const checkMicrophoneAvailability = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If we get here, microphone is available
      setMicrophoneAvailable(true);
      // Always release the microphone after checking
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error('Microfoon niet beschikbaar:', error);
      setMicrophoneAvailable(false);
    }
  };
  
  // Update a single setting
  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Handle audio from recording or file upload
  const handleAudio = async (file: File) => {
    try {
      setError(null);
      setIsTranscribing(true);
      setTranscription('');
      setSummary('');
      setFileName(file.name);
      
      // Reset cost data
      setUsageCosts({
        transcription: null,
        summarization: null,
        total: 0
      });
      
      // Validate file size (25MB limit)
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('Bestandsgrootte overschrijdt de limiet van 25MB');
      }
      
      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', settings.transcriptionModel);
      
      // Send to transcription API
      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!transcribeResponse.ok) {
        const errorData = await transcribeResponse.json();
        throw new Error(errorData.error || 'Transcriptie mislukt');
      }
      
      const transcribeData = await transcribeResponse.json();
      setTranscription(transcribeData.transcription);
      
      // Track usage and costs
      if (transcribeData.usage) {
        setUsageCosts(prev => ({
          ...prev,
          transcription: {
            model: transcribeData.usage.model,
            durationMinutes: transcribeData.usage.estimatedDurationMinutes,
            cost: transcribeData.usage.estimatedCost
          },
          total: transcribeData.usage.estimatedCost
        }));
      }
      
      setIsTranscribing(false);
      
      // Proceed to summarization
      await handleSummarize(transcribeData.transcription);
    } catch (error) {
      console.error('Fout bij het verwerken van audio:', error);
      setIsTranscribing(false);
      setError(error instanceof Error ? error.message : 'Audio verwerking mislukt');
    }
  };
  
  // Handle summarization
  const handleSummarize = async (text: string) => {
    try {
      setIsSummarizing(true);
      
      const summarizeResponse = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model: settings.summarizationModel,
          temperature: settings.temperature
        }),
      });
      
      if (!summarizeResponse.ok) {
        const errorData = await summarizeResponse.json();
        throw new Error(errorData.error || 'Samenvatting mislukt');
      }
      
      const summarizeData = await summarizeResponse.json();
      setSummary(summarizeData.summary);
      
      // Track usage and costs
      if (summarizeData.usage) {
        setUsageCosts(prev => {
          const transcriptionCost = prev.transcription?.cost || 0;
          const summarizationCost = summarizeData.usage.cost;
          return {
            ...prev,
            summarization: {
              model: summarizeData.usage.model,
              inputTokens: summarizeData.usage.inputTokens,
              outputTokens: summarizeData.usage.outputTokens,
              cost: summarizationCost
            },
            total: transcriptionCost + summarizationCost
          };
        });
      }
      
      setIsSummarizing(false);
    } catch (error) {
      console.error('Fout bij het samenvatten van tekst:', error);
      setIsSummarizing(false);
      setError(error instanceof Error ? error.message : 'Samenvatting van transcriptie mislukt');
    }
  };

  // File upload handlers
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      // Check if file is audio
      if (!file.type.startsWith('audio/')) {
        setError('Upload een audiobestand.');
        return;
      }
      
      handleAudio(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check if file is audio
      if (!file.type.startsWith('audio/')) {
        setError('Upload een audiobestand.');
        return;
      }
      
      handleAudio(file);
    }
  };

  // Audio recording handlers
  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      
      // Request microphone access with error handling
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        console.error('Microfoon toegangsfout:', err);
        
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error('Geen microfoon gevonden. Sluit een microfoon aan en probeer het opnieuw.');
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('Toegang tot microfoon geweigerd. Sta microfoontoegang toe in je browserinstellingen.');
        } else if (err.name === 'AbortError' || err.name === 'NotReadableError') {
          throw new Error('Je microfoon is bezet of werkt niet correct. Sluit andere applicaties die het mogelijk gebruiken.');
        } else {
          throw new Error(`Kon geen toegang krijgen tot microfoon: ${err.message}`);
        }
      }
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      // Handle data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Handle stop
      mediaRecorder.onstop = () => {
        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], 'opname.wav', { type: 'audio/wav' });
        
        // Release microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Process the audio
        handleAudio(audioFile);
      };
      
      // Error handler for mediaRecorder
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder fout:', event);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        setError('Er is een opnamefout opgetreden. Probeer het opnieuw.');
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
      console.error('Opnamefout:', error);
      setError(error instanceof Error ? error.message : 'Kon opname niet starten');
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

  // Format cost as currency
  const formatCost = (cost: number): string => {
    return '€' + cost.toFixed(4);
  };

  // Download transcription and summary as a text file
  const downloadNotes = () => {
    if (!transcription && !summary) return;
    
    const today = new Date();
    const formattedDate = today.toLocaleDateString('nl-NL').replace(/\//g, '-');
    const fileName = `vergadernotities-${formattedDate}.txt`;
    
    let content = '';
    
    if (transcription) {
      content += "=== TRANSCRIPTIE ===\n\n";
      content += transcription;
      content += "\n\n";
    }
    
    if (summary) {
      content += "=== SAMENVATTING ===\n\n";
      content += summary;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full py-8 bg-gradient-to-r from-blue-600 to-purple-600"
      >
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-2 text-white">Vergaderingsnotulen</h1>
          <p className="text-blue-100 text-lg">
            Transcribeer en vat je vergaderingen samen met AI
          </p>
        </div>
      </motion.div>
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Settings toggle button */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-6 text-right"
          >
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center px-4 py-2 bg-white rounded-full 
                shadow-md text-gray-700 font-medium text-sm hover:shadow-lg 
                transition-all duration-300 ease-in-out"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-4 h-4 mr-2"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              {showSettings ? 'Verberg Instellingen' : 'Instellingen'}
            </button>
          </motion.div>
          
          {/* Settings panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl p-6 shadow-lg mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    Instellingen
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Transcriptiemodel
                      </label>
                      <select 
                        className="w-full p-2 rounded-lg border border-gray-300 focus:ring-2 
                          focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={settings.transcriptionModel}
                        onChange={(e) => updateSetting('transcriptionModel', e.target.value)}
                      >
                        {whisperModels.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name} - {model.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Samenvattingsmodel
                      </label>
                      <select 
                        className="w-full p-2 rounded-lg border border-gray-300 focus:ring-2 
                          focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={settings.summarizationModel}
                        onChange={(e) => updateSetting('summarizationModel', e.target.value)}
                      >
                        {chatModels.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.name} - {model.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Temperature slider (only shown for models that support it) */}
                  {selectedSummarizationModel?.supportsTemperature && (
                    <div className="mt-6">
                      <label className="text-sm font-medium text-gray-700 block mb-1">
                        Temperatuur: {settings.temperature.toFixed(1)}
                        <span className="font-normal ml-2 text-xs text-gray-500">
                          (Lager = nauwkeuriger, hoger = creatiever)
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={settings.temperature}
                        onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Nauwkeuriger</span>
                        <span>Creatiever</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-6">
                    <label className="inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={settings.showCosts} 
                        onChange={(e) => updateSetting('showCosts', e.target.checked)} 
                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 mr-2" 
                      />
                      <span className="text-gray-700">Toon kostenramingen</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Recording component */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="bg-white rounded-2xl p-6 shadow-lg text-center"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Vergadering opnemen</h2>
              
              {microphoneAvailable === false && (
                <div className="p-3 bg-red-50 rounded-lg mb-4 text-red-600">
                  <p>Geen microfoon gedetecteerd. Sluit een microfoon aan of gebruik de uploadoptie.</p>
                </div>
              )}
              
              <div className="relative mx-auto w-fit">
                <AnimatePresence>
                  {isRecording && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: [1, 1.2, 1], opacity: 0.6 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute inset-0 -m-3 bg-red-100 rounded-full z-0"
                    />
                  )}
                </AnimatePresence>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleRecording}
                  disabled={microphoneAvailable === false}
                  className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center 
                    shadow-lg transition-all duration-300 ${microphoneAvailable === false 
                    ? 'bg-gray-300 cursor-not-allowed opacity-70' 
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 cursor-pointer'}`}
                  aria-label={isRecording ? "Stop opname" : "Start opname"}
                >
                  {isRecording ? (
                    <div className="w-6 h-6 bg-white rounded"></div>
                  ) : (
                    <div className="w-6 h-6 bg-white rounded-full"></div>
                  )}
                </motion.button>
              </div>
              
              <AnimatePresence>
                {isRecording && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-center text-red-600 font-medium mt-4"
                  >
                    <span className="mr-2 h-2 w-2 bg-red-600 rounded-full inline-block"></span>
                    Opname loopt: {formatTime(recordingTime)}
                  </motion.div>
                )}
              </AnimatePresence>
              
              <p className="text-sm text-gray-500 mt-4">
                {microphoneAvailable === false 
                  ? "Microfoontoegang vereist voor opname" 
                  : `Klik om opname te ${isRecording ? 'stoppen' : 'starten'}`}
              </p>
            </motion.div>
            
            {/* File uploader */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="bg-white rounded-2xl p-6 shadow-lg text-center"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Vergaderingsopname uploaden</h2>
              
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className={`h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center 
                  cursor-pointer transition-colors duration-300 ${
                  error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
                }}
                onDrop={handleDrop}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="w-10 h-10 text-gray-400 mb-3"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-gray-500">
                  Sleep en plaats of klik om te uploaden
                </p>
                {fileName && (
                  <p className="mt-2 text-sm text-blue-600 font-medium">
                    {fileName}
                  </p>
                )}
              </motion.div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-gray-400 mt-3">
                Ondersteunde formaten: MP3, WAV, M4A, FLAC (Max 25MB)
              </p>
            </motion.div>
          </div>
          
          {/* Error display */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600"
              >
                <p className="font-medium">Fout: {error}</p>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Display cost information */}
          <AnimatePresence>
            {settings.showCosts && (usageCosts.transcription || usageCosts.summarization) && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 bg-slate-100 rounded-xl p-4 overflow-hidden"
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Kostenoverzicht
                </h3>
                
                {usageCosts.transcription && (
                  <div className="mb-2 text-sm">
                    <p>
                      <span className="font-medium">Transcriptie ({usageCosts.transcription.model}):</span> 
                      {' '}
                      ~{usageCosts.transcription.durationMinutes.toFixed(2)} minuten
                      {' '}
                      ({formatCost(usageCosts.transcription.cost)})
                    </p>
                  </div>
                )}
                
                {usageCosts.summarization && (
                  <div className="mb-2 text-sm">
                    <p>
                      <span className="font-medium">Samenvatting ({usageCosts.summarization.model}):</span> 
                      {' '}
                      {usageCosts.summarization.inputTokens.toLocaleString()} input tokens, 
                      {' '}
                      {usageCosts.summarization.outputTokens.toLocaleString()} output tokens
                      {' '}
                      ({formatCost(usageCosts.summarization.cost)})
                    </p>
                  </div>
                )}
                
                <div className="mt-3 pt-3 border-t border-slate-200 font-semibold">
                  <p>
                    Totale geschatte kosten: {formatCost(usageCosts.total)}
                  </p>
                </div>
                
                <div className="mt-2 text-xs text-gray-500">
                  <p>*Kosten zijn geschat op basis van OpenAI's prijzen en kunnen enigszins variëren.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Results section */}
          <AnimatePresence>
            {(transcription || isTranscribing || summary || isSummarizing) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* Download button */}
                {(transcription || summary) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end mb-4"
                  >
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={downloadNotes}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white 
                        rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="w-4 h-4 mr-2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Notities downloaden
                    </motion.button>
                  </motion.div>
                )}
              
                <div className="space-y-6">
                  {/* Transcription display component rendering */}
                  {(transcription || isTranscribing) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {isTranscribing ? (
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                          <div className="animate-pulse">
                            <div className="h-7 bg-gray-200 rounded-md w-1/4 mb-6"></div>
                            <div className="space-y-3">
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md w-2/3"></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                          <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800">Transcriptie</h2>
                            <button 
                              onClick={() => navigator.clipboard.writeText(transcription)}
                              className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                              title="Kopiëren naar klembord"
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                className="w-5 h-5"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                          
                          <div className="max-h-96 overflow-y-auto pr-2">
                            {transcription.split('\n').map((paragraph, i) => (
                              <p key={i} className="mb-4 text-gray-700 leading-relaxed">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                  
                  {/* Summary display component rendering */}
                  {(summary || isSummarizing) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {isSummarizing ? (
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                          <div className="animate-pulse">
                            <div className="h-7 bg-gray-200 rounded-md w-1/4 mb-6"></div>
                            <div className="space-y-3">
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md"></div>
                              <div className="h-4 bg-gray-200 rounded-md w-2/3"></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                          <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800">Samenvatting</h2>
                            <button 
                              onClick={() => navigator.clipboard.writeText(summary)}
                              className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                              title="Kopiëren naar klembord"
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                className="w-5 h-5"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                          
                          <div className="max-h-96 overflow-y-auto pr-2">
                            {formatSummary(summary).map((section, i) => {
                              if (section.type === 'header') {
                                return (
                                  <h3 key={i} className="text-lg font-semibold text-blue-700 mt-4 mb-2 pb-1 border-b border-blue-200">
                                    {section.content}
                                  </h3>
                                );
                              } else {
                                return (
                                  <p key={i} className="mb-3 text-gray-700 leading-relaxed">
                                    {section.content}
                                  </p>
                                );
                              }
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Empty state */}
          {!transcription && !isTranscribing && !summary && !isSummarizing && !error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center py-20"
            >
              <p className="text-gray-500 text-lg">
                Begin met het opnemen of uploaden van audio
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}

// Helper function to format the summary with sections
function formatSummary(summary: string): { type: 'header' | 'paragraph', content: string }[] {
  const result: { type: 'header' | 'paragraph', content: string }[] = [];
  
  // Common section titles in Dutch that we want to highlight
  const sectionPatterns = [
    /^(Overzicht|OVERZICHT):/i,
    /^(Belangrijkste discussiepunten|BELANGRIJKSTE DISCUSSIEPUNTEN):/i,
    /^(Genomen beslissingen|GENOMEN BESLISSINGEN|Beslissingen|BESLISSINGEN):/i,
    /^(Actiepunten|ACTIEPUNTEN):/i,
    /^(Vervolgstappen|VERVOLGSTAPPEN|Volgende stappen|VOLGENDE STAPPEN):/i,
    /^(Deelnemers|DEELNEMERS):/i,
    /^(Conclusie|CONCLUSIE):/i
  ];
  
  const lines = summary.split('\n');
  let currentParagraph = '';
  
  for (const line of lines) {
    // Check if this line is a section header
    const isHeader = sectionPatterns.some(pattern => pattern.test(line));
    
    if (isHeader) {
      // If we had a paragraph in progress, add it first
      if (currentParagraph.trim()) {
        result.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      
      // Add the header
      result.push({ type: 'header', content: line });
    } else if (line.trim()) {
      // For non-empty lines, add to the current paragraph
      currentParagraph += (currentParagraph ? '\n' : '') + line;
    } else if (currentParagraph.trim()) {
      // Empty line and we have a paragraph - finish it
      result.push({ type: 'paragraph', content: currentParagraph.trim() });
      currentParagraph = '';
    }
  }
  
  // Add the last paragraph if there's one
  if (currentParagraph.trim()) {
    result.push({ type: 'paragraph', content: currentParagraph.trim() });
  }
  
  return result;
}