/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import classNames from "classnames";
import { toast } from "react-toastify";
import { FaPowerOff } from "react-icons/fa6";
import { MdExpandMore } from "react-icons/md";
import { FaGithub } from "react-icons/fa";

import SpaceIcon from "@/assets/space.svg";
import Loading from "../loading/loading";
import Login from "../login/login";
import { Auth } from "./../../../utils/types";
import LoadButton from "../load-button/load-button";
import CloudflareDeployModal from "./cloudflare-deploy-modal";

const MsgToast = ({ url }: { url: string }) => (
  <div className="w-full flex items-center justify-center gap-3">
    Your space is live!
    <button
      className="bg-black text-sm block text-white rounded-md px-3 py-1.5 hover:bg-gray-900 cursor-pointer"
      onClick={() => {
        window.open(url, "_blank");
      }}
    >
      See Space
    </button>
  </div>
);

function DeployButton({
  html,
  error = false,
  auth,
  setHtml,
  prompts,
  githubUrl,
}: {
  html: string;
  error: boolean;
  auth?: Auth;
  setHtml: (html: string) => void;
  prompts: string[];
  githubUrl?: string;
}) {
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [cloudflareModalOpen, setCloudflareModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<string | undefined>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState({
    title: "",
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const createSpace = async () => {
    setLoading(true);

    try {
      const request = await fetch("/api/deploy", {
        method: "POST",
        body: JSON.stringify({
          title: config.title,
          path,
          html,
          prompts,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const response = await request.json();
      if (response.ok) {
        toast.success(
          <MsgToast
            url={`https://huggingface.co/spaces/${response.path ?? path}`}
          />,
          {
            autoClose: 10000,
          }
        );
        setPath(response.path);
      } else {
        toast.error(response.message);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setSpaceModalOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-5">
      {githubUrl && (
        <a 
          href={githubUrl}
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center text-white hover:text-gray-300"
          title="View source on GitHub"
        >
          <FaGithub size={20} />
        </a>
      )}
      <LoadButton auth={auth} setHtml={setHtml} setPath={setPath} />
      <div className="relative flex items-center justify-end">
        {auth &&
          (auth.isLocalUse ? (
            <>
              <div className="bg-amber-500/10 border border-amber-10 text-amber-500 font-semibold leading-5 lg:leading-6 py-1 px-5 text-xs lg:text-sm rounded-md mr-4 select-none">
                Local Usage
              </div>
            </>
          ) : (
            <>
              <button
                className="mr-2 cursor-pointer"
                onClick={() => {
                  if (confirm("Are you sure you want to log out?")) {
                    // go to /auth/logout page
                    window.location.href = "/auth/logout";
                  }
                }}
              >
                <FaPowerOff className="text-lg text-red-500" />
              </button>
              <p className="mr-3 text-xs lg:text-sm text-gray-300">
                <span className="max-lg:hidden">Connected as </span>
                <a
                  href={`https://huggingface.co/${auth.preferred_username}`}
                  target="_blank"
                  className="underline hover:text-white"
                >
                  {auth.preferred_username}
                </a>
              </p>
            </>
          ))}
          
        <div className="relative" ref={dropdownRef}>
          <button
            className={classNames(
              "relative cursor-pointer flex-none flex items-center justify-center rounded-md text-xs lg:text-sm font-semibold leading-5 lg:leading-6 py-1.5 px-5 hover:bg-pink-400 text-white shadow-sm dark:shadow-highlight/20",
              {
                "bg-pink-400": dropdownOpen,
                "bg-pink-500": !dropdownOpen,
              }
            )}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            {path ? "Update Space" : "Deploy"}
            <MdExpandMore className="ml-1 text-lg" />
          </button>
          
          {/* Dropdown Menu */}
          <div
            className={classNames(
              "absolute top-full right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-20 transition-all duration-100 py-1 border border-gray-200",
              {
                "opacity-0 pointer-events-none": !dropdownOpen,
                "opacity-100": dropdownOpen,
              }
            )}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={() => {
                setDropdownOpen(false);
                setSpaceModalOpen(true);
              }}
            >
              <img src={SpaceIcon} alt="Space Icon" className="size-4 mr-2" />
              {path ? "Update Space" : "Deploy to Space"}
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={() => {
                setDropdownOpen(false);
                setCloudflareModalOpen(true);
              }}
            >
              <svg className="size-4 mr-2" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#F6821F" d="M35.2,18.6c-0.5-1.6-1.5-2.9-2.8-3.9c0.1-0.5,0.2-1,0.2-1.5c0-2.9-2.3-5.3-5.3-5.3c-1.1,0-2.1,0.3-3,0.9 C23,8,21.5,7.6,20,7.6c-3.6,0-6.6,2.9-6.6,6.6c0,0.2,0,0.5,0.1,0.7C10.4,16,8.1,18.9,8.1,22.5c0,4.2,3.5,7.7,7.7,7.7h19 c3.6,0,6.6-2.9,6.6-6.6C41.4,21.6,38.7,19,35.2,18.6z"/>
              </svg>
              Deploy to Cloudflare Pages
            </button>
          </div>
        </div>

        {/* Space Modal */}
        <div
          className={classNames(
            "h-screen w-screen bg-black/20 fixed left-0 top-0 z-10",
            {
              "opacity-0 pointer-events-none": !spaceModalOpen,
            }
          )}
          onClick={() => setSpaceModalOpen(false)}
        ></div>
        <div
          className={classNames(
            "absolute top-[calc(100%+8px)] right-0 z-10 w-80 bg-white border border-gray-200 rounded-lg shadow-lg transition-all duration-75 overflow-hidden",
            {
              "opacity-0 pointer-events-none": !spaceModalOpen,
            }
          )}
        >
          {!auth ? (
            <Login html={html}>
              <p className="text-gray-500 text-sm mb-3">
                Host this project for free and share it with your friends.
              </p>
            </Login>
          ) :
            <>
              <header className="flex items-center text-sm px-4 py-2 border-b border-gray-200 gap-2 bg-gray-100 font-semibold text-gray-700">
                <span className="text-xs bg-pink-500/10 text-pink-500 rounded-full pl-1.5 pr-2.5 py-0.5 flex items-center justify-start gap-1.5">
                  <img src={SpaceIcon} alt="Space Icon" className="size-4" />
                  Space
                </span>
                Configure Deployment
              </header>
              <main className="px-4 pt-3 pb-4 space-y-3">
                <p className="text-xs text-amber-600 bg-amber-500/10 rounded-md p-2">
                  {path ? (
                    <span>
                      Your space is live at{" "}
                      <a
                        href={`https://huggingface.co/spaces/${path}`}
                        target="_blank"
                        className="underline hover:text-amber-700"
                      >
                        huggingface.co/{path}
                      </a>
                      . You can update it by deploying again.
                    </span>
                  ) : (
                    "Deploy your project to a space on the Hub. Spaces are a way to share your project with the world."
                  )}
                </p>
                {!path && (
                  <label className="block">
                    <p className="text-gray-600 text-sm font-medium mb-1.5">
                      Space Title
                    </p>
                    <input
                      type="text"
                      value={config.title}
                      className="mr-2 border rounded-md px-3 py-1.5 border-gray-300 w-full text-sm"
                      placeholder="My Awesome Space"
                      onChange={(e) =>
                        setConfig({ ...config, title: e.target.value })
                      }
                    />
                  </label>
                )}
                {error && (
                  <p className="text-red-500 text-xs bg-red-500/10 rounded-md p-2">
                    Your code has errors. Fix them before deploying.
                  </p>
                )}
                <div className="pt-2 text-right">
                  <button
                    disabled={error || loading || (!path && !config.title)}
                    className="relative rounded-full bg-black px-5 py-2 text-white font-semibold text-xs hover:bg-black/90 transition-all duration-100 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                    onClick={createSpace}
                  >
                    {path ? "Update Space" : "Create Space"}
                    {loading && <Loading />}
                  </button>
                </div>
              </main>
            </>
          }
        </div>
        
        {/* Cloudflare Deploy Modal */}
        <CloudflareDeployModal 
          isOpen={cloudflareModalOpen} 
          onClose={() => setCloudflareModalOpen(false)} 
          html={html} 
        />
      </div>
    </div>
  );
}

export default DeployButton;
