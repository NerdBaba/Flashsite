import { MdHistory } from "react-icons/md";
import classNames from "classnames";

interface HistoryButtonProps {
  onClick: () => void;
  isOpen: boolean;
  className?: string;
}

function HistoryButton({ onClick, isOpen, className }: HistoryButtonProps) {
  return (
    <button
      className={classNames(
        "bg-gray-950 shadow-sm flex items-center gap-1.5 text-white border border-gray-800 rounded-md py-1.5 px-3 hover:bg-gray-900 transition-colors focus:outline-none",
        { "bg-gray-800 border-gray-700": isOpen },
        className
      )}
      onClick={onClick}
      title="Version history"
    >
      <MdHistory className={classNames("text-lg", { "text-pink-500": isOpen })} />
      <span className="text-sm font-medium">History</span>
    </button>
  );
}

export default HistoryButton; 