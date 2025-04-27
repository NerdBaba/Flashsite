/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { RiSparkling2Fill } from "react-icons/ri";
import { GrSend } from "react-icons/gr";
import classNames from "classnames";
import { toast } from "react-toastify";
import { useLocalStorage } from "react-use";
import { MdPreview } from "react-icons/md";

import Login from "../login/login";
import { defaultHTML } from "./../../../utils/consts";
import SuccessSound from "./../../assets/success.mp3";
import Settings from "../settings/settings";
import ProModal from "../pro-modal/pro-modal";
// import SpeechPrompt from "../speech-prompt/speech-prompt";
// @ts-expect-error not needed
import { PROVIDERS } from "./../../../utils/providers";

function AskAI({
  html,
  setHtml,
  onScrollToBottom,
  isAiWorking,
  setisAiWorking,
  setView,
  onNewPrompt,
}: {
  html: string;
  setHtml: (html: string) => void;
  onScrollToBottom: () => void;
  isAiWorking: boolean;
  onNewPrompt: (prompt: string) => void;
  setView: React.Dispatch<React.SetStateAction<"editor" | "preview">>;
  setisAiWorking: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [hasAsked, setHasAsked] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [provider, setProvider] = useLocalStorage("provider", "auto");
  const [model, setModel] = useLocalStorage("model", "");
  const [openProvider, setOpenProvider] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [openProModal, setOpenProModal] = useState(false);
  const [isEnhancedPrompt, setIsEnhancedPrompt] = useState(false);

  const audio = new Audio(SuccessSound);
  audio.volume = 0.5;

  // Make sure we always have a valid model when provider changes
  useEffect(() => {
    if (provider && provider !== "auto" && PROVIDERS[provider]?.models) {
      if (!model || !PROVIDERS[provider]?.models?.includes(model)) {
        setModel(PROVIDERS[provider].defaultModel);
      }
    }
  }, [provider, model, setModel]);

  // Random cool website prompt ideas
  const randomSitePrompts = [
    "Create a beautiful portfolio site for a photographer with a dark theme",
    "Design a landing page for a tech startup with a gradient background",
    "Make a minimalist e-commerce site for handmade jewelry",
    "Create a vibrant blog layout for a food enthusiast",
    "Design a space-themed portfolio site with animations",
    "Build a modern real estate listing page with image gallery",
    "Create a fitness app landing page with energetic colors",
    "Design a travel blog with full-width hero images",
    "Make a portfolio for a graphic designer with a grid layout",
    "Create a music streaming platform with dark mode"
  ];

  // Function to enhance prompts or generate new ones
  const enhancePrompt = () => {
    if (isAiWorking) return;
    
    // If input is empty, set a random prompt
    if (!prompt.trim()) {
      const randomIndex = Math.floor(Math.random() * randomSitePrompts.length);
      setPrompt(randomSitePrompts[randomIndex]);
      return;
    }
    
    // For enhancing existing prompts - we'll use different models based on provider
    const enhancedPrompt = `${prompt}. Make it more visually appealing with better design, animations, and structure.`;
    setPrompt(enhancedPrompt);
    setIsEnhancedPrompt(true);
  };

  // Function to get the correct model based on provider
  const getModelForEnhancement = () => {
    let tempProvider = provider;
    let tempModel = model;

    // Override model based on provider
    if (provider === "gemini" || provider === "auto") {
      tempProvider = "gemini";
      tempModel = "gemini-2.0-flash";
    } else if (provider === "openai") {
      tempProvider = "openai";
      tempModel = "gpt-4o"; // Using gpt-4o as it's the closest to "gpt-4.0-turbo"
    } else {
      // For any other provider, we'll use a server-side default that maps to DeepSeek v3
      tempProvider = "auto"; // The server will use DeepSeek v3 for "auto"
      tempModel = "";
    }

    return { provider: tempProvider, model: tempModel };
  };

  const callAi = async (useOverrideModel = false) => {
    if (isAiWorking || !prompt.trim()) return;
    setisAiWorking(true);
    setProviderError("");

    // Get the model to use - either normal selection or enhancement override
    let selectedProvider = provider;
    let selectedModel = model;
    
    if (useOverrideModel) {
      const overrideConfig = getModelForEnhancement();
      selectedProvider = overrideConfig.provider;
      selectedModel = overrideConfig.model;
    } else if (provider !== "auto" && PROVIDERS[provider]?.models) {
      // Standard model selection logic
      if (!selectedModel || !PROVIDERS[provider]?.models?.includes(selectedModel)) {
        selectedModel = PROVIDERS[provider].defaultModel;
      }
    }

    let contentResponse = "";
    let lastRenderTime = 0;
    try {
      onNewPrompt(prompt);
      const request = await fetch("/api/ask-ai", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          provider: selectedProvider,
          model: selectedModel,
          ...(html === defaultHTML ? {} : { html }),
          ...(previousPrompt ? { previousPrompt } : {}),
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (request && request.body) {
        if (!request.ok) {
          const res = await request.json();
          if (res.openLogin) {
            setOpen(true);
          } else if (res.openSelectProvider) {
            setOpenProvider(true);
            setProviderError(res.message);
          } else if (res.openProModal) {
            setOpenProModal(true);
          } else {
            toast.error(res.message);
          }
          setisAiWorking(false);
          return;
        }
        const reader = request.body.getReader();
        const decoder = new TextDecoder("utf-8");

        const read = async () => {
          const { done, value } = await reader.read();
          if (done) {
            toast.success("AI responded successfully");
            setPrompt("");
            setPreviousPrompt(prompt);
            setisAiWorking(false);
            setHasAsked(true);
            audio.play();
            setView("preview");

            // Now we have the complete HTML including </html>, so set it to be sure
            const finalDoc = contentResponse.match(
              /<!DOCTYPE html>[\s\S]*<\/html>/
            )?.[0];
            if (finalDoc) {
              // Ensure we set the final HTML once more after everything is done
              setHtml(finalDoc);
              
              // Give a small delay to ensure version is tracked
              setTimeout(() => {
                if (!isAiWorking) {
                  setHtml(finalDoc); // Trigger one more update to ensure version is recorded
                }
              }, 50);
            }

            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          contentResponse += chunk;
          
          // Try to extract a complete HTML document first
          const completeHtml = contentResponse.match(/<!DOCTYPE html>[\s\S]*<\/html>/i)?.[0];
          
          if (completeHtml) {
            // We have a complete HTML document
            console.log("Found complete HTML document with DOCTYPE and closing tags");
            setHtml(completeHtml);
            
            if (completeHtml.length > 200) {
              onScrollToBottom();
            }
          } else {
            // Try to get a partial HTML document
            const partialHtml = contentResponse.match(/<!DOCTYPE html>[\s\S]*/i)?.[0] || 
                               contentResponse.match(/<html[\s\S]*/i)?.[0] ||
                               contentResponse.match(/<head[\s\S]*/i)?.[0] ||
                               contentResponse.match(/<body[\s\S]*/i)?.[0];
                               
            if (partialHtml) {
              // Force-close the HTML tag so the iframe doesn't render half-finished markup
              let partialDoc = partialHtml;
              if (!partialDoc.includes("</html>")) {
                partialDoc += "\n</html>";
              }
              if (!partialDoc.includes("</body>") && partialDoc.includes("<body")) {
                partialDoc = partialDoc.replace("</html>", "</body>\n</html>");
              }

              // Throttle the re-renders to avoid flashing/flicker
              const now = Date.now();
              if (now - lastRenderTime > 300) {
                setHtml(partialDoc);
                lastRenderTime = now;
              }

              if (partialDoc.length > 200) {
                onScrollToBottom();
              }
            } else if (contentResponse.length > 0) {
              // If we still don't have HTML but have content, wrap it in basic HTML
              const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <title>AI Response</title>
</head>
<body>
  ${contentResponse}
</body>
</html>`;
              
              // Throttle updates
              const now = Date.now();
              if (now - lastRenderTime > 300) {
                setHtml(basicHtml);
                lastRenderTime = now;
              }
              
              onScrollToBottom();
            }
          }
          
          read();
        };

        read();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      setisAiWorking(false);
      toast.error(error.message);
      if (error.openLogin) {
        setOpen(true);
      }
    }
  };

  return (
    <div
      className={`bg-gray-950 rounded-xl py-2 lg:py-2.5 pl-3.5 lg:pl-4 pr-2 lg:pr-2.5 absolute lg:sticky bottom-3 left-3 lg:bottom-4 lg:left-4 w-[calc(100%-1.5rem)] lg:w-[calc(100%-2rem)] z-10 group ${
        isAiWorking ? "animate-pulse" : ""
      }`}
    >
      {defaultHTML !== html && (
        <button
          className="bg-white lg:hidden -translate-y-[calc(100%+8px)] absolute left-0 top-0 shadow-md text-gray-950 text-xs font-medium py-2 px-3 lg:px-4 rounded-lg flex items-center gap-2 border border-gray-100 hover:brightness-150 transition-all duration-100 cursor-pointer"
          onClick={() => setView("preview")}
        >
          <MdPreview className="text-sm" />
          View Preview
        </button>
      )}
      <div className="w-full relative flex items-center justify-between">
        <button
          onClick={enhancePrompt}
          disabled={isAiWorking}
          className="flex items-center justify-center cursor-pointer"
          title="Enhance prompt or generate random site idea"
        >
          <RiSparkling2Fill className="text-lg lg:text-xl text-gray-500 group-focus-within:text-pink-500 hover:text-pink-400 transition-colors" />
        </button>
        <input
          type="text"
          disabled={isAiWorking}
          className="w-full bg-transparent max-lg:text-sm outline-none px-3 text-white placeholder:text-gray-500 font-code"
          placeholder={
            hasAsked ? "What do you want to ask AI next?" : "Ask AI anything..."
          }
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setIsEnhancedPrompt(false); // Reset enhanced flag when user manually types
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              callAi(isEnhancedPrompt);
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          {/* <SpeechPrompt setPrompt={setPrompt} /> */}
          <Settings
            provider={provider as string}
            model={model as string}
            onChange={setProvider}
            onModelChange={setModel}
            open={openProvider}
            error={providerError}
            onClose={setOpenProvider}
          />
          <button
            disabled={isAiWorking}
            className="relative overflow-hidden cursor-pointer flex-none flex items-center justify-center rounded-full text-sm font-semibold size-8 text-center bg-pink-500 hover:bg-pink-400 text-white shadow-sm dark:shadow-highlight/20 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
            onClick={() => callAi(isEnhancedPrompt)}
          >
            <GrSend className="-translate-x-[1px]" />
          </button>
        </div>
      </div>
      <div
        className={classNames(
          "h-screen w-screen bg-black/20 fixed left-0 top-0 z-10",
          {
            "opacity-0 pointer-events-none": !open,
          }
        )}
        onClick={() => setOpen(false)}
      ></div>
      <div
        className={classNames(
          "absolute top-0 -translate-y-[calc(100%+8px)] right-0 z-10 w-80 bg-white border border-gray-200 rounded-lg shadow-lg transition-all duration-75 overflow-hidden",
          {
            "opacity-0 pointer-events-none": !open,
          }
        )}
      >
        <Login html={html}>
          <p className="text-gray-500 text-sm mb-3">
            You reached the limit of free AI usage. Please login to continue.
          </p>
        </Login>
      </div>
      <ProModal
        html={html}
        open={openProModal}
        onClose={() => setOpenProModal(false)}
      />
    </div>
  );
}

export default AskAI;
