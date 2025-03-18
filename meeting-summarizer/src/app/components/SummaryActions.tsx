'use client';

import { useState } from 'react';
import { motion, AnimatePresence, MotionProps } from 'framer-motion';
import React, { HTMLAttributes, forwardRef } from 'react';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & MotionProps;
const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => (
  <motion.div ref={ref} {...props} />
));
MotionDiv.displayName = 'MotionDiv';

interface SummaryActionsProps {
  summary: string;
  transcription: string;
  onRefinedSummary: (refinedSummary: string) => void;
  onOpenEmailModal: () => void;
}

export default function SummaryActions({
  summary,
  transcription,
  onRefinedSummary,
  onOpenEmailModal
}: SummaryActionsProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Validate inputs before making API calls
  const validateInputs = () => {
    if (!summary || summary.trim() === '') {
      setError('Samenvatting is leeg of ontbreekt');
      return false;
    }
    
    if (!transcription || transcription.trim() === '') {
      setError('Transcriptie is leeg of ontbreekt');
      return false;
    }
    
    return true;
  };

  const handleDetailedAction = async () => {
    if (!validateInputs()) return;
    
    setLoading(true);
    setActiveAction('make-detailed');
    setError(null);
    
    try {
      const response = await fetch('/api/refine-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary,
          transcript: transcription,
          action: 'make-detailed'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Onbekende fout bij het verfijnen van de samenvatting');
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      onRefinedSummary(data.refinedSummary);
    } catch (error) {
      console.error('Error refining summary:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij het verfijnen van de samenvatting');
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleTopicElaboration = async () => {
    if (!validateInputs()) return;
    
    if (!topicInput.trim()) {
      setError('Voer een onderwerp in om uit te breiden');
      return;
    }
    
    setLoading(true);
    setActiveAction('elaborate-topic');
    setError(null);
    
    try {
      const response = await fetch('/api/refine-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary,
          transcript: transcription,
          action: 'elaborate-topic',
          topic: topicInput
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Onbekende fout bij het uitbreiden van het onderwerp');
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      onRefinedSummary(data.refinedSummary);
      setTopicInput('');
    } catch (error) {
      console.error('Error elaborating topic:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij het uitbreiden van het onderwerp');
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleCustomRefinement = async () => {
    if (!validateInputs()) return;
    
    if (!customPrompt.trim()) {
      setError('Voer een aangepaste instructie in');
      return;
    }
    
    setLoading(true);
    setActiveAction('custom');
    setError(null);
    
    try {
      const response = await fetch('/api/refine-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary,
          transcript: transcription,
          action: 'custom',
          customPrompt
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Onbekende fout bij de aangepaste verfijning');
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      onRefinedSummary(data.refinedSummary);
      setCustomPrompt('');
    } catch (error) {
      console.error('Error with custom refinement:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij de aangepaste verfijning');
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="mb-8">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-neutral-800 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2 text-blue-600">
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>
            <path d="m17 4 2 2"></path>
            <path d="m19 2 2 2"></path>
            <path d="m12 15 2 2"></path>
            <path d="m14 13 2 2"></path>
          </svg>
          Samenvatting Acties
        </h2>
        
        <AnimatePresence>
          {error && (
            <MotionDiv
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg"
            >
              {error}
            </MotionDiv>
          )}
        </AnimatePresence>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-neutral-50 rounded-xl p-4 hover:shadow-md transition-shadow">
            <h3 className="text-md font-medium text-neutral-700 mb-2">Maak samenvatting gedetailleerder</h3>
            <p className="text-neutral-600 text-sm mb-3">Voeg meer details toe uit het transcript om een uitgebreidere samenvatting te krijgen.</p>
            <button
              onClick={handleDetailedAction}
              disabled={loading}
              className={`w-full px-4 py-2 rounded-lg text-white font-medium transition-all ${
                loading && activeAction === 'make-detailed'
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
              }`}
            >
              {loading && activeAction === 'make-detailed' ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Bezig...
                </span>
              ) : (
                'Meer details toevoegen'
              )}
            </button>
          </div>
          
          <div className="bg-neutral-50 rounded-xl p-4 hover:shadow-md transition-shadow">
            <h3 className="text-md font-medium text-neutral-700 mb-2">Verstuur per e-mail</h3>
            <p className="text-neutral-600 text-sm mb-3">Verstuur deze samenvatting als e-mail naar collega's of klanten.</p>
            <button
              onClick={onOpenEmailModal}
              className="w-full px-4 py-2 rounded-lg text-white font-medium bg-green-600 hover:bg-green-700 hover:shadow-md transition-all"
            >
              Verstuur als e-mail
            </button>
          </div>
          
          <div className="bg-neutral-50 rounded-xl p-4 hover:shadow-md transition-shadow">
            <h3 className="text-md font-medium text-neutral-700 mb-2">Breid een onderwerp uit</h3>
            <p className="text-neutral-600 text-sm mb-3">Selecteer een specifiek onderwerp om in meer detail uit te werken.</p>
            <div className="flex space-x-2">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Voer een onderwerp in..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleTopicElaboration}
                disabled={loading || !topicInput.trim()}
                className={`px-4 py-2 rounded-lg text-white font-medium transition-all ${
                  loading && activeAction === 'elaborate-topic'
                    ? 'bg-purple-400 cursor-not-allowed'
                    : !topicInput.trim()
                    ? 'bg-purple-300 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 hover:shadow-md'
                }`}
              >
                {loading && activeAction === 'elaborate-topic' ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  'Uitbreiden'
                )}
              </button>
            </div>
          </div>
          
          <div className="bg-neutral-50 rounded-xl p-4 hover:shadow-md transition-shadow">
            <h3 className="text-md font-medium text-neutral-700 mb-2">Aangepaste aanpassing</h3>
            <p className="text-neutral-600 text-sm mb-3">Geef een aangepaste instructie voor het verfijnen van de samenvatting.</p>
            <div className="space-y-2">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Bijvoorbeeld: 'Focus meer op de technische details' of 'Voeg meer context toe over project X'"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                rows={2}
              />
              <button
                onClick={handleCustomRefinement}
                disabled={loading || !customPrompt.trim()}
                className={`w-full px-4 py-2 rounded-lg text-white font-medium transition-all ${
                  loading && activeAction === 'custom'
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : !customPrompt.trim()
                    ? 'bg-indigo-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'
                }`}
              >
                {loading && activeAction === 'custom' ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Bezig...
                  </span>
                ) : (
                  'Toepassen'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}