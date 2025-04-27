export const PROVIDERS = {
  "fireworks-ai": {
    name: "Fireworks AI",
    max_tokens: 131_000,
    id: "fireworks-ai",
  },
  openai: {
    name: "OpenAI",
    max_tokens: 128_000,
    id: "openai",
    models: [
      "gpt-4.1",
      "gpt-4o",
      "gpt-4o-audio-preview",
      "chatgpt-4o-latest",
      "o4-mini",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "o3-mini",
      "gpt-4o-mini",
      "gpt-4o-mini-audio-preview"
    ],
    defaultModel: "o3-mini"
  },
  gemini: {
    name: "Google Gemini",
    max_tokens: 100_000,
    id: "gemini",
    models: [
      "gemini-2.5-flash-preview-04-17",
      "gemini-2.5-pro-exp-03-25",
      "gemini-2.0-flash",
      "gemini-2.0-pro-exp-02-05",
      "gemini-2.0-flash-thinking-exp-01-21",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-embedding-exp",
      "gemini-2.0-flash-live-001",
      "gemma-3-27b-it"
    ],
    defaultModel: "gemini-2.0-flash"
  },
  nebius: {
    name: "Nebius AI Studio",
    max_tokens: 131_000,
    id: "nebius",
  },
  sambanova: {
    name: "SambaNova",
    max_tokens: 8_000,
    id: "sambanova",
  },
  novita: {
    name: "NovitaAI",
    max_tokens: 16_000,
    id: "novita",
  },
  // hyperbolic: {
  //   name: "Hyperbolic",
  //   max_tokens: 131_000,
  //   id: "hyperbolic",
  // },
};
