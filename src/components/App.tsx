import { useRef, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import classNames from "classnames";
import { editor } from "monaco-editor";
import {
  useMount,
  useUnmount,
  useEvent,
  useLocalStorage,
  useSearchParam,
} from "react-use";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";

import Header from "./header/header";
import DeployButton from "./deploy-button/deploy-button";
import { defaultHTML } from "./../../utils/consts";
import Tabs from "./tabs/tabs";
import AskAI from "./ask-ai/ask-ai";
import { Auth } from "./../../utils/types";
import Preview from "./preview/preview";
import { VersionSidebar, Version } from "./version-history";

function App() {
  const [htmlStorage, , removeHtmlStorage] = useLocalStorage("html_content");
  const remix = useSearchParam("remix");

  const preview = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const resizer = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const [isResizing, setIsResizing] = useState(false);
  const [error, setError] = useState(false);
  const [html, setHtml] = useState((htmlStorage as string) ?? defaultHTML);
  const [isAiWorking, setisAiWorking] = useState(false);
  const [auth, setAuth] = useState<Auth | undefined>(undefined);
  const [currentView, setCurrentView] = useState<"editor" | "preview">(
    "editor"
  );
  const [prompts, setPrompts] = useState<string[]>([]);
  
  // Version history state
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initialize version history with initial version
  useEffect(() => {
    const initialVersion: Version = {
      id: uuidv4(),
      timestamp: new Date().toLocaleString(),
      html: htmlStorage as string ?? defaultHTML,
      prompt: "",
    };
    setVersions([initialVersion]);
    setCurrentVersionId(initialVersion.id);
  }, []);

  // Function to add a new version when AI responds
  const addVersion = (prompt: string, htmlContent: string) => {
    console.log("Adding new version with prompt:", prompt.substring(0, 20) + "...");
    
    const newVersion: Version = {
      id: uuidv4(),
      timestamp: new Date().toLocaleString(),
      html: htmlContent,
      prompt,
    };

    // Find the current version and add the new version as a child
    setVersions(prevVersions => {
      const updateVersions = (versions: Version[]): Version[] => {
        return versions.map(version => {
          if (version.id === currentVersionId) {
            // Create children array if it doesn't exist
            const children = version.children || [];
            return {
              ...version,
              children: [...children, newVersion]
            };
          } else if (version.children && version.children.length > 0) {
            return {
              ...version,
              children: updateVersions(version.children)
            };
          }
          return version;
        });
      };

      const updatedVersions = updateVersions(prevVersions);
      return updatedVersions;
    });

    // Update current version ID
    setCurrentVersionId(newVersion.id);
    console.log("New version set, ID:", newVersion.id);
  };

  // Function to undo to previous version
  const undoToPreviousVersion = () => {
    console.log("Attempting to undo to previous version");
    
    if (isAiWorking) {
      toast.warn("Please wait for the AI to finish working.");
      return;
    }

    // Find the parent of the current version
    const findParentVersion = (versions: Version[], targetId: string): Version | null => {
      for (const version of versions) {
        if (version.children) {
          for (const child of version.children) {
            if (child.id === targetId) {
              console.log("Found parent version:", version.id);
              return version;
            }
          }
          
          const result = findParentVersion(version.children, targetId);
          if (result) return result;
        }
      }
      return null;
    };

    const parentVersion = findParentVersion(versions, currentVersionId);
    console.log("Current version ID:", currentVersionId);
    console.log("Parent version found:", parentVersion?.id || "None");
    
    if (parentVersion) {
      setHtml(parentVersion.html);
      setCurrentVersionId(parentVersion.id);
      toast.success("Reverted to previous version");
    } else {
      toast.warn("No previous version available");
    }
  };

  // Function to select a specific version
  const selectVersion = (version: Version) => {
    if (isAiWorking) {
      toast.warn("Please wait for the AI to finish working.");
      return;
    }
    
    setHtml(version.html);
    setCurrentVersionId(version.id);
    toast.info("Switched to selected version");
  };

  const fetchMe = async () => {
    const res = await fetch("/api/@me");
    if (res.ok) {
      const data = await res.json();
      setAuth(data);
    } else {
      setAuth(undefined);
    }
  };

  const fetchRemix = async () => {
    if (!remix) return;
    const res = await fetch(`/api/remix/${remix}`);
    if (res.ok) {
      const data = await res.json();
      if (data.html) {
        setHtml(data.html);
        toast.success("Remix content loaded successfully.");
      }
    } else {
      toast.error("Failed to load remix content.");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("remix");
    window.history.replaceState({}, document.title, url.toString());
  };

  /**
   * Resets the layout based on screen size
   * - For desktop: Sets editor to 1/3 width and preview to 2/3
   * - For mobile: Removes inline styles to let CSS handle it
   */
  const resetLayout = () => {
    if (!editor.current || !preview.current) return;

    // lg breakpoint is 1024px based on useBreakpoint definition and Tailwind defaults
    if (window.innerWidth >= 1024) {
      // Set initial 1/3 - 2/3 sizes for large screens, accounting for resizer width
      const resizerWidth = resizer.current?.offsetWidth ?? 8; // w-2 = 0.5rem = 8px
      const availableWidth = window.innerWidth - resizerWidth;
      const initialEditorWidth = availableWidth / 3; // Editor takes 1/3 of space
      const initialPreviewWidth = availableWidth - initialEditorWidth; // Preview takes 2/3
      editor.current.style.width = `${initialEditorWidth}px`;
      preview.current.style.width = `${initialPreviewWidth}px`;
    } else {
      // Remove inline styles for smaller screens, let CSS flex-col handle it
      editor.current.style.width = "";
      preview.current.style.width = "";
    }
  };

  /**
   * Handles resizing when the user drags the resizer
   * Ensures minimum widths are maintained for both panels
   */
  const handleResize = (e: MouseEvent) => {
    if (!editor.current || !preview.current || !resizer.current) return;

    const resizerWidth = resizer.current.offsetWidth;
    const minWidth = 100; // Minimum width for editor/preview
    const maxWidth = window.innerWidth - resizerWidth - minWidth;

    const editorWidth = e.clientX;
    const clampedEditorWidth = Math.max(
      minWidth,
      Math.min(editorWidth, maxWidth)
    );
    const calculatedPreviewWidth =
      window.innerWidth - clampedEditorWidth - resizerWidth;

    editor.current.style.width = `${clampedEditorWidth}px`;
    preview.current.style.width = `${calculatedPreviewWidth}px`;
  };

  const handleMouseDown = () => {
    setIsResizing(true);
    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // Prevent accidental navigation away when AI is working or content has changed
  useEvent("beforeunload", (e) => {
    if (isAiWorking || html !== defaultHTML) {
      e.preventDefault();
      return "";
    }
  });

  // Initialize component on mount
  useMount(() => {
    // Fetch user data
    fetchMe();
    fetchRemix();

    // Restore content from storage if available
    if (htmlStorage) {
      removeHtmlStorage();
      toast.warn("Previous HTML content restored from local storage.");
    }

    // Set initial layout based on window size
    resetLayout();

    // Attach event listeners
    if (!resizer.current) return;
    resizer.current.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("resize", resetLayout);
  });

  // Clean up event listeners on unmount
  useUnmount(() => {
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", handleMouseUp);
    if (resizer.current) {
      resizer.current.removeEventListener("mousedown", handleMouseDown);
    }
    window.removeEventListener("resize", resetLayout);
  });

  return (
    <div className="h-screen bg-gray-950 font-sans overflow-hidden">
      <Header
        onReset={() => {
          if (isAiWorking) {
            toast.warn("Please wait for the AI to finish working.");
            return;
          }
          if (
            window.confirm("You're about to reset the editor. Are you sure?")
          ) {
            setHtml(defaultHTML);
            setError(false);
            removeHtmlStorage();
            editorRef.current?.revealLine(
              editorRef.current?.getModel()?.getLineCount() ?? 0
            );
          }
        }}
        onUndo={undoToPreviousVersion}
        undoDisabled={isAiWorking || versions.length <= 1}
        historyOpen={sidebarOpen}
        onToggleHistory={() => setSidebarOpen(!sidebarOpen)}
        html={html}
      >
        <DeployButton
          html={html}
          error={error}
          auth={auth}
          setHtml={setHtml}
          prompts={prompts}
          githubUrl="https://github.com/NerdBaba/Flashsite"
        />
      </Header>
      <main className="max-lg:flex-col flex w-full">
        <div
          ref={editor}
          className={classNames(
            "w-full h-[calc(100dvh-49px)] lg:h-[calc(100dvh-54px)] relative overflow-hidden max-lg:transition-all max-lg:duration-200 select-none",
            {
              "max-lg:h-0": currentView === "preview",
            }
          )}
        >
          <Tabs />
          <div
            onClick={(e) => {
              if (isAiWorking) {
                e.preventDefault();
                e.stopPropagation();
                toast.warn("Please wait for the AI to finish working.");
              }
            }}
          >
            <Editor
              language="html"
              theme="vs-dark"
              className={classNames(
                "h-[calc(100dvh-90px)] lg:h-[calc(100dvh-96px)]",
                {
                  "pointer-events-none": isAiWorking,
                }
              )}
              value={html}
              onValidate={(markers) => {
                if (markers?.length > 0) {
                  setError(true);
                }
              }}
              onChange={(value) => {
                const newValue = value ?? "";
                setHtml(newValue);
                setError(false);
              }}
              onMount={(editor) => (editorRef.current = editor)}
            />
          </div>
          <AskAI
            html={html}
            setHtml={(newHtml) => {
              if (newHtml === html) return; // Skip if no change
              
              setHtml(newHtml);
              
              // When AI responses are received, track the version
              if (newHtml !== html && prompts.length > 0) {
                const lastPrompt = prompts[prompts.length - 1] || "";
                
                // Wait for small timeout to ensure we get the final AI response
                clearTimeout((window as any).versionTimeout);
                (window as any).versionTimeout = setTimeout(() => {
                  addVersion(lastPrompt, newHtml);
                }, 500);
              }
            }}
            isAiWorking={isAiWorking}
            setisAiWorking={(working) => {
              // If AI finishes working, ensure we track the version
              if (isAiWorking && !working) {
                clearTimeout((window as any).versionTimeout);
                const lastPrompt = prompts[prompts.length - 1] || "";
                
                if (lastPrompt && html !== defaultHTML) {
                  (window as any).versionTimeout = setTimeout(() => {
                    addVersion(lastPrompt, html);
                  }, 500);
                }
              }
              
              setisAiWorking(working);
            }}
            setView={setCurrentView}
            onNewPrompt={(prompt) => {
              setPrompts((prev) => [...prev, prompt]);
            }}
            onScrollToBottom={() => {
              editorRef.current?.revealLine(
                editorRef.current?.getModel()?.getLineCount() ?? 0
              );
            }}
          />
        </div>
        <div
          ref={resizer}
          className="bg-gray-700 hover:bg-blue-500 w-2 cursor-col-resize h-[calc(100dvh-53px)] max-lg:hidden"
        />
        <Preview
          html={html}
          isResizing={isResizing}
          isAiWorking={isAiWorking}
          ref={preview}
          setView={setCurrentView}
        />
      </main>
      
      {/* Version History Sidebar */}
      <VersionSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        versions={versions}
        currentVersionId={currentVersionId}
        onSelectVersion={selectVersion}
      />
    </div>
  );
}

export default App;
