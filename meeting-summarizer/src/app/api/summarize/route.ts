// src/app/api/summarize/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';
import { chatModels } from '@/lib/config';
// Removed marked import

export const maxDuration = 300; // 5 minutes timeout
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();

    // Extract parameters
    const { text, model = 'o3-mini', temperature = 0.3, prompt = '' } = body;

    // Validate request
    if (!text) {
      return NextResponse.json(
        { error: 'Geen tekst aangeleverd voor samenvatting' },
        { status: 400 }
      );
    }

    // Find the model details in the config
    const selectedModel = chatModels.find(m => m.id === model) ||
                          chatModels.find(m => m.id === 'o3-mini') ||
                          chatModels[0];

    // Use the provided prompt if available, otherwise fallback to default
    const meetingSummaryPrompt = prompt || `Je bent een expert in het samenvatten van vergaderingen. Maak een gedetailleerde en inzichtelijke samenvatting van de volgende transcriptie.

**Instructies:**
1.  **Focus op Inhoud:** Concentreer je uitsluitend op de informatie die daadwerkelijk in de transcriptie aanwezig is. **Vermeld NIET expliciet dat standaard vergaderinformatie (zoals datum, tijd, voorzitter, formele besluiten) ontbreekt.** Vat in plaats daarvan de inhoud, de belangrijkste discussiepunten en de flow van het gesprek samen.
2.  **Synthese en Interpretatie:** Identificeer de kernthema's en onderwerpen die besproken zijn. Leid impliciete overeenkomsten, conclusies of volgende stappen af die door de deelnemers worden genoemd, zelfs als ze niet formeel zijn vastgelegd.
3.  **Detail en Nuance:** Wees gedetailleerd. Extraheer specifieke voorbeelden, argumenten, cijfers en verschillende standpunten die tijdens de discussie naar voren komen. Ga dieper dan oppervlakkige vermeldingen.
4.  **Structuur:** Organiseer de samenvatting logisch rond de belangrijkste besproken onderwerpen of thema's. Gebruik duidelijke koppen en opsommingstekens voor leesbaarheid. Een chronologische volgorde is vaak nuttig, maar groepeer gerelateerde punten.
5.  **Taalgebruik:** Gebruik heldere, actieve taal. Wees objectief bij het weergeven van verschillende meningen.
6.  **Deelnemers:** Identificeer sprekers en hun bijdragen waar mogelijk.
7.  **Resultaten:** Sluit af met een duidelijke sectie voor **Belangrijkste Conclusies** (zowel expliciet als impliciet) en **Actiepunten** (indien genoemd, met eventuele verantwoordelijken).
8.  **Tabellen:** Als de transcriptie gegevens bevat die het beste in een tabel kunnen worden weergegeven (bijv. vergelijkingen, lijsten met eigenschappen), formatteer deze dan als een standaard Markdown-tabel. Zorg ervoor dat je de koptekstscheidingslijn (|---|---|...) opneemt.

**Vermijd:**
*   Hallucinaties of informatie die niet in de tekst staat.
*   Zinnen zoals "Niet vermeld in transcript", "Voorzitter onbekend", etc. Focus op wat er *wel* is.
*   Overdreven formaliteit als het gesprek informeel was.

Vat nu de volgende transcriptie samen:`;

    let summary = ''; // Raw Markdown summary from OpenAI
    const inputTokenCount = countTokens(text);

    // --- Get summary from OpenAI ---
    if (model === 'o3-mini') {
      // For o3-mini, strictly follow the documentation example format
      try {
        const response = await openai.responses.create({
          model: "o3-mini",
          input: [{ role: "user", content: `${meetingSummaryPrompt}\n\nHier is de transcriptie:\n\n${text}` }],
          text: { format: { type: "text" } }, reasoning: { effort: "medium" }, tools: [], store: true
        });
        summary = response.output_text || '';
      } catch (innerError) {
        console.error("First attempt failed:", innerError);
        try {
          const response = await openai.responses.create({
            model: "o3-mini", input: [], instructions: `${meetingSummaryPrompt}\n\nHier is de transcriptie:\n\n${text}`,
            text: { format: { type: "text" } }, reasoning: { effort: "medium" }, tools: [], store: true
          });
          summary = response.output_text || '';
        } catch (secondError) {
          console.error("Second attempt failed:", secondError);
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [ { role: 'system', content: meetingSummaryPrompt }, { role: 'user', content: `Hier is de transcriptie van een vergadering:\n\n${text}` } ],
            temperature: 0.3
          });
          summary = response.choices[0].message.content || '';
        }
      }
    } else {
      // Standard chat completion API for other models
      const response = await openai.chat.completions.create({
        model: model,
        messages: [ { role: 'system', content: meetingSummaryPrompt }, { role: 'user', content: `Hier is de transcriptie van een vergadering:\n\n${text}` } ],
        temperature: temperature
      });
      summary = response.choices[0].message.content || '';
    }
    // --- End Get summary from OpenAI ---

    // --- REMOVED Markdown to HTML Conversion ---

    // Calculate costs based on raw summary tokens
    const outputTokenCount = countTokens(summary);
    const cost = calculateTextCost(
      inputTokenCount, outputTokenCount, selectedModel.inputCost, selectedModel.outputCost
    );

    // Return ONLY raw Markdown summary and usage info
    return NextResponse.json({
      summary: summary, // Original Markdown
      usage: {
        model: selectedModel.name,
        inputTokens: inputTokenCount,
        outputTokens: outputTokenCount,
        totalTokens: inputTokenCount + outputTokenCount,
        cost
      }
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    // Error handling remains the same
    if (error instanceof Error) { /* ... */ }
    let errorMessage = 'Er is een fout opgetreden bij het genereren van de samenvatting';
    let statusCode = 500;
    if (error instanceof Error) { /* ... */ }
    return new Response( JSON.stringify({ error: errorMessage, suggestion: "Probeer gpt-4o-mini als alternatief, dat werkt betrouwbaarder." }), { status: statusCode, headers: { 'Content-Type': 'application/json' } } );
  }
}
