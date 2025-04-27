import classNames from "classnames";
import { useState } from "react";
import { toast } from "react-toastify";

import SpaceIcon from "@/assets/space.svg";
import Loading from "../loading/loading";
import { Auth } from "../../../utils/types";

function LoadButton({
  auth,
  setHtml,
  setPath,
}: {
  auth?: Auth;
  setHtml: (html: string) => void;
  setPath: (path?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [url, setUrl] = useState<string | undefined>(undefined);

  const loadSpace = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/remix/${url}`);
      const data = await res.json();
      if (res.ok) {
        if (data.html) {
          setHtml(data.html);
          toast.success("Space loaded successfully.");
        }
        if (data.isOwner) {
          setPath(data.path);
        } else {
          setPath(undefined);
        }
        setOpen(false);
      } else {
        toast.error(data.message);
        setError(data.message);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast.error(error.message);
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div
      className={classNames("max-md:hidden", {
        "border-r border-gray-700 pr-5": auth,
      })}
    >
      <p
        className="underline hover:text-white cursor-pointer text-xs lg:text-sm text-gray-300"
        onClick={() => setOpen(!open)}
      >
        Load Space
      </p>
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
          "absolute top-[calc(100%+8px)] right-2 z-10 w-80 bg-white border border-gray-200 rounded-lg shadow-lg transition-all duration-75 overflow-hidden",
          {
            "opacity-0 pointer-events-none": !open,
          }
        )}
      >
        <>
          <header className="flex items-center text-sm px-4 py-2 border-b border-gray-200 gap-2 bg-gray-100 font-semibold text-gray-700">
            <span className="text-xs bg-pink-500/10 text-pink-500 rounded-full pl-1.5 pr-2.5 py-0.5 flex items-center justify-start gap-1.5">
              <img src={SpaceIcon} alt="Space Icon" className="size-4" />
              Space
            </span>
            Load Project
          </header>
          <main className="px-4 pt-3 pb-4 space-y-3">
            <p className="text-sm text-pink-600 bg-pink-100 rounded-md px-3 py-2">
              Load an existing DeepSite Space to continue working on it.
            </p>
            <label className="block">
              <p className="text-gray-600 text-sm font-medium mb-1.5">
                Space URL
              </p>
              <input
                type="text"
                value={url}
                className="mr-2 border rounded-md px-3 py-1.5 border-gray-300 w-full text-sm"
                placeholder="https://huggingface.co/spaces/username/space-name"
                onChange={(e) => setUrl(e.target.value)}
                onFocus={() => setError(false)}
                onBlur={(e) => {
                  const pathParts = e.target.value.split("/");
                  setUrl(
                    `${pathParts[pathParts.length - 2]}/${
                      pathParts[pathParts.length - 1]
                    }`
                  );
                  setError(false);
                }}
              />
            </label>
            {error && (
              <p className="text-red-500 text-xs bg-red-500/10 rounded-md p-2 break-all">
                {error}
              </p>
            )}
            <div className="pt-2 text-right">
              <button
                disabled={error || loading || !url}
                className="relative rounded-full bg-black px-5 py-2 text-white font-semibold text-xs hover:bg-black/90 transition-all duration-100 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                onClick={loadSpace}
              >
                Load Space
                {loading && <Loading />}
              </button>
            </div>
          </main>
        </>
      </div>
    </div>
  );
}
export default LoadButton;
