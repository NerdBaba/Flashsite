import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import {
  createRepo,
  uploadFiles,
  whoAmI,
  spaceInfo,
  fileExists,
} from "@huggingface/hub";
import { InferenceClient } from "@huggingface/inference";
import bodyParser from "body-parser";

import checkUser from "./middlewares/checkUser.js";
import { PROVIDERS } from "./utils/providers.js";
import { COLORS } from "./utils/colors.js";
import { getAIClient } from "./utils/api-clients/index.js";

// Load environment variables from .env file
dotenv.config();

const app = express();

const ipAddresses = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.APP_PORT || 3000;
const REDIRECT_URI =
  process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/login`;
const MODEL_ID = "deepseek-ai/DeepSeek-V3-0324";
const MAX_REQUESTS_PER_IP = 2;

// Create a basic request logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Essential middleware setup - ordering is important
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "dist")));

// Standard body parser for JSON - less complex than the custom one we added
app.use(bodyParser.json({
  limit: '10mb', // Allow large HTML bodies
}));

// Log parsed request bodies
app.use((req, res, next) => {
  if (req.method === 'POST' && req.body) {
    // Avoid logging entire HTML content
    const logBody = { ...req.body };
    
    if (logBody.html && typeof logBody.html === 'string') {
      logBody.html = `[HTML: ${logBody.html.length} chars]`;
    }
    
    if (logBody.prompt && typeof logBody.prompt === 'string' && logBody.prompt.length > 200) {
      logBody.prompt = logBody.prompt.substring(0, 200) + '...';
    }
    
    console.log('Parsed request body:', JSON.stringify(logBody, null, 2));
  }
  next();
});

const getPTag = (repoId) => {
  return `<p style="border-radius: 8px; text-align: center; font-size: 12px; color: #fff; margin-top: 16px;position: fixed; left: 8px; bottom: 8px; z-index: 10; background: rgba(0, 0, 0, 0.8); padding: 4px 8px;">Made with <img src="https://enzostvs-deepsite.hf.space/logo.svg" alt="DeepSite Logo" style="width: 16px; height: 16px; vertical-align: middle;display:inline-block;margin-right:3px;filter:brightness(0) invert(1);"><a href="https://enzostvs-deepsite.hf.space" style="color: #fff;text-decoration: underline;" target="_blank" >DeepSite</a> - 🧬 <a href="https://enzostvs-deepsite.hf.space?remix=${repoId}" style="color: #fff;text-decoration: underline;" target="_blank" >Remix</a></p>`;
};

// API Routes
app.get("/api/login", (_req, res) => {
  const redirectUrl = `https://huggingface.co/oauth/authorize?client_id=${process.env.OAUTH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid%20profile%20write-repos%20manage-repos%20inference-api&prompt=consent&state=1234567890`;
  res.status(200).send({
    ok: true,
    redirectUrl,
  });
});

// Add a simple health check route to verify the server is working
app.get("/api/health", (_req, res) => {
  res.status(200).send({
    ok: true,
    timestamp: new Date().toISOString(),
    providers: Object.keys(PROVIDERS)
  });
});

app.get("/auth/login", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(302, "/");
  }
  const Authorization = `Basic ${Buffer.from(
    `${process.env.OAUTH_CLIENT_ID}:${process.env.OAUTH_CLIENT_SECRET}`
  ).toString("base64")}`;

  const request_auth = await fetch("https://huggingface.co/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const response = await request_auth.json();

  if (!response.access_token) {
    return res.redirect(302, "/");
  }

  res.cookie("hf_token", response.access_token, {
    httpOnly: false,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.redirect(302, "/");
});

app.get("/auth/logout", (req, res) => {
  res.clearCookie("hf_token", {
    httpOnly: false,
    secure: true,
    sameSite: "none",
  });
  return res.redirect(302, "/");
});

app.get("/api/@me", checkUser, async (req, res) => {
  let { hf_token } = req.cookies;

  if (process.env.HF_TOKEN && process.env.HF_TOKEN !== "") {
    return res.send({
      preferred_username: "local-use",
      isLocalUse: true,
    });
  }

  try {
    const request_user = await fetch("https://huggingface.co/oauth/userinfo", {
      headers: {
        Authorization: `Bearer ${hf_token}`,
      },
    });

    const user = await request_user.json();
    res.send(user);
  } catch (err) {
    res.clearCookie("hf_token", {
      httpOnly: false,
      secure: true,
      sameSite: "none",
    });
    res.status(401).send({
      ok: false,
      message: err.message,
    });
  }
});

app.post("/api/deploy", checkUser, async (req, res) => {
  const { html, title, path, prompts } = req.body;
  if (!html || (!path && !title)) {
    return res.status(400).send({
      ok: false,
      message: "Missing required fields",
    });
  }

  let { hf_token } = req.cookies;
  if (process.env.HF_TOKEN && process.env.HF_TOKEN !== "") {
    hf_token = process.env.HF_TOKEN;
  }

  try {
    const repo = {
      type: "space",
      name: path ?? "",
    };

    let readme;
    let newHtml = html;

    if (!path || path === "") {
      const { name: username } = await whoAmI({ accessToken: hf_token });
      const newTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .split("-")
        .filter(Boolean)
        .join("-")
        .slice(0, 96);

      const repoId = `${username}/${newTitle}`;
      repo.name = repoId;

      await createRepo({
        repo,
        accessToken: hf_token,
      });
      const colorFrom = COLORS[Math.floor(Math.random() * COLORS.length)];
      const colorTo = COLORS[Math.floor(Math.random() * COLORS.length)];
      readme = `---
title: ${newTitle}
emoji: 🐳
colorFrom: ${colorFrom}
colorTo: ${colorTo}
sdk: static
pinned: false
tags:
  - deepsite
---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference`;
    }

    newHtml = html.replace(/<\/body>/, `${getPTag(repo.name)}</body>`);
    const file = new Blob([newHtml], { type: "text/html" });
    file.name = "index.html"; // Add name property to the Blob

    // create prompt.txt file with all the prompts used, split by new line
    const newPrompts = ``.concat(prompts.map((prompt) => prompt).join("\n"));
    const promptFile = new Blob([newPrompts], { type: "text/plain" });
    promptFile.name = "prompts.txt"; // Add name property to the Blob

    const files = [file, promptFile];
    if (readme) {
      const readmeFile = new Blob([readme], { type: "text/markdown" });
      readmeFile.name = "README.md"; // Add name property to the Blob
      files.push(readmeFile);
    }
    await uploadFiles({
      repo,
      files,
      accessToken: hf_token,
    });
    return res.status(200).send({ ok: true, path: repo.name });
  } catch (err) {
    return res.status(500).send({
      ok: false,
      message: err.message,
    });
  }
});

// The main ask-ai endpoint
app.post("/api/ask-ai", async (req, res) => {
  console.log("=== /api/ask-ai REQUEST START ===");
  console.log("Raw request body received:", typeof req.body);
  
  try {
    // Check if the body is properly parsed
    if (!req.body || typeof req.body !== 'object') {
      console.error("Invalid request body:", req.body);
      return res.status(400).json({
        ok: false,
        message: "Invalid request body - must be valid JSON"
      });
    }
    
    const { prompt, html, previousPrompt, provider, model } = req.body;
    console.log("Extracted request params:", { 
      promptExists: !!prompt,
      htmlLength: html?.length, 
      previousPromptLength: previousPrompt?.length,
      provider, 
      model 
    });
    
    if (!prompt) {
      console.log("Error: Missing prompt");
      return res.status(400).json({
        ok: false,
        message: "Missing required fields: prompt",
      });
    }

    let { hf_token } = req.cookies;
    let token = hf_token;
    console.log("Token available:", !!token);

    if (process.env.HF_TOKEN && process.env.HF_TOKEN !== "") {
      token = process.env.HF_TOKEN;
      console.log("Using HF_TOKEN from env");
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress ||
      req.ip ||
      "0.0.0.0";

    console.log("Client IP:", ip);

    if (!token && !["openai", "gemini"].includes(provider)) {
      ipAddresses.set(ip, (ipAddresses.get(ip) || 0) + 1);
      const requestCount = ipAddresses.get(ip);
      console.log(`IP request count: ${requestCount}`);
      
      if (requestCount > MAX_REQUESTS_PER_IP) {
        console.log("Error: Request limit exceeded");
        return res.status(429).json({
          ok: false,
          openLogin: true,
          message: "Log In to continue using the service",
        });
      }

      token = process.env.DEFAULT_HF_TOKEN;
      console.log("Using DEFAULT_HF_TOKEN");
    }

    // Set up response headers for streaming
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Calculate tokens used
    let TOKENS_USED = prompt?.length || 0;
    if (previousPrompt) TOKENS_USED += previousPrompt.length;
    if (html) TOKENS_USED += html.length;
    
    console.log(`Total tokens used (estimated): ${TOKENS_USED}`);

    // Define default provider based on available API keys
    let DEFAULT_PROVIDER = PROVIDERS.novita;
    
    // If no HuggingFace token is available but Gemini API key is configured, use Gemini as default
    if ((!token || token === "") && process.env.GEMINI_API_KEY) {
      DEFAULT_PROVIDER = PROVIDERS.gemini;
      console.log("No HuggingFace token available, using Gemini as default provider");
    } else if ((!token || token === "") && process.env.OPENAI_API_KEY) {
      DEFAULT_PROVIDER = PROVIDERS.openai;
      console.log("No HuggingFace token available, using OpenAI as default provider");
    }
    
    console.log("Available providers:", Object.keys(PROVIDERS).join(", "));
    
    // Check if the provider exists
    if (provider !== "auto" && !PROVIDERS[provider]) {
      console.log(`Warning: Unknown provider "${provider}", using default`);
    }
    
    const selectedProvider =
      provider === "auto"
        ? DEFAULT_PROVIDER
        : PROVIDERS[provider] ?? DEFAULT_PROVIDER;
    
    console.log("Selected provider:", selectedProvider);
    
    // Handle case when no token is available for HuggingFace providers
    if (!token && !["openai", "gemini"].includes(selectedProvider.id)) {
      console.log("No HuggingFace token but trying to use a HuggingFace provider");
      
      // Switch to Gemini if available, otherwise OpenAI
      if (process.env.GEMINI_API_KEY) {
        console.log("Switching to Gemini as fallback");
        selectedProvider = PROVIDERS.gemini;
      } else if (process.env.OPENAI_API_KEY) {
        console.log("Switching to OpenAI as fallback");
        selectedProvider = PROVIDERS.openai;
      } else {
        return res.status(400).json({
          ok: false,
          message: "No API keys or tokens available for any provider. Please configure at least one provider."
        });
      }
    }

    // Determine which model to use
    const selectedModel = 
      (selectedProvider.id === "openai" || selectedProvider.id === "gemini") && model && model.trim() !== ""
        ? model 
        : (selectedProvider.id === "openai" || selectedProvider.id === "gemini")
          ? selectedProvider.defaultModel || MODEL_ID
          : MODEL_ID; // Always use DeepSeek model for other providers
        
    console.log(`Using provider: ${selectedProvider.id}, model: ${selectedModel}`);

    // Log a clear message when using DeepSeek model
    if (selectedModel === MODEL_ID) {
      console.log(`Using default model: ${MODEL_ID}`);
    }

    if (selectedProvider.id !== "openai" && TOKENS_USED >= selectedProvider.max_tokens) {
      // Special handling for Gemini models based on their specific token limits
      if (selectedProvider.id === "gemini") {
        let maxOutputTokens = 8192; // Default output limit for most Gemini models
        const maxInputTokens = 1000000; // All Gemini models support 1M input tokens
        
        if (selectedModel.includes("2.5") && (selectedModel.includes("flash") || selectedModel.includes("pro"))) {
          // Gemini 2.5 Flash and 2.5 Pro have 65,536 token output limit
          maxOutputTokens = 65536;
        }
        
        // Check input context length
        if (TOKENS_USED > maxInputTokens) {
          console.log(`Error: Input context too long for ${selectedModel} (${TOKENS_USED} > ${maxInputTokens})`);
          return res.status(400).json({
            ok: false,
            openSelectProvider: true,
            message: `Input context is too long. ${selectedModel} allows ${maxInputTokens} max input tokens.`,
          });
        }
        
        // Check output token limit
        if (TOKENS_USED > maxOutputTokens) {
          console.log(`Error: Output limit exceeded for ${selectedModel} (${TOKENS_USED} > ${maxOutputTokens})`);
          return res.status(400).json({
            ok: false,
            openSelectProvider: true,
            message: `Output limit exceeded. ${selectedModel} allows ${maxOutputTokens} max output tokens.`,
          });
        }
        
        console.log(`Using Gemini model with appropriate context: ${TOKENS_USED} tokens (input limit: ${maxInputTokens}, output limit: ${maxOutputTokens})`);
      } else {
        console.log(`Error: Context too long for ${selectedProvider.name} (${TOKENS_USED} > ${selectedProvider.max_tokens})`);
        return res.status(400).json({
          ok: false,
          openSelectProvider: true,
          message: `Context is too long. ${selectedProvider.name} allow ${selectedProvider.max_tokens} max tokens.`,
        });
      }
    }

    // Check API keys for external providers
    if (selectedProvider.id === "openai") {
      console.log("OpenAI API key present:", !!process.env.OPENAI_API_KEY);
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({
          ok: false,
          message: "OpenAI API key is not configured",
        });
      }
    }

    if (selectedProvider.id === "gemini") {
      console.log("Gemini API key present:", !!process.env.GEMINI_API_KEY);
      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({
          ok: false,
          message: "Gemini API key is not configured",
        });
      }
    }

    try {
      // Get the appropriate client based on the provider
      console.log("Initializing AI client for provider:", selectedProvider.id);
      const client = getAIClient(selectedProvider.id, token);
      let completeResponse = "";

      // Get system prompt content
      const systemPromptContent = `ONLY USE HTML, CSS AND JAVASCRIPT. If you want to use ICON make sure to import the library first. Try to create the best UI possible by using only HTML, CSS and JAVASCRIPT. Use as much as you can TailwindCSS for the CSS, if you can't do something with TailwindCSS, then use custom CSS (make sure to import <script src="https://cdn.tailwindcss.com"></script> in the head). Also, try to ellaborate as much as you can, to create something unique. IMPORTANT: DO NOT USE MARKDOWN CODE BLOCKS. DO NOT START YOUR RESPONSE WITH \`\`\`html OR END IT WITH \`\`\`. JUST PROVIDE THE RAW HTML CONTENT DIRECTLY. ALWAYS GIVE THE RESPONSE AS A SINGLE HTML FILE.`;
      
      // Check if we're using a Gemma model with Gemini provider
      const isGemmaModel = selectedProvider.id === "gemini" && selectedModel.includes("gemma");
      
      // Prepare messages for API request - handle special case for Gemma models
      const messages = [];
      
      // Only add system message for non-Gemma models
      if (!isGemmaModel) {
        messages.push({
          role: "system",
          content: systemPromptContent,
        });
      }
      
      if (previousPrompt) {
        messages.push({
          role: "user",
          content: previousPrompt,
        });
      }
      
      if (html) {
        messages.push({
          role: "assistant",
          content: `The current code is: ${html}.`,
        });
      }
      
      // For Gemma models, prepend system prompt to user prompt
      if (isGemmaModel) {
        messages.push({
          role: "user",
          content: `${systemPromptContent}\n\n${prompt}`,
        });
      } else {
        messages.push({
          role: "user",
          content: prompt,
        });
      }
      
      console.log("Total messages:", messages.length);
      
      // Prepare API call options
      const apiOptions = {
        model: selectedModel,
        messages: messages,
      };
      
      // Only add provider for HuggingFace providers
      if (selectedProvider.id !== "openai" && selectedProvider.id !== "gemini") {
        apiOptions.provider = selectedProvider.id;
      }
      
      // Add max_tokens for providers that need it
      if (!["sambanova", "openai", "gemini"].includes(selectedProvider.id)) {
        apiOptions.max_tokens = selectedProvider.max_tokens;
      }
      
      console.log("API call options:", JSON.stringify(apiOptions, (key, value) => {
        // Don't log full message content, just truncate
        if (key === 'content' && typeof value === 'string') {
          return value.substring(0, 50) + '...';
        }
        return value;
      }, 2));

      // Handle Gemini and OpenAI responses differently - collect the full response first
      if (selectedProvider.id === "gemini" || selectedProvider.id === "openai") {
        console.log(`Using non-streaming approach for ${selectedProvider.name}`);
        // Set content type for non-streaming response
        res.setHeader("Content-Type", "text/html");
        
        try {
          console.log(`Starting non-streaming chat completion for ${selectedProvider.name}`);
          // Use the non-streaming method
          const fullResponse = await client.chatCompletion(apiOptions);
          console.log(`Received complete response from ${selectedProvider.name}`);
          
          if (fullResponse) {
            console.log(`${selectedProvider.name} response length: ${fullResponse.length} chars`);
            let processedResponse = fullResponse;
            
            // Clean the response of any remaining Markdown code blocks
            processedResponse = cleanHtmlResponse(processedResponse);
            
            // Check if response already has a doctype
            if (!processedResponse.trim().toLowerCase().startsWith("<!doctype html>")) {
              console.log(`Adding DOCTYPE to ${selectedProvider.name} response`);
              processedResponse = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeepSite Generated Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
` + processedResponse;
            }
            
            // Check if response has closing HTML tags
            if (!processedResponse.includes("</html>")) {
              console.log(`Adding closing HTML tags to ${selectedProvider.name} response`);
              processedResponse += `
</body>
</html>`;
            }
            
            // Send complete response at once
            res.send(processedResponse);
            console.log(`${selectedProvider.name}: Complete HTML response sent`);
          } else {
            console.log(`${selectedProvider.name}: No response received`);
            res.status(500).send(`<html><body><h1>Error: No response received from ${selectedProvider.name}</h1></body></html>`);
          }
        } catch (apiError) {
          console.error(`Error with ${selectedProvider.name} non-streaming request:`, apiError);
          
          // Fallback to streaming approach
          console.log(`Falling back to streaming approach for ${selectedProvider.name}`);
          
          try {
            // Add stream: true to apiOptions
            apiOptions.stream = true;
            
            // Send HTML header
            const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeepSite Generated Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
`;
            res.write(htmlHeader);
            let completeResponse = htmlHeader;
            
            console.log(`Starting streaming chat completion for ${selectedProvider.name}`);
            const chatCompletion = await client.chatCompletionStream(apiOptions);
            console.log(`Chat completion stream initiated for ${selectedProvider.name}`);
            
            let chunkCount = 0;
            let finalHTML = "";
            
            while (true) {
              try {
                console.log(`Reading chunk #${chunkCount + 1} from ${selectedProvider.name} stream`);
                const { done, value } = await chatCompletion.next();
                
                if (done) {
                  console.log(`${selectedProvider.name} stream completed`);
                  break;
                }
                
                const chunk = value.choices[0]?.delta?.content;
                if (chunk) {
                  chunkCount++;
                  console.log(`${selectedProvider.name} stream chunk #${chunkCount}: ${chunk.substring(0, 30)}... (${chunk.length} chars)`);
                  
                  // Clean chunk to prevent partial HTML tags
                  finalHTML += chunk;
                  
                  res.write(chunk);
                  completeResponse += chunk;
                  
                  if (completeResponse.includes("</html>")) {
                    console.log(`Found </html> closing tag in ${selectedProvider.name} stream, ending`);
                    break;
                  }
                }
              } catch (streamChunkError) {
                console.error(`Error processing ${selectedProvider.name} stream chunk:`, streamChunkError);
                break;
              }
            }
            
            // Add closing HTML tags if needed
            if (!completeResponse.includes("</html>")) {
              const htmlFooter = `
</body>
</html>`;
              res.write(htmlFooter);
            }
            
            // End the response
            res.end();
            console.log(`${selectedProvider.name} stream response ended`);
            
          } catch (streamError) {
            console.error(`Error with ${selectedProvider.name} streaming fallback:`, streamError);
            if (!res.headersSent) {
              res.status(500).send(`<html><body><h1>Error processing ${selectedProvider.name} request</h1><p>${streamError.message}</p></body></html>`);
            } else {
              res.end(`
                <div style="color: red; padding: 20px; margin: 20px; border: 1px solid red;">
                  <h2>Error occurred during generation</h2>
                  <p>${streamError.message}</p>
                </div>
              </body>
              </html>`);
            }
          }
        }
      } else {
        // Standard streaming approach for other providers
        console.log("Starting chat completion stream");
        const chatCompletion = await client.chatCompletionStream(apiOptions);
        console.log("Chat completion stream initiated");

        let chunkCount = 0;
        let completeResponse = "";
        
        // Send HTML doctype and opening tags if they're not already in the response
        const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeepSite Generated Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
`;

        // Don't inject the header for HuggingFace providers - they should include it
        
        while (true) {
          try {
            console.log(`Reading chunk #${chunkCount + 1}`);
            const { done, value } = await chatCompletion.next();
            
            if (done) {
              console.log("Stream completed naturally");
              
              // If the response doesn't include closing tags, add them
              if (!completeResponse.includes("</html>")) {
                const htmlFooter = `
</body>
</html>`;
                res.write(htmlFooter);
                completeResponse += htmlFooter;
              }
              
              break;
            }
            
            const chunk = value.choices[0]?.delta?.content;
            if (chunk) {
              chunkCount++;
              // Log truncated chunk to avoid console spam
              console.log(`Chunk #${chunkCount}: ${chunk.substring(0, 30)}... (${chunk.length} chars)`);
              
              if (provider !== "sambanova") {
                res.write(chunk);
                completeResponse += chunk;

                if (completeResponse.includes("</html>")) {
                  console.log("Found </html> closing tag, ending stream");
                  break;
                }
              } else {
                let newChunk = chunk;
                if (chunk.includes("</html>")) {
                  // Replace everything after the last </html> tag with an empty string
                  newChunk = newChunk.replace(/<\/html>[\s\S]*/, "</html>");
                  console.log("SambaNova: Fixed HTML, found closing tag");
                }
                completeResponse += newChunk;
                res.write(newChunk);
                if (newChunk.includes("</html>")) {
                  console.log("SambaNova: Found </html> closing tag, ending stream");
                  break;
                }
              }
            } else {
              console.log("Received empty chunk");
            }
          } catch (chunkError) {
            console.error("Error processing chunk:", chunkError);
            // Continue on error instead of failing the whole stream
          }
        }
        
        console.log(`Total chunks processed: ${chunkCount}`);
        console.log(`Total response length: ${completeResponse.length} chars`);
        
        // End the response stream
        res.end();
        console.log("Response stream ended successfully");
      }
    } catch (error) {
      console.error("AI API Error:", error);
      console.error("Error stack:", error.stack);
      
      if (error.message.includes("exceeded your monthly included credits")) {
        console.log("Credits exceeded error");
        return res.status(402).json({
          ok: false,
          openProModal: true,
          message: error.message,
        });
      }
      if (!res.headersSent) {
        console.log("Sending error response");
        res.status(500).json({
          ok: false,
          message:
            error.message || "An error occurred while processing your request.",
        });
      } else {
        // Otherwise end the stream
        console.log("Headers already sent, ending stream");
        res.end();
      }
    }
  } catch (outerError) {
    console.error("Outer try-catch error:", outerError);
    console.error("Error stack:", outerError.stack);
    
    if (!res.headersSent) {
      res.status(500).json({
        ok: false, 
        message: "Server error: " + outerError.message
      });
    } else {
      res.end();
    }
  } finally {
    console.log("=== /api/ask-ai REQUEST END ===");
  }
});

app.get("/api/remix/:username/:repo", async (req, res) => {
  const { username, repo } = req.params;
  const { hf_token } = req.cookies;

  let token = hf_token || process.env.DEFAULT_HF_TOKEN;

  if (process.env.HF_TOKEN && process.env.HF_TOKEN !== "") {
    token = process.env.HF_TOKEN;
  }

  const repoId = `${username}/${repo}`;

  const url = `https://huggingface.co/spaces/${repoId}/raw/main/index.html`;
  try {
    const space = await spaceInfo({
      name: repoId,
      accessToken: token,
      additionalFields: ["author"],
    });

    if (!space || space.sdk !== "static" || space.private) {
      return res.status(404).json({
        ok: false,
        message: "Space not found",
      });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        message: "Space not found",
      });
    }
    let html = await response.text();
    // remove the last p tag including this url https://enzostvs-deepsite.hf.space
    html = html.replace(getPTag(repoId), "");

    let user = null;

    if (token) {
      const request_user = await fetch(
        "https://huggingface.co/oauth/userinfo",
        {
          headers: {
            Authorization: `Bearer ${hf_token}`,
          },
        }
      )
        .then((res) => res.json())
        .catch(() => null);

      user = request_user;
    }

    res.status(200).json({
      ok: true,
      html,
      isOwner: space.author === user?.preferred_username,
      path: repoId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

// Always define the catch-all route last
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Using default model: ${MODEL_ID}`);
  console.log(`Available providers:`, Object.keys(PROVIDERS).join(", "));
  console.log(`OPENAI_API_KEY configured:`, !!process.env.OPENAI_API_KEY);
  console.log(`GEMINI_API_KEY configured:`, !!process.env.GEMINI_API_KEY);
});

// Helper function to clean HTML responses
function cleanHtmlResponse(html) {
  if (!html) return html;
  
  console.log("Cleaning HTML response of code block markers");
  
  // Remove markdown code block markers
  let cleaned = html;
  
  // Remove ```html at the beginning
  if (cleaned.trim().startsWith("```html")) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }
  
  // Remove any ```html markers throughout the content
  cleaned = cleaned.replace(/```html/g, "");
  
  // Remove any ``` markers
  cleaned = cleaned.replace(/```/g, "");
  
  // Remove any duplicate DOCTYPE declarations (keep only the first one)
  if (cleaned.toLowerCase().indexOf("<!doctype html>") !== cleaned.toLowerCase().lastIndexOf("<!doctype html>")) {
    console.log("Detected multiple DOCTYPE declarations, fixing...");
    const firstDoctype = cleaned.toLowerCase().indexOf("<!doctype html>");
    const secondDoctype = cleaned.toLowerCase().indexOf("<!doctype html>", firstDoctype + 1);
    
    if (firstDoctype >= 0 && secondDoctype >= 0) {
      // Keep everything up to the first doctype, then skip to after the second doctype
      cleaned = cleaned.substring(0, secondDoctype) + cleaned.substring(secondDoctype + "<!doctype html>".length);
    }
  }
  
  // Remove duplicate <html> tags
  if (cleaned.toLowerCase().indexOf("<html") !== cleaned.toLowerCase().lastIndexOf("<html")) {
    console.log("Detected multiple HTML open tags, fixing...");
    const firstHtml = cleaned.toLowerCase().indexOf("<html");
    const secondHtml = cleaned.toLowerCase().indexOf("<html", firstHtml + 1);
    
    if (firstHtml >= 0 && secondHtml >= 0) {
      // Find the end of the second HTML tag
      const endOfSecondHtmlTag = cleaned.indexOf(">", secondHtml) + 1;
      // Keep everything up to the first html tag, then skip to after the second html tag
      cleaned = cleaned.substring(0, secondHtml) + cleaned.substring(endOfSecondHtmlTag);
    }
  }
  
  return cleaned;
}
