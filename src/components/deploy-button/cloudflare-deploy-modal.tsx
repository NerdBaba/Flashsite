import { FC } from 'react';
import classNames from 'classnames';
import { MdFileDownload, MdOutlineOpenInNew } from 'react-icons/md';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';

interface CloudflareDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  html: string;
}

const CloudflareDeployModal: FC<CloudflareDeployModalProps> = ({ isOpen, onClose, html }) => {
  const handleExport = async () => {
    try {
      const zip = new JSZip();
      
      // Create index.html with the current HTML content
      zip.file("index.html", html);
      
      // Generate the zip file
      const content = await zip.generateAsync({ type: "blob" });
      
      // Save the zip file
      saveAs(content, "flashsite-export.zip");
      
      toast.success("Site exported successfully!");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export site.");
    }
  };

  const openCloudflarePages = () => {
    window.open('https://dash.cloudflare.com/?to=/:account/pages/new/upload', '_blank');
  };

  return (
    <>
      <div
        className={classNames(
          'h-screen w-screen bg-black/20 fixed left-0 top-0 z-10',
          {
            'opacity-0 pointer-events-none': !isOpen,
          }
        )}
        onClick={onClose}
      ></div>
      <div
        className={classNames(
          'absolute top-[calc(100%+8px)] right-0 z-10 w-96 bg-white border border-gray-200 rounded-lg shadow-lg transition-all duration-75 overflow-hidden',
          {
            'opacity-0 pointer-events-none': !isOpen,
          }
        )}
      >
        <header className="flex items-center text-sm px-4 py-2 border-b border-gray-200 gap-2 bg-gray-100 font-semibold text-gray-700">
          Deploy to Cloudflare Pages
        </header>
        <main className="px-4 pt-3 pb-4 space-y-3">
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-4">
            <li>
              <p>Download your site as a ZIP file:</p>
              <button
                className="mt-2 relative cursor-pointer flex items-center rounded-md text-xs font-semibold leading-4 py-1.5 px-3 hover:bg-blue-600 text-white shadow-sm bg-blue-500"
                onClick={handleExport}
              >
                <MdFileDownload className="mr-1 text-base" />
                Download ZIP
              </button>
            </li>
            <li>
              <p>Go to Cloudflare Pages:</p>
              <button
                className="mt-2 relative cursor-pointer flex items-center rounded-md text-xs font-semibold leading-4 py-1.5 px-3 hover:bg-blue-600 text-white shadow-sm bg-blue-500"
                onClick={openCloudflarePages}
              >
                <MdOutlineOpenInNew className="mr-1 text-base" />
                Open Cloudflare Pages
              </button>
            </li>
            <li>
              <p>Create a new project with a name of your choice</p>
            </li>
            <li>
              <p>Choose "Upload Assets" and upload the ZIP file you downloaded</p>
            </li>
            <li>
              <p>Click "Deploy site" to complete the deployment</p>
            </li>
          </ol>
        </main>
      </div>
    </>
  );
};

export default CloudflareDeployModal; 