export class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    console.log("OpenAIClient initialized, API key present:", !!apiKey);
  }

  // New method for non-streaming HTML generation
  async chatCompletion({ messages, model = "gpt-4o" }) {
    console.log(`OpenAIClient: Starting non-streaming chat completion with model: ${model}`);
    
    if (!this.apiKey) {
      const error = new Error("OpenAI API key is not set");
      console.error("OpenAIClient error:", error.message);
      throw error;
    }

    try {
      console.log("OpenAIClient: Messages count for non-streaming:", messages.length);
      
      const requestBody = {
        model: model,
        messages: messages,
        stream: false, // Non-streaming request
        max_tokens: 4000 // Ensure we get a complete response
      };
      
      console.log("OpenAIClient: Request body prepared for non-streaming");
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`OpenAIClient: Non-streaming response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = "";
        try {
          const errorData = await response.json();
          errorText = JSON.stringify(errorData);
          console.error("OpenAIClient API error response:", errorData);
        } catch (e) {
          errorText = await response.text();
          console.error("OpenAIClient error response text:", errorText);
        }
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      console.log("OpenAIClient: Successfully obtained complete response");
      
      if (!responseData.choices || responseData.choices.length === 0) {
        throw new Error("OpenAI API returned empty choices");
      }
      
      const content = responseData.choices[0]?.message?.content || "";
      
      // Log a preview of the content
      if (content) {
        const preview = content.length > 100 ? content.substring(0, 100) + "..." : content;
        console.log(`OpenAIClient: Complete response preview: ${preview}`);
        console.log(`OpenAIClient: Total response length: ${content.length} chars`);
        
        // Clean the content by removing markdown code blocks
        let cleanedContent = this.cleanMarkdownCodeBlocks(content);
        console.log(`OpenAIClient: Content cleaned, new length: ${cleanedContent.length} chars`);
        
        return cleanedContent;
      } else {
        console.log("OpenAIClient: Received empty content");
      }
      
      return content;
    } catch (error) {
      console.error("OpenAIClient chatCompletion error:", error);
      console.error("Error stack:", error.stack);
      throw error;
    }
  }

  async chatCompletionStream({ messages, model = "gpt-4o" }) {
    console.log(`OpenAIClient: Starting chat completion with model: ${model}`);
    
    if (!this.apiKey) {
      const error = new Error("OpenAI API key is not set");
      console.error("OpenAIClient error:", error.message);
      throw error;
    }

    try {
      console.log("OpenAIClient: Messages count:", messages.length);
      
      const requestBody = {
        model: model,
        messages: messages,
        stream: true
      };
      
      console.log("OpenAIClient: Request body prepared");
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`OpenAIClient: Response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = "";
        try {
          const errorData = await response.json();
          errorText = JSON.stringify(errorData);
          console.error("OpenAIClient API error response:", errorData);
        } catch (e) {
          errorText = await response.text();
          console.error("OpenAIClient error response text:", errorText);
        }
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("OpenAI API returned no response body");
      }

      console.log("OpenAIClient: Successfully obtained response stream");
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
              console.log(`OpenAIClient: Stream complete. Processed ${this.chunkCount} chunks, ${this.totalProcessed} bytes`);
              return { done: true };
            }
            
            const chunk = decoder.decode(value, { stream: true });
            this.chunkCount++;
            this.totalProcessed += chunk.length;
            
            if (this.chunkCount % 10 === 0) {
              console.log(`OpenAIClient: Processed ${this.chunkCount} chunks so far`);
            }
            
            const lines = chunk.split("\n").filter(line => line.trim() !== "");
            let content = "";
            
            for (const line of lines) {
              if (line.includes("data: [DONE]")) {
                console.log("OpenAIClient: Received [DONE] marker");
                return { done: true };
              }
              
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  const chunkContent = data.choices[0]?.delta?.content || "";
                  content += chunkContent;
                } catch (e) {
                  console.error("OpenAIClient: Error parsing chunk:", e.message);
                  console.error("OpenAIClient: Problematic line:", line);
                }
              }
            }
            
            // Only log if there's actual content
            if (content) {
              this.lastChunk = content;
              const preview = content.length > 30 ? content.substring(0, 30) + "..." : content;
              console.log(`OpenAIClient: Chunk #${this.chunkCount} content preview: ${preview}`);
            } else if (chunk) {
              console.log(`OpenAIClient: Received empty content chunk, raw length: ${chunk.length}`);
              if (chunk.length < 50) {
                console.log(`OpenAIClient: Raw chunk: ${chunk}`);
              } else {
                console.log(`OpenAIClient: Raw chunk preview: ${chunk.substring(0, 50)}...`);
              }
            }
            
            return { 
              done: false, 
              value: { choices: [{ delta: { content } }] } 
            };
          } catch (error) {
            console.error("OpenAIClient iterator error:", error);
            throw error;
          }
        }
      };
      
      return iterator;
    } catch (error) {
      console.error("OpenAIClient chatCompletionStream error:", error);
      console.error("Error stack:", error.stack);
      throw error;
    }
  }

  // Helper method to clean markdown code blocks from the response
  cleanMarkdownCodeBlocks(content) {
    console.log("OpenAIClient: Cleaning markdown code blocks from response");
    
    // Check if the content starts with a code block
    if (content.trim().startsWith("```")) {
      console.log("OpenAIClient: Content starts with a code block");
      
      // If it's a code block with html tag, remove the first line
      // Example: ```html
      if (content.trim().startsWith("```html")) {
        console.log("OpenAIClient: Removing ```html tag");
        // Get the index of the first newline
        const firstNewline = content.indexOf('\n');
        if (firstNewline !== -1) {
          content = content.substring(firstNewline + 1);
        }
      } else if (content.trim().match(/^```(\w*)$/m)) {
        // For any other language tags like ```javascript, remove the first line
        console.log("OpenAIClient: Removing language tag line");
        const firstNewline = content.indexOf('\n');
        if (firstNewline !== -1) {
          content = content.substring(firstNewline + 1);
        }
      }
      
      // Remove the closing code block marker if it exists
      if (content.includes("```")) {
        console.log("OpenAIClient: Removing closing code block marker");
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