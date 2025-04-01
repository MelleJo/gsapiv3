'use client';

import { useState, useCallback } from 'react';
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, Wand2, MessageSquarePlus, TextSearch } from 'lucide-react'; // Import icons

// Removed MotionDiv definition

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
  // Removed onOpenEmailModal from props and destructuring
}: Omit<SummaryActionsProps, 'onOpenEmailModal'>) { // Omit the prop type
  const [loading, setLoading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string | null>(null); // Tracks which button is loading
  const [topicInput, setTopicInput] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isTranscriptCopied, setIsTranscriptCopied] = useState<boolean>(false); // State for copy feedback

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
      setActiveAction(null); // Reset active action
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
      setActiveAction(null); // Reset active action
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
      setActiveAction(null); // Reset active action
    }
  };

  // Function to handle copying the transcript
  const handleCopyTranscript = useCallback(() => {
    if (!transcription) {
      setError('Geen transcriptie beschikbaar om te kopiëren.');
      return;
    }
    navigator.clipboard.writeText(transcription)
      .then(() => {
        setIsTranscriptCopied(true);
        setTimeout(() => setIsTranscriptCopied(false), 2000); // Reset after 2 seconds
      })
      .catch(err => {
        console.error('Failed to copy transcript: ', err);
        setError('Kon transcriptie niet kopiëren naar klembord.');
      });
  }, [transcription]); // Dependency array includes transcription

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Wand2 className="w-5 h-5 mr-2 text-primary" />
          Samenvatting Acties
        </CardTitle>
        <CardDescription>Verfijn de samenvatting of kopieer de transcriptie.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Make Detailed */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Maak Gedetailleerder</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-muted-foreground text-sm mb-3">Voeg meer details toe uit het transcript.</p>
              <Button
                onClick={handleDetailedAction}
                disabled={loading}
                className="w-full"
                variant="secondary"
              >
                {loading && activeAction === 'make-detailed' ? (
                  <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Bezig...</>
                ) : (
                  <><MessageSquarePlus className="mr-2 h-4 w-4" /> Meer details</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Copy Transcript */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kopieer Transcript</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-muted-foreground text-sm mb-3">Kopieer de volledige transcriptie.</p>
              <Button
                onClick={handleCopyTranscript}
                disabled={isTranscriptCopied}
                className="w-full"
                variant={isTranscriptCopied ? "default" : "secondary"} // Change variant on copy
              >
                {isTranscriptCopied ? (
                  <><Check className="mr-2 h-4 w-4" /> Gekopieerd!</>
                ) : (
                  <><Copy className="mr-2 h-4 w-4" /> Kopieer</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Elaborate Topic */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Breid Onderwerp Uit</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <p className="text-muted-foreground text-sm">Werk een specifiek onderwerp verder uit.</p>
              <div className="flex space-x-2">
                <Input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="Voer onderwerp in..."
                  className="flex-1"
                  disabled={loading}
                />
                <Button
                  onClick={handleTopicElaboration}
                  disabled={loading || !topicInput.trim()}
                  variant="secondary"
                  size="icon"
                  aria-label="Breid onderwerp uit"
                >
                  {loading && activeAction === 'elaborate-topic' ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <TextSearch className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Custom Refinement */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aangepaste Aanpassing</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <p className="text-muted-foreground text-sm">Geef een specifieke instructie.</p>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Bv: Focus op actiepunten..."
                className="text-sm"
                rows={2}
                disabled={loading}
              />
              <Button
                onClick={handleCustomRefinement}
                disabled={loading || !customPrompt.trim()}
                className="w-full"
                variant="secondary"
              >
                {loading && activeAction === 'custom' ? (
                  <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Bezig...</>
                ) : (
                  'Toepassen'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Removed Email Button Section */}

        </div>
      </CardContent>
    </Card>
  );
}
