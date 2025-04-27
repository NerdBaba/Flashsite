export class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    console.log("GeminiClient initialized, API key present:", !!apiKey);
  }

  async chatCompletionStream({ messages, model = "gemini-1.5-flash" }) {
    console.log(`GeminiClient: Starting chat completion with model: ${model}`);
    
    if (!this.apiKey) {
      const error = new Error("Gemini API key is not set");
      console.error("GeminiClient error:", error.message);
      throw error;
    }

    try {
      // Using the OpenAI compatibility endpoint for easier interoperability
      console.log("GeminiClient: Using OpenAI compatibility endpoint");
      console.log("GeminiClient: Messages count:", messages.length);
      
      // Determine appropriate max_tokens based on model
      let maxTokens = 8192; // Default for most models (2.0 Flash, Gemma 3, etc.)
      
      if (model.includes("2.5") && (model.includes("flash") || model.includes("pro"))) {
        // Gemini 2.5 Flash and 2.5 Pro have 65,536 token output limit
        maxTokens = 65536;
      }
      
      const requestBody = {
        model: model,
        messages: messages,
        stream: true,
        max_tokens: maxTokens
      };
      
      console.log(`GeminiClient: Using max_tokens=${maxTokens} for model ${model}`);
      
      console.log("GeminiClient: Request body prepared");
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`GeminiClient: Response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = "";
        try {
          const errorData = await response.json();
          errorText = JSON.stringify(errorData);
          console.error("GeminiClient API error response:", errorData);
        } catch (e) {
          errorText = await response.text();
          console.error("GeminiClient error response text:", errorText);
        }
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Gemini API returned no response body");
      }

      console.log("GeminiClient: Successfully obtained response stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let iterator = {
        lastChunk: "",
        chunkCount: 0,
        totalProcessed: 0,
        
        async next() {
          try {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`GeminiClient: Stream complete. Processed ${this.chunkCount} chunks, ${this.totalProcessed} bytes`);
              return { done: true };
            }
            
            const chunk = decoder.decode(value, { stream: true });
            this.chunkCount++;
            this.totalProcessed += chunk.length;
            
            if (this.chunkCount % 10 === 0) {
              console.log(`GeminiClient: Processed ${this.chunkCount} chunks so far`);
            }
            
            const lines = chunk.split("\n").filter(line => line.trim() !== "");
            let content = "";
            
            for (const line of lines) {
              if (line.includes("data: [DONE]")) {
                console.log("GeminiClient: Received [DONE] marker");
                return { done: true };
              }
              
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  const chunkContent = data.choices[0]?.delta?.content || "";
                  content += chunkContent;
                } catch (e) {
                  console.error("GeminiClient: Error parsing chunk:", e.message);
                  console.error("GeminiClient: Problematic line:", line);
                }
              }
            }
            
            // Only log if there's actual content
            if (content) {
              this.lastChunk = content;
              const preview = content.length > 30 ? content.substring(0, 30) + "..." : content;
              console.log(`GeminiClient: Chunk #${this.chunkCount} content preview: ${preview}`);
            } else if (chunk) {
              console.log(`GeminiClient: Received empty content chunk, raw length: ${chunk.length}`);
              console.log(`GeminiClient: Raw chunk preview: ${chunk.substring(0, 50)}...`);
            }
            
            return { 
              done: false, 
              value: { choices: [{ delta: { content } }] } 
            };
          } catch (error) {
            console.error("GeminiClient iterator error:", error);
            throw error;
          }
        }
      };
      
      return iterator;
    } catch (error) {
      console.error("GeminiClient chatCompletionStream error:", error);
      console.error("Error stack:", error.stack);
      throw error;
    }
  }

  // Alternative implementation using Gemini's native API
  async _nativeGeminiStream(messages, model) {
    try {
      console.log(`GeminiClient native: Starting with model ${model}`);
      // Convert our message format to Gemini format
      const geminiMessages = messages.map(msg => ({
        role: msg.role === "assistant" ? "model" : msg.role,
        parts: [{ text: msg.content }]
      }));

      console.log("GeminiClient native: Messages transformed to Gemini format");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7
          }
        })
      });

      console.log(`GeminiClient native: Response status: ${response.status}`);
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          console.error("GeminiClient native API error:", errorData);
        } catch (e) {
          const text = await response.text();
          console.error("GeminiClient native raw error response:", text);
          errorData = { error: "Failed to parse error response", text };
        }
        throw new Error(`Gemini API Error: ${JSON.stringify(errorData)}`);
      }

      console.log("GeminiClient native: Successfully obtained response stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let iterator = {
        chunkCount: 0,
        
        async next() {
          try {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`GeminiClient native: Stream complete after ${this.chunkCount} chunks`);
              return { done: true };
            }
            
            this.chunkCount++;
            const chunk = decoder.decode(value);
            console.log(`GeminiClient native: Processing chunk #${this.chunkCount}`);
            
            try {
              const data = JSON.parse(chunk);
              const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              if (content) {
                const preview = content.length > 30 ? content.substring(0, 30) + "..." : content;
                console.log(`GeminiClient native: Content preview: ${preview}`);
              } else {
                console.log(`GeminiClient native: Empty content in chunk #${this.chunkCount}`);
              }
              
              return { 
                done: false, 
                value: { choices: [{ delta: { content } }] } 
              };
            } catch (e) {
              // Handle non-JSON chunks from stream
              console.error("GeminiClient native: Error parsing chunk:", e.message);
              console.error("GeminiClient native: Raw chunk preview:", chunk.substring(0, 100));
              return { done: false, value: { choices: [{ delta: { content: "" } }] } };
            }
          } catch (error) {
            console.error("GeminiClient native iterator error:", error);
            throw error;
          }
        }
      };
      
      return iterator;
    } catch (error) {
      console.error("GeminiClient _nativeGeminiStream error:", error);
      console.error("Error stack:", error.stack);
      throw error;
    }
  }

  // New method to get complete HTML response at once
  async chatCompletion({ messages, model = "gemini-1.5-flash" }) {
    console.log(`GeminiClient: Starting non-streaming chat completion with model: ${model}`);
    
    if (!this.apiKey) {
      const error = new Error("Gemini API key is not set");
      console.error("GeminiClient error:", error.message);
      throw error;
    }

    try {
      console.log("GeminiClient: Using non-streaming OpenAI compatibility endpoint");
      console.log("GeminiClient: Messages count:", messages.length);
      
      // Determine appropriate max_tokens based on model
      let maxTokens = 8192; // Default for most models (2.0 Flash, Gemma 3, etc.)
      
      if (model.includes("2.5") && (model.includes("flash") || model.includes("pro"))) {
        // Gemini 2.5 Flash and 2.5 Pro have 65,536 token output limit
        maxTokens = 65536;
      }
      
      console.log(`GeminiClient: Using max_tokens=${maxTokens} for model ${model}`);
      
      const requestBody = {
        model: model,
        messages: messages,
        stream: false, // Non-streaming request
        max_tokens: maxTokens
      };
      
      console.log("GeminiClient: Request body prepared for non-streaming request");
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`GeminiClient: Non-streaming response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = "";
        try {
          const errorData = await response.json();
          errorText = JSON.stringify(errorData);
          console.error("GeminiClient API error response:", errorData);
        } catch (e) {
          errorText = await response.text();
          console.error("GeminiClient error response text:", errorText);
        }
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      console.log("GeminiClient: Successfully obtained complete response");
      
      if (!responseData.choices || responseData.choices.length === 0) {
        throw new Error("Gemini API returned empty choices");
      }
      
      const content = responseData.choices[0]?.message?.content || "";
      
      // Log a preview of the content
      if (content) {
        const preview = content.length > 100 ? content.substring(0, 100) + "..." : content;
        console.log(`GeminiClient: Complete response preview: ${preview}`);
        console.log(`GeminiClient: Total response length: ${content.length} chars`);
        
        // Clean the content by removing markdown code blocks
        let cleanedContent = this.cleanMarkdownCodeBlocks(content);
        console.log(`GeminiClient: Content cleaned, new length: ${cleanedContent.length} chars`);
        
        return cleanedContent;
      } else {
        console.log("GeminiClient: Received empty content");
      }
      
      return content;
    } catch (error) {
      console.error("GeminiClient chatCompletion error:", error);
      console.error("Error stack:", error.stack);
      throw error;
    }
  }

  // Helper method to clean markdown code blocks from the response
  cleanMarkdownCodeBlocks(content) {
    console.log("GeminiClient: Cleaning markdown code blocks from response");
    
    // Check if the content starts with a code block
    if (content.trim().startsWith("```")) {
      console.log("GeminiClient: Content starts with a code block");
      
      // If it's a code block with html tag, remove the first line
      // Example: ```html
      if (content.trim().startsWith("```html")) {
        console.log("GeminiClient: Removing ```html tag");
        // Get the index of the first newline
        const firstNewline = content.indexOf('\n');
        if (firstNewline !== -1) {
          content = content.substring(firstNewline + 1);
        }
      } else if (content.trim().match(/^```(\w*)$/m)) {
        // For any other language tags like ```javascript, remove the first line
        console.log("GeminiClient: Removing language tag line");
        const firstNewline = content.indexOf('\n');
        if (firstNewline !== -1) {
          content = content.substring(firstNewline + 1);
        }
      }
      
      // Remove the closing code block marker if it exists
      if (content.includes("```")) {
        console.log("GeminiClient: Removing closing code block marker");
        content = content.replace(/```\s*$/g, "");
      }
    }
    
    // Handle cases where there are multiple code blocks or nested structures
    // For example: ```html\n<!DOCTYPE html>\n...\n```
    content = content.replace(/```html\n/g, "");
    content = content.replace(/```\n/g, "");
    content = content.replace(/```$/gm, "");
    
    // Also remove any leading/trailing backticks that might be leftover
    content = content.replace(/^```/gm, "");
    content = content.replace(/```$/gm, "");
    
    return content;
  }
} 