import { InferenceClient } from "@huggingface/inference";
import { OpenAIClient } from "./openai.js";
import { GeminiClient } from "./gemini.js";

/**
 * Get the appropriate AI client based on the provider
 * 
 * @param {string} provider - The AI provider to use (openai, gemini, or a HuggingFace provider)
 * @param {string} token - The HuggingFace API token (only used for HF providers)
 * @returns {InferenceClient|OpenAIClient|GeminiClient} The appropriate client instance
 */
export function getAIClient(provider, token) {
  console.log(`Creating AI client for provider: ${provider}`);
  
  try {
    // Do basic validation
    if (!provider) {
      console.error("No provider specified");
      throw new Error("No AI provider specified");
    }
    
    switch (provider) {
      case "openai": {
        console.log("Initializing OpenAI client");
        if (!process.env.OPENAI_API_KEY) {
          console.error("Missing OpenAI API key");
          throw new Error("OpenAI API key is not configured");
        }
        return new OpenAIClient(process.env.OPENAI_API_KEY);
      }
      
      case "gemini": {
        console.log("Initializing Gemini client");
        if (!process.env.GEMINI_API_KEY) {
          console.error("Missing Gemini API key");
          throw new Error("Gemini API key is not configured");
        }
        return new GeminiClient(process.env.GEMINI_API_KEY);
      }
      
      default: {
        console.log(`Using HuggingFace InferenceClient with provider: ${provider}`);
        if (!token) {
          console.error("Missing HuggingFace token");
          throw new Error("HuggingFace token is required");
        }
        // Safe instantiation
        try {
          return new InferenceClient(token);
        } catch (err) {
          console.error("Failed to create InferenceClient:", err);
          throw new Error(`Failed to initialize HuggingFace client: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error creating client for provider ${provider}:`, error);
    throw error;
  }
} 