import { FC } from 'react';
import { MdFileDownload } from 'react-icons/md';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';

interface ExportButtonProps {
  html: string;
  className?: string;
}

const ExportButton: FC<ExportButtonProps> = ({ html, className = '' }) => {
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

  return (
    <button
      className={`relative cursor-pointer flex-none flex items-center justify-center rounded-md text-xs font-semibold leading-4 py-1.5 px-3 hover:bg-gray-700 text-gray-100 shadow-sm dark:shadow-highlight/20 bg-gray-800 ${className}`}
      onClick={handleExport}
      title="Export as ZIP"
    >
      <MdFileDownload className="mr-1 text-base" />
      Export
    </button>
  );
};

export default ExportButton; 