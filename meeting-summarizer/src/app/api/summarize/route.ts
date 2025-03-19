// src/app/api/summarize/route.ts

import { NextResponse } from 'next/server';
import openai from '@/lib/openai';
import { countTokens, calculateTextCost } from '@/lib/tokenCounter';
import { chatModels } from '@/lib/config';

export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Extract parameters
    const { text, model = 'o3-mini', temperature = 0.3 } = body;
    
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

    // Create an enhanced, detailed system prompt for meeting summaries
    const systemPrompt = `Je bent een expert in het maken van gedetailleerde vergadersamenvattingen voor professionele omgevingen. Maak een uitgebreide, feitelijke samenvatting van de transcriptie die ik je ga geven, met de volgende vereisten:

1. Gebruik actieve taal in plaats van passieve taal (bijv. "Jan legde uit dat..." in plaats van "Er werd uitgelegd dat...").
2. Identificeer deelnemers en hun standpunten wanneer deze duidelijk zijn uit de transcriptie.
3. Vermeld concrete beslissingen, actiepunten, en verantwoordelijken met deadlines indien genoemd.
4. Structureer de samenvatting met duidelijke secties en gebruik waar nodig opsommingstekens voor betere leesbaarheid.
5. Wees gedetailleerd en volledig - hoe langer de transcriptie, hoe uitgebreider de samenvatting moet zijn.
6. Vermijd hallucinations - neem alleen informatie op die daadwerkelijk in de transcriptie staat.
7. Geef belangrijke cijfers, metrics en specifieke voorbeelden die in de vergadering werden genoemd.
8. Als er tegenstrijdige standpunten waren, vermeld deze objectief.
9. Organiseer de belangrijkste onderwerpen chronologisch zoals ze in de vergadering aan bod kwamen.
10. Sluit af met een korte sectie "Genomen beslissingen" en indien van toepassing "Actiepunten" met verantwoordelijken.

Dit is een belangrijk zakelijk document dat gebruikt zal worden door mensen die niet bij de vergadering aanwezig waren, dus zorg ervoor dat het een volledige en nauwkeurige weergave is van wat er besproken is. Gebruik professionele, zakelijke taal.`;

    // Create the messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Hier is de transcriptie van een vergadering. Maak een gedetailleerde en complete samenvatting volgens de criteria in je instructies:\n\n${text}` }
    ];

    // Estimate token count before making the API call
    const combinedText = messages.map(m => m.content).join(' ');
    const inputTokenCount = countTokens(combinedText);

    // Handle very large input with chunking strategy if needed
    if (inputTokenCount > 15000) {
      console.log(`Large input detected: ${inputTokenCount} tokens. Using chunking strategy.`);
      // Implement chunking if needed - for now we'll proceed with the API call
    }

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages as any,
      temperature: temperature,
      max_tokens: 4096, // Allow for substantial summaries
    });

    // Extract summary from response
    const summary = response.choices[0].message.content || '';

    // Calculate costs
    const outputTokenCount = countTokens(summary);
    const cost = calculateTextCost(
      inputTokenCount,
      outputTokenCount,
      selectedModel.inputCost,
      selectedModel.outputCost
    );

    // Return the summary and usage info
    return NextResponse.json({
      summary,
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
    
    let errorMessage = 'Er is een fout opgetreden bij het genereren van de samenvatting';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('timeout')) {
        errorMessage = 'De aanvraag duurde te lang. Probeer een kleinere transcriptie of een ander model.';
        statusCode = 504;
      }
    }
    
    // Return error response
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}