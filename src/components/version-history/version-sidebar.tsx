import { useState } from "react";
import { IoMdClose } from "react-icons/io";
import { MdHistory } from "react-icons/md";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import classNames from "classnames";

export interface Version {
  id: string;
  timestamp: string;
  html: string;
  prompt: string;
  children?: Version[];
}

interface VersionNodeProps {
  version: Version;
  level: number;
  currentVersionId: string;
  onSelectVersion: (version: Version) => void;
}

function VersionNode({ version, level, currentVersionId, onSelectVersion }: VersionNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = version.children && version.children.length > 0;
  
  return (
    <div className="w-full">
      <div 
        className={classNames(
          "flex items-center py-2 px-2 rounded-md hover:bg-gray-800 cursor-pointer transition-colors duration-150",
          { "bg-gray-800 text-pink-500": version.id === currentVersionId }
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelectVersion(version)}
      >
        {hasChildren ? (
          <button 
            className="mr-2 text-gray-400 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-[10px] mr-2" />
        )}
        <div className="flex-1 truncate text-sm">
          <div className={classNames(
            "font-medium truncate",
            { "text-pink-500": version.id === currentVersionId, "text-white": version.id !== currentVersionId }
          )}>
            {version.prompt ? `"${version.prompt.slice(0, 25)}${version.prompt.length > 25 ? '...' : ''}"` : 'Initial Version'}
          </div>
          <div className="text-gray-400 text-xs">{version.timestamp}</div>
        </div>
      </div>
      
      {hasChildren && expanded && (
        <div className="w-full">
          {version.children?.map((child) => (
            <VersionNode 
              key={child.id} 
              version={child} 
              level={level + 1}
              currentVersionId={currentVersionId}
              onSelectVersion={onSelectVersion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VersionSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  versions: Version[];
  currentVersionId: string;
  onSelectVersion: (version: Version) => void;
}

function VersionSidebar({ 
  isOpen, 
  onClose, 
  versions, 
  currentVersionId,
  onSelectVersion 
}: VersionSidebarProps) {
  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        className={classNames(
          "fixed inset-0 bg-black/30 z-10 lg:hidden transition-opacity duration-300",
          {
            "opacity-100": isOpen,
            "opacity-0 pointer-events-none": !isOpen
          }
        )}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div 
        className={classNames(
          "fixed top-[54px] bottom-0 bg-gray-900 w-64 transform transition-transform ease-in-out duration-300 z-20 border-l border-gray-800 shadow-xl",
          {
            "translate-x-0": isOpen,
            "-translate-x-full": !isOpen
          }
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-white">
            <MdHistory className="text-pink-500" />
            <h2 className="font-semibold">Version History</h2>
          </div>
          <button 
            className="text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            <IoMdClose />
          </button>
        </div>
        
        <div className="overflow-y-auto h-[calc(100vh-110px)] p-2">
          {versions.length === 0 ? (
            <div className="text-gray-400 text-sm p-4 text-center">
              No version history available yet
            </div>
          ) : (
            versions.map((version) => (
              <VersionNode 
                key={version.id} 
                version={version} 
                level={0}
                currentVersionId={currentVersionId}
                onSelectVersion={onSelectVersion}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default VersionSidebar; 