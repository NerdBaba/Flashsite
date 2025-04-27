import { TbArrowBackUp } from "react-icons/tb";
import { toast } from "react-toastify";
import classNames from "classnames";

interface UndoButtonProps {
  onClick: () => void;
  disabled: boolean;
  className?: string;
}

function UndoButton({ onClick, disabled, className }: UndoButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    console.log("Undo button clicked, disabled:", disabled);
    
    if (disabled) {
      toast.info("Nothing to undo yet");
      return;
    }
    
    onClick();
  };
  
  return (
    <button
      className={classNames(
        "bg-gray-950 shadow-sm flex items-center gap-1.5 text-white border border-gray-800 rounded-md py-1.5 px-3 hover:bg-gray-900 transition-colors focus:outline-none",
        { "opacity-50 hover:bg-gray-950": disabled },
        className
      )}
      disabled={disabled}
      onClick={handleClick}
      title="Undo changes (revert to previous version)"
    >
      <TbArrowBackUp className="text-lg" />
      <span className="text-sm font-medium">Undo</span>
    </button>
  );
}

export default UndoButton; 