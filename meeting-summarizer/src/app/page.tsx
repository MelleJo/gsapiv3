'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';
import FileUploader from '@/app/components/FileUploader';
import CustomAudioRecorder from '@/app/components/CustomAudioRecorder';
import TranscriptionDisplay from '@/app/components/TranscriptionDisplay';
import SummaryDisplay from '@/app/components/SummaryDisplay';
import SummaryActions from '@/app/components/SummaryActions';
import EmailModal from '@/app/components/EmailModal';
import Notification, { NotificationType } from '@/app/components/Notification';
import { chatModels, whisperModels, defaultConfig } from '@/lib/config';
import { BlobFile } from '@vercel/blob';

// Create properly typed motion components
type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

type MotionH1Props = HTMLAttributes<HTMLHeadingElement> & MotionProps;
const MotionH1 = forwardRef<HTMLHeadingElement, MotionH1Props>((props, ref) => (
  <motion.h1 ref={ref} {...props} />
));
MotionH1.displayName = 'MotionH1';

type MotionPProps = HTMLAttributes<HTMLParagraphElement> & MotionProps;
const MotionP = forwardRef<HTMLParagraphElement, MotionPProps>((props, ref) => (
  <motion.p ref={ref} {...props} />
));
MotionP.displayName = 'MotionP';

type MotionButtonProps = HTMLAttributes<HTMLButtonElement> & MotionProps & {
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};
const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>((props, ref) => (
  <motion.button ref={ref} {...props} />
));
MotionButton.displayName = 'MotionButton';

export default function Home() {
  // State voor audio bestand
  const [audioBlob, setAudioBlob] = useState<BlobFile | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  
  // State voor transcriptie en samenvatting
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  
  // Loading states
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  
  // Cost tracking
  const [transcriptionCost, setTranscriptionCost] = useState<number>(0);
  const [summaryCost, setSummaryCost] = useState<number>(0);
  const [transcriptionInfo, setTranscriptionInfo] = useState<{
    chunked: boolean;
    chunks: number;
  }>({
    chunked: false,
    chunks: 1
  });
  
  // Settings
  const [settings, setSettings] = useState({
    transcriptionModel: defaultConfig.transcriptionModel,
    summarizationModel: defaultConfig.summarizationModel,
    temperature: defaultConfig.temperature,
    showCosts: defaultConfig.showCosts
  });
  
  // UI state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: NotificationType;
    message: string;
    isVisible: boolean;
  }>({
    type: 'info',
    message: '',
    isVisible: false
  });
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Aangepaste functie voor het verwerken van Blob uploads
  const handleBlobUpload = (blob: BlobFile) => {
    setAudioBlob(blob);
    setAudioFileName(blob.originalName);
    // Auto-advance to next step
    setCurrentStep(2);
    
    // Scroll to transcribe section
    setTimeout(() => {
      const transcribeSection = document.getElementById('transcribe-section');
      transcribeSection?.scrollIntoView({ behavior: 'smooth' });
      
      // Automatically start transcription after upload
      transcribeAudio(blob);
    }, 300);
  };
  
  // Separate function to transcribe audio that can work with a direct blob
  const transcribeAudio = async (blob: BlobFile) => {
    setIsTranscribing(true);
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blobUrl: blob.url,
          originalFileName: blob.originalName,
          fileType: blob.contentType,
          fileSize: blob.size,
          model: settings.transcriptionModel
        })
      });
      
      // First check if the response is OK before attempting to parse JSON
      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Transcriptie mislukt');
        } catch (jsonError) {
          // If JSON parsing fails, use the status text or a generic message
          throw new Error(`Transcriptie mislukt: ${response.status} ${response.statusText || 'Onbekende fout'}`);
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
      
      setTranscription(data.transcription);
      if (data.usage?.estimatedCost) {
        setTranscriptionCost(data.usage.estimatedCost);
      }
      
      // Update chunking information if available
      if (data.usage?.chunked !== undefined) {
        setTranscriptionInfo({
          chunked: data.usage.chunked,
          chunks: data.usage.chunks || 1
        });
      }
      
      // Auto-advance to next step
      setCurrentStep(3);
      
      // Scroll to summary section
      setTimeout(() => {
        const summarySection = document.getElementById('summary-section');
        summarySection?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (error) {
      console.error('Transcriptie fout:', error);
      showNotification('error', `Fout tijdens transcriptie: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Voor audio-opnames
  const handleAudioCapture = async (file: File) => {
    try {
      // Opgenomen audio uploaden naar Vercel Blob
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-blob', {
        method: 'POST',
        body: formData,
      });
      
      // First check if the response is OK before attempting to parse JSON
      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload van opname mislukt');
        } catch (jsonError) {
          // If JSON parsing fails, use the status text or a generic message
          throw new Error(`Upload van opname mislukt: ${response.status} ${response.statusText || 'Onbekende fout'}`);
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
      
      // Verwerk het geüploade bestand
      handleBlobUpload(data.blob);
      
    } catch (error) {
      console.error("Fout bij uploaden van opname:", error);
      showNotification('error', error instanceof Error ? error.message : 'Upload van opname mislukt');
    }
  };

  // Handle transcription with Blob URL from button click
  const handleTranscribe = async () => {
    if (!audioBlob) return;
    
    // Check for large file sizes and warn
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > 25) {
      showNotification('warning', `Let op: Bestand (${fileSizeMB.toFixed(1)}MB) is groter dan 25MB, wat mogelijk problemen kan veroorzaken bij transcriptie. Overweeg een kleiner bestand te gebruiken voor betere resultaten.`);
    }
    
    await transcribeAudio(audioBlob);
  };

  // Handle summarization
  const handleSummarize = async () => {
    if (!transcription || transcription.trim() === '') {
      showNotification('error', 'Transcriptie is leeg of ontbreekt');
      return;
    }
    
    setIsSummarizing(true);
    
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: transcription,
          model: settings.summarizationModel,
          temperature: settings.temperature
        })
      });
      
      // First check if the response is OK before attempting to parse JSON
      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Onbekende fout tijdens het samenvatten');
        } catch (jsonError) {
          // If JSON parsing fails, use the status text or a generic message
          throw new Error(`Samenvatting mislukt: ${response.status} ${response.statusText || 'Onbekende fout'}`);
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
      
      setSummary(data.summary);
      if (data.usage?.cost) {
        setSummaryCost(data.usage.cost);
      }
    } catch (error) {
      console.error('Summarization error:', error);
      showNotification('error', `Fout tijdens het samenvatten: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Reset all data
  const handleReset = () => {
    setAudioBlob(null);
    setAudioFileName('');
    setTranscription('');
    setSummary('');
    setTranscriptionCost(0);
    setSummaryCost(0);
    setCurrentStep(1);
    
    // Scroll back to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Settings toggle
  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  // Update settings
  const updateSettings = (newSettings: Partial<typeof settings>) => {
    setSettings({
      ...settings,
      ...newSettings
    });
  };
  
  // Handle email modal
  const handleOpenEmailModal = () => {
    setIsEmailModalOpen(true);
  };
  
  const handleCloseEmailModal = () => {
    setIsEmailModalOpen(false);
  };
  
  // Handle refined summary
  const handleRefinedSummary = (refinedSummary: string) => {
    setSummary(refinedSummary);
    showNotification('success', 'Samenvatting succesvol bijgewerkt');
  };
  
  // Handle email notifications
  const handleEmailNotification = (success: boolean, message: string) => {
    showNotification(success ? 'success' : 'error', message);
  };
  
  // Show notification
  const showNotification = (type: NotificationType, message: string) => {
    setNotification({
      type,
      message,
      isVisible: true
    });
  };
  
  // Close notification
  const closeNotification = () => {
    setNotification(prev => ({
      ...prev,
      isVisible: false
    }));
  };

  // Card variants for animations
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, y: -50, transition: { duration: 0.3 } }
  };

  return (
    <main ref={mainContainerRef} className="min-h-screen bg-neutral-50 pb-20">
      {/* Notification component */}
      <Notification
        type={notification.type}
        message={notification.message}
        isVisible={notification.isVisible}
        onClose={closeNotification}
      />

      {/* Email modal */}
      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={handleCloseEmailModal}
        summary={summary}
        transcription={transcription}
        onSendEmail={handleEmailNotification}
      />
      
      {/* Modern gradient header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-xl z-0" />
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="w-full py-12 relative z-10"
        >
          <div className="max-w-6xl mx-auto px-4 text-center">
            <MotionH1
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-5xl font-bold mb-3 text-neutral-800 tracking-tight"
            >
              Super Kees Online
            </MotionH1>
            <MotionP
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-lg text-neutral-600 max-w-2xl mx-auto"
            >
              Transformeer uw audio-opnames naar uitgebreide vergadernotities en bruikbare samenvattingen met AI
            </MotionP>
          </div>
        </MotionDiv>
      </div>
      
      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 pt-8">
        {/* Step indicator */}
        <div className="mb-12">
          <div className="flex justify-between items-center max-w-lg mx-auto relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-neutral-200 -translate-y-1/2 z-0" />
            
            {[1, 2, 3].map((step) => (
              <MotionDiv
                key={step}
                className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                  currentStep >= step
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-400'
                }`}
                animate={{
                  scale: currentStep === step ? [1, 1.1, 1] : 1,
                  transition: { duration: 0.5, repeat: currentStep === step ? Infinity : 0, repeatDelay: 2 }
                }}
              >
                {currentStep > step ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  step
                )}
              </MotionDiv>
            ))}
          </div>
          
          <div className="flex justify-between items-center max-w-lg mx-auto mt-2 text-sm">
            <div className={`w-20 text-center ${currentStep >= 1 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Audio Toevoegen
            </div>
            <div className={`w-20 text-center ${currentStep >= 2 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Transcriberen
            </div>
            <div className={`w-20 text-center ${currentStep >= 3 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Samenvatten
            </div>
          </div>
        </div>
        
        {/* Settings button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleSettings}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Instellingen
          </button>
        </div>
        
        {/* Settings panel */}
        <AnimatePresence>
          {isSettingsOpen && (
            <MotionDiv
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
                <h2 className="text-xl font-semibold text-neutral-800 mb-6">Geavanceerde Instellingen</h2>
                
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Transcriptiemodel</h3>
                    <select
                      value={settings.transcriptionModel}
                      onChange={(e) => updateSettings({ transcriptionModel: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    >
                      {whisperModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Samenvattingsmodel</h3>
                    <select
                      value={settings.summarizationModel}
                      onChange={(e) => updateSettings({ summarizationModel: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    >
                      {chatModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Temperatuur (Creativiteit)</h3>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={settings.temperature}
                        onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                        className="w-full accent-blue-600"
                      />
                      <span className="text-sm text-neutral-600 w-12">{settings.temperature}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Lagere waarden geven consistentere resultaten, hogere waarden creëren meer variatie.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Weergave-opties</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.showCosts}
                        onChange={(e) => updateSettings({ showCosts: e.target.checked })}
                        className="accent-blue-600 w-4 h-4"
                      />
                      <span className="text-sm text-neutral-600">Toon geschatte kosten</span>
                    </label>
                  </div>
                </div>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
        
        {/* Step 1: Audio Input Section */}
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <MotionDiv
              key="step1"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="mb-12"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" x2="12" y1="19" y2="22"></line>
                      </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-neutral-800">Audio Opnemen</h2>
                  </div>
                  <p className="text-neutral-600 mb-4">Start met het opnemen van uw vergadering direct vanuit uw browser.</p>
                  <CustomAudioRecorder onAudioRecorded={handleAudioCapture} />
                </div>
                
                <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-neutral-800">Bestand Uploaden</h2>
                  </div>
                  <p className="text-neutral-600 mb-4">Upload een bestaande opname vanaf uw apparaat.</p>
                  <FileUploader onFileUploaded={handleBlobUpload} />
                </div>
              </div>
              
              <div className="mt-8 flex justify-center">
                <MotionDiv
                  className="w-1/2 max-w-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  <div className="text-center bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl">
                    <p className="text-sm">
                      <strong>Tip:</strong> Voor de beste resultaten, gebruik heldere audio met minimale achtergrondruis.
                    </p>
                  </div>
                </MotionDiv>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
        
        {/* Step 2: Transcription Section */}
        <div id="transcribe-section" className="scroll-mt-24">
          <AnimatePresence>
            {currentStep >= 2 && (
              <MotionDiv
                key="step2"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="mb-12"
              >
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.5 22h.5c.5 0 1-.2 1.4-.6.4-.4.6-.9.6-1.4V7.5L14.5 2H6c-.5 0-1 .2-1.4.6C4.2 3 4 3.5 4 4v3"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <path d="M12 18v-6"></path>
                          <path d="m9 15 3 3 3-3"></path>
                          <path d="M9 10h1"></path>
                          <path d="M14 10h1"></path>
                          <path d="M9 14h6"></path>
                        </svg>
                      </div>
                      <h2 className="text-xl font-semibold text-neutral-800">Audio Transcriberen</h2>
                    </div>
                    
                    {settings.showCosts && transcriptionCost > 0 && (
                      <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full">
                        Geschatte kosten: ${transcriptionCost.toFixed(4)}
                      </div>
                    )}
                  </div>
                  
                  {audioFileName && (
                    <div className="flex items-center mb-6 p-3 bg-blue-50 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 mr-3">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" x2="12" y1="19" y2="22"></line>
                      </svg>
                      <span className="text-blue-700 font-medium">{audioFileName}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-center">
                    <button
                      onClick={handleTranscribe}
                      disabled={!audioBlob || isTranscribing}
                      className={`px-6 py-3 rounded-xl text-white font-medium flex items-center gap-2 transition-all ${
                        !audioBlob || isTranscribing
                          ? 'bg-neutral-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98]'
                      }`}
                    >
                      {isTranscribing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Transcriberen...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                          Start Transcriptie
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <TranscriptionDisplay 
                  text={transcription} 
                  isLoading={isTranscribing}
                  chunked={transcriptionInfo.chunked}
                  chunksCount={transcriptionInfo.chunks}
                />
              </MotionDiv>
            )}
          </AnimatePresence>
        </div>
        
        {/* Step 3: Summarization Section */}
        <div id="summary-section" className="scroll-mt-24">
          <AnimatePresence>
            {currentStep >= 3 && transcription && (
              <MotionDiv
                key="step3"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="mb-12"
              >
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
                        </svg>
                      </div>
                      <h2 className="text-xl font-semibold text-neutral-800">Samenvatting Genereren</h2>
                    </div>
                    
                    {settings.showCosts && summaryCost > 0 && (
                      <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full">
                        Geschatte kosten: ${summaryCost.toFixed(4)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-center">
                    <button
                      onClick={handleSummarize}
                      disabled={!transcription || isSummarizing}
                      className={`px-6 py-3 rounded-xl text-white font-medium flex items-center gap-2 transition-all ${
                        !transcription || isSummarizing
                          ? 'bg-neutral-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:shadow-lg hover:shadow-purple-200 active:scale-[0.98]'
                      }`}
                    >
                      {isSummarizing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Samenvatting Genereren...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 8H8a4 4 0 1 0 0 8h4"></path>
                            <path d="M16 12h-4"></path>
                          </svg>
                          Genereer Samenvatting
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <SummaryDisplay summary={summary} isLoading={isSummarizing} />
                
                {/* Add SummaryActions component here */}
                {summary && !isSummarizing && (
                  <SummaryActions
                    summary={summary}
                    transcription={transcription}
                    onRefinedSummary={handleRefinedSummary}
                    onOpenEmailModal={handleOpenEmailModal}
                  />
                )}
              </MotionDiv>
            )}
          </AnimatePresence>
        </div>
        
        {/* Reset button */}
        {currentStep > 1 && (
          <div className="flex justify-center mt-10">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38" />
              </svg>
              Opnieuw Beginnen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
