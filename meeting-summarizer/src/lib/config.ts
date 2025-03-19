// src/lib/config.ts

// Define whisper models
export const whisperModels = [
  {
    id: 'whisper-1',
    name: 'Whisper v1',
    description: 'Standaard model (Engels & Nederlands)',
    costPerMinute: 0.006
  }
];

// Define chat models with updated list and pricing
export const chatModels = [
  {
    id: 'o3-mini',
    name: 'O3-mini',
    description: 'Efficiënt en snel model (standaard)',
    inputCost: 0.000015,
    outputCost: 0.000060
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    description: 'Snel en kosteneffectief',
    inputCost: 0.000015,
    outputCost: 0.000060
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Meest capabele model',
    inputCost: 0.000050,
    outputCost: 0.000150
  }
];

// Default configuration
export const defaultConfig = {
  transcriptionModel: 'whisper-1',
  summarizationModel: 'o3-mini',
  temperature: 0.3,
  showCosts: false // Changed default to false
};