'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose, // Keep DialogClose if you want an explicit close button besides the 'X'
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Edit, Eye, Send, RotateCw, Plus, X as IconX } from 'lucide-react'; // Import icons

// Removed MotionDiv definition

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string; // Expect raw Markdown summary ONLY
  // Removed summaryHtml
  transcription?: string;
  onSendEmail: (success: boolean, message: string) => void;
}

// REMOVED extractTextFromHtml function

export default function EmailModal({
  isOpen,
  onClose,
  summary, // Expect raw Markdown summary ONLY
  // Removed summaryHtml
  transcription = '',
  onSendEmail
}: EmailModalProps) {
  const [emailContent, setEmailContent] = useState<string>('');
  const [recipients, setRecipients] = useState<string>('');
  const [emailList, setEmailList] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState<string>('');
  const [subject, setSubject] = useState<string>('Vergaderingsamenvatting');
  const [additionalMessage, setAdditionalMessage] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [isFormatting, setIsFormatting] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null); // Keep ref for potential future use, though Dialog handles outside click

  // Format the summary as an email using the API or fallback
  const formatAsEmail = useCallback(async () => {
    setIsFormatting(true);
    setError(null);

    try {
      // Try refining via API using RAW MARKDOWN summary
      if (transcription && transcription.trim() !== '' && summary && summary.trim() !== '') {
        const response = await fetch('/api/refine-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: summary, // Use raw Markdown summary
            transcript: transcription,
            action: 'email-format'
          })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || `API fout bij formatteren (${response.status})`);
        }
        // Assuming the API returns plain text suitable for email
        setEmailContent(data.refinedSummary);
        setIsFormatting(false);
        return; // Exit if successful
      }

      // Fallback: Use raw Markdown summary directly
      const formattedEmail = `Beste collega,

Hierbij de samenvatting van onze recente vergadering:

${summary.trim()} // Use raw summary

Met vriendelijke groet,
${senderName || 'Super Kees Online'}`;

      setEmailContent(formattedEmail);

    } catch (error) {
      console.error('Error formatting email:', error);
      setError(error instanceof Error ? error.message : 'Er is een fout opgetreden bij het formatteren van de e-mail');
      // Fallback to raw summary if formatting fails
      setEmailContent(summary);
    } finally {
      setIsFormatting(false);
    }
  // Depend only on raw summary now
  }, [summary, transcription, senderName]);

  // Effect to format summary as email when modal opens or summary changes
  useEffect(() => {
    if (isOpen && summary) {
      // Set initial content quickly, then format
      setEmailContent(summary); // Show raw summary initially
      formatAsEmail(); // Attempt API formatting
    } else if (!isOpen) {
       // Reset state when modal closes
       setEmailContent(''); setRecipients(''); setSubject('Vergaderingsamenvatting');
       setAdditionalMessage(''); setSenderName(''); setIsPreview(false); setError(null); setEmailList([]); setNewEmail(''); // Also reset email list and new email input
    }
  // Depend only on raw summary now
  }, [isOpen, summary, formatAsEmail]);

  // Other useEffects and handlers remain the same...
  useEffect(() => { if (recipients.trim()) { const emails = recipients.split(',').map(email => email.trim()).filter(email => email); setEmailList(emails); } else { setEmailList([]); } }, [recipients]);
  useEffect(() => { setRecipients(emailList.join(', ')); }, [emailList]);
  // Removed useEffect for outside click (Dialog handles this)
  // Removed useEffect for body overflow (Dialog handles this)
  const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const handleAddEmail = () => { if (!newEmail.trim()) return; if (!validateEmail(newEmail)) { setError('Het e-mailadres is ongeldig'); return; } if (emailList.includes(newEmail.trim())) { setError('Dit e-mailadres is al toegevoegd'); return; } setEmailList([...emailList, newEmail.trim()]); setNewEmail(''); setError(null); };
  const handleRemoveEmail = (emailToRemove: string) => setEmailList(emailList.filter(email => email !== emailToRemove));
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail(); } };
  const handleSendEmail = async () => {
    if (emailList.length === 0) { setError('Voer ten minste één e-mailadres in'); return; }
    if (!subject.trim()) { setError('Voer een onderwerp in'); return; }
    setIsSending(true); setError(null);
    try {
      const response = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: emailList, subject, content: emailContent, senderName: senderName.trim() || undefined, additionalMessage: additionalMessage.trim() || undefined }) });
      const data = await response.json(); if (!response.ok || data.error) { throw new Error(data.error || `Verzenden mislukt (${response.status})`); }
      const recipientMessage = emailList.length > 1 ? `E-mail succesvol verzonden naar ${emailList.length} ontvangers` : `E-mail succesvol verzonden naar ${emailList[0]}`;
      onSendEmail(true, data.message || recipientMessage); onClose();
    } catch (error) { console.error('Error sending email:', error); const errorMessage = error instanceof Error ? error.message : 'Er is een fout opgetreden bij het verzenden van de e-mail'; setError(errorMessage); onSendEmail(false, errorMessage); } // Corrected error message variable
    finally { setIsSending(false); }
  };

  // Removed isOpen check, Dialog handles visibility

  // --- RENDER LOGIC --- (Using Shadcn Dialog)
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isPreview ? 'Voorbeeld van e-mail' : 'Verstuur samenvatting via e-mail'}
          </DialogTitle>
          <DialogDescription>
            {isPreview ? 'Controleer de e-mail voordat je verzendt.' : 'Voer de details in om de samenvatting te verzenden.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content Area */}
        <div className="p-1 pr-3 overflow-y-auto flex-grow space-y-4">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {isPreview ? (
            // Preview Mode
            <div className="bg-muted/50 rounded-lg p-4 border space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Van:</span>
                <span>Super Kees Online{senderName ? ` (${senderName})` : ''}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Aan:</span>
                <span className="text-right break-all">{emailList.length > 0 ? emailList.join(', ') : '[Geen ontvangers]'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Onderwerp:</span>
                <span className="font-medium">{subject}</span>
              </div>
              {additionalMessage && (
                <div className="p-3 bg-primary/10 border-l-4 border-primary text-primary-foreground rounded-r-lg whitespace-pre-wrap">
                  {additionalMessage}
                </div>
              )}
              <div className="whitespace-pre-wrap pt-2">
                {emailContent}
              </div>
            </div>
          ) : (
            // Edit Mode
            <>
              {/* Recipients Input */}
              <div className="space-y-2">
                <Label htmlFor="recipients-input">Ontvangers</Label>
                <div className="flex gap-2">
                  <Input
                    id="recipients-input"
                    type="email" // Use email type for better mobile keyboards
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Voer een e-mailadres in"
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleAddEmail} variant="secondary">
                    <Plus className="h-4 w-4 mr-1" /> Toevoegen
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {emailList.map((email, index) => (
                    <div key={index} className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full flex items-center text-xs">
                      <span>{email}</span>
                      <button onClick={() => handleRemoveEmail(email)} className="ml-1.5 text-muted-foreground hover:text-foreground" aria-label={`Verwijder ${email}`}>
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Voeg meerdere e-mailadressen toe.</p>
              </div>

              {/* Subject Input */}
              <div className="space-y-2">
                <Label htmlFor="subject-input">Onderwerp</Label>
                <Input
                  id="subject-input"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Onderwerp van de e-mail"
                />
              </div>

              {/* Additional Message Textarea */}
              <div className="space-y-2">
                <Label htmlFor="message-input">Persoonlijke boodschap (optioneel)</Label>
                <Textarea
                  id="message-input"
                  value={additionalMessage}
                  onChange={(e) => setAdditionalMessage(e.target.value)}
                  placeholder="Voeg een persoonlijke boodschap toe..."
                  rows={3}
                />
              </div>

              {/* Sender Name Input */}
              <div className="space-y-2">
                <Label htmlFor="sender-name-input">Je naam (optioneel)</Label>
                <Input
                  id="sender-name-input"
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Je naam (voor de groet)"
                />
              </div>

              {/* Email Content Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="content-input">E-mailinhoud</Label>
                  <Button variant="link" size="sm" onClick={formatAsEmail} disabled={isFormatting} className="text-xs h-auto p-0">
                    {isFormatting ? (
                      <><Loader2 className="animate-spin mr-1 h-3 w-3" /> Formatteren...</>
                    ) : (
                      <><RotateCw className="mr-1 h-3 w-3" /> Opnieuw formatteren</>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="content-input"
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  rows={10} // Adjusted rows
                  className="min-h-[150px]" // Ensure min height
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setIsPreview(!isPreview)}>
            {isPreview ? (
              <><Edit className="mr-2 h-4 w-4" /> Bewerken</>
            ) : (
              <><Eye className="mr-2 h-4 w-4" /> Voorbeeld</>
            )}
          </Button>
          <DialogClose asChild>
            <Button variant="ghost">Annuleren</Button>
          </DialogClose>
          <Button onClick={handleSendEmail} disabled={isSending || emailList.length === 0}>
            {isSending ? (
              <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Verzenden...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Versturen naar {emailList.length}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
