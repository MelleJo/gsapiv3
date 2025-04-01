// src/app/components/FinalScreen.tsx
'use client';

import { useState } from 'react';
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; // Added CardFooter
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Settings, Mail, RotateCcw, FileText, Trash2 } from 'lucide-react'; // Import icons
import SummaryDisplay from './SummaryDisplay';
import SummaryActions from './SummaryActions';

// Removed MotionDiv definition

interface FinalScreenProps {
  summary: string; // Only raw summary prop needed
  // Removed summaryHtml
  transcription: string;
  audioFileName: string;
  isSummarizing: boolean;
  isTranscribing: boolean;
  transcriptionInfo: {
    chunked: boolean;
    chunks: number;
  };
  onRefinedSummary: (refinedSummary: string) => void;
  onOpenEmailModal: () => void;
  onReset: () => void;
  onToggleSettings: () => void;
  onRegenerateSummary: () => void;
  onRegenerateTranscript: () => void;
}

export default function FinalScreen({
  summary, // Only raw summary prop needed
  // Removed summaryHtml
  transcription,
  audioFileName,
  isSummarizing,
  isTranscribing,
  transcriptionInfo,
  onRefinedSummary,
  onOpenEmailModal,
  onReset,
  onToggleSettings,
  onRegenerateSummary,
  onRegenerateTranscript
}: FinalScreenProps) {
  // Removed showTranscript state, Accordion handles its own state

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle>Verwerking Voltooid</CardTitle>
          <CardDescription>Bestand: {audioFileName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row justify-between items-center gap-4">
           <p className="text-sm text-muted-foreground">Hier is uw samenvatting en transcriptie.</p>
           <Button variant="outline" size="icon" onClick={onToggleSettings} aria-label="Instellingen">
             <Settings className="h-4 w-4" />
           </Button>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Samenvatting</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Pass only summary */}
          <SummaryDisplay summary={summary} isLoading={isSummarizing} />
        </CardContent>
        {/* Summary actions integrated into Footer */}
        {summary && !isSummarizing && (
          <CardFooter className="flex flex-wrap gap-2 justify-end">
             {/* Integrate SummaryActions directly or replicate buttons */}
             <Button variant="ghost" onClick={onOpenEmailModal}>
               <Mail className="mr-2 h-4 w-4" /> E-mail Samenvatting
             </Button>
             {/* Add refine/edit button if needed from SummaryActions */}
          </CardFooter>
        )}
      </Card>


      {/* Transcription Accordion */}
      {transcription && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>Bekijk Transcriptie</AccordionTrigger>
            <AccordionContent>
              <Card className="mt-4">
                <CardContent className="p-4 max-h-96 overflow-y-auto text-sm bg-muted/30 rounded-md">
                  <pre className="whitespace-pre-wrap font-sans">{transcription}</pre>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Action Buttons Card */}
      <Card>
        <CardHeader>
          <CardTitle>Acties</CardTitle>
          <CardDescription>Wat wilt u nu doen?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-4">
          <Button variant="outline" onClick={onRegenerateSummary} disabled={isSummarizing || isTranscribing}>
            <RotateCcw className="mr-2 h-4 w-4" /> Samenvatting Opnieuw Genereren
          </Button>
          <Button variant="outline" onClick={onRegenerateTranscript} disabled={isSummarizing || isTranscribing}>
            <FileText className="mr-2 h-4 w-4" /> Transcriptie Opnieuw Genereren
          </Button>
          <Button variant="destructive" onClick={onReset}>
            <Trash2 className="mr-2 h-4 w-4" /> Opnieuw Beginnen
          </Button>
        </CardContent>
      </Card>

      {/* Removed style jsx global */}
    </div>
  );
}
