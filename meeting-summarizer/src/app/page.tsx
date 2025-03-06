'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FileUploader from '@/app/components/FileUploader';
import CustomAudioRecorder from '@/app/components/CustomAudioRecorder';
import TranscriptionDisplay from '@/app/components/TranscriptionDisplay';
import SummaryDisplay from '@/app/components/SummaryDisplay';
import { chatModels, whisperModels, defaultConfig } from '@/lib/config';
import { countTokens, estimateAudioDuration, calculateTranscriptionCost } from '@/lib/tokenCounter';

export default function Home() {
  // State for audio file
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  
  // State for transcription and summary
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  
  // Loading states
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  
  // Cost tracking
  const [transcriptionCost, setTranscriptionCost] = useState<number>(0);
  const [summaryCost, setSummaryCost] = useState<number>(0);
  
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
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Handle file upload or recording
  const handleAudioCapture = (file: File) => {
    setAudioFile(file);
    setAudioFileName(file.name);
    // Auto-advance to next step
    setCurrentStep(2);
    
    // Scroll to transcribe section
    setTimeout(() => {
      const transcribeSection = document.getElementById('transcribe-section');
      transcribeSection?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  // Handle transcription
  const handleTranscribe = async () => {
    if (!audioFile) return;
    
    setIsTranscribing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('model', settings.transcriptionModel);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setTranscription(data.transcription);
      if (data.usage?.estimatedCost) {
        setTranscriptionCost(data.usage.estimatedCost);
      }
      
      // Auto-advance to next step
      setCurrentStep(3);
      
      // Scroll to summary section
      setTimeout(() => {
        const summarySection = document.getElementById('summary-section');
        summarySection?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (error) {
      console.error('Transcription error:', error);
      alert(`Error during transcription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Handle summarization
  const handleSummarize = async () => {
    if (!transcription) return;
    
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
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setSummary(data.summary);
      if (data.usage?.cost) {
        setSummaryCost(data.usage.cost);
      }
    } catch (error) {
      console.error('Summarization error:', error);
      alert(`Error during summarization: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Reset all data
  const handleReset = () => {
    setAudioFile(null);
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

  // Card variants for animations
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    exit: { opacity: 0, y: -50, transition: { duration: 0.3 } }
  };

  return (
    <main ref={mainContainerRef} className="min-h-screen bg-neutral-50 pb-20">
      {/* Modern gradient header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-xl z-0" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="w-full py-12 relative z-10"
        >
          <div className="max-w-6xl mx-auto px-4 text-center">
            <motion.h1
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-5xl font-bold mb-3 text-neutral-800 tracking-tight"
            >
              Meeting Summarizer
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-lg text-neutral-600 max-w-2xl mx-auto"
            >
              Transform your audio recordings into comprehensive meeting notes and actionable summaries with AI
            </motion.p>
          </div>
        </motion.div>
      </div>
      
      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 pt-8">
        {/* Step indicator */}
        <div className="mb-12">
          <div className="flex justify-between items-center max-w-lg mx-auto relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-neutral-200 -translate-y-1/2 z-0" />
            
            {[1, 2, 3].map((step) => (
              <motion.div
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
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  step
                )}
              </motion.div>
            ))}
          </div>
          
          <div className="flex justify-between items-center max-w-lg mx-auto mt-2 text-sm">
            <div className={`w-20 text-center ${currentStep >= 1 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Add Audio
            </div>
            <div className={`w-20 text-center ${currentStep >= 2 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Transcribe
            </div>
            <div className={`w-20 text-center ${currentStep >= 3 ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Summarize
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
            Settings
          </button>
        </div>
        
        {/* Settings panel */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
                <h2 className="text-xl font-semibold text-neutral-800 mb-6">Advanced Settings</h2>
                
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Transcription Model</h3>
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
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Summarization Model</h3>
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
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Temperature (Creativity)</h3>
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
                      Lower values produce more consistent results, higher values more creative ones.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-3">Display Options</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.showCosts}
                        onChange={(e) => updateSettings({ showCosts: e.target.checked })}
                        className="accent-blue-600 w-4 h-4"
                      />
                      <span className="text-sm text-neutral-600">Show estimated costs</span>
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Step 1: Audio Input Section */}
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
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
                    <h2 className="text-xl font-semibold text-neutral-800">Record Audio</h2>
                  </div>
                  <p className="text-neutral-600 mb-4">Start recording your meeting directly from your browser.</p>
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
                    <h2 className="text-xl font-semibold text-neutral-800">Upload File</h2>
                  </div>
                  <p className="text-neutral-600 mb-4">Upload an existing recording from your device.</p>
                  <FileUploader onFileUploaded={handleAudioCapture} />
                </div>
              </div>
              
              <div className="mt-8 flex justify-center">
                <motion.div
                  className="w-1/2 max-w-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  <div className="text-center bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl">
                    <p className="text-sm">
                      <strong>Tip:</strong> For best results, use clear audio with minimal background noise.
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Step 2: Transcription Section */}
        <div id="transcribe-section" className="scroll-mt-24">
          <AnimatePresence>
            {currentStep >= 2 && (
              <motion.div
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
                      <h2 className="text-xl font-semibold text-neutral-800">Transcribe Audio</h2>
                    </div>
                    
                    {settings.showCosts && transcriptionCost > 0 && (
                      <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full">
                        Estimated cost: ${transcriptionCost.toFixed(4)}
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
                      disabled={!audioFile || isTranscribing}
                      className={`px-6 py-3 rounded-xl text-white font-medium flex items-center gap-2 transition-all ${
                        !audioFile || isTranscribing
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
                          Transcribing...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                          Start Transcription
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <TranscriptionDisplay text={transcription} isLoading={isTranscribing} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Step 3: Summarization Section */}
        <div id="summary-section" className="scroll-mt-24">
          <AnimatePresence>
            {currentStep >= 3 && transcription && (
              <motion.div
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
                      <h2 className="text-xl font-semibold text-neutral-800">Generate Summary</h2>
                    </div>
                    
                    {settings.showCosts && summaryCost > 0 && (
                      <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full">
                        Estimated cost: ${summaryCost.toFixed(4)}
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
                          Generating Summary...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 8H8a4 4 0 1 0 0 8h4"></path>
                            <path d="M16 12h-4"></path>
                          </svg>
                          Generate Summary
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <SummaryDisplay summary={summary} isLoading={isSummarizing} />
              </motion.div>
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
              Start Over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}