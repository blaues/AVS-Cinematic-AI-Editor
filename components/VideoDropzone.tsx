import React, { useRef } from 'react';
import { Icons } from '../constants';

interface VideoDropzoneProps {
  onFileSelect: (file: File) => void;
}

export const VideoDropzone: React.FC<VideoDropzoneProps> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        onFileSelect(file);
      } else {
        alert("Please upload a video file.");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div 
      className="flex flex-col items-center justify-center w-full h-96 border-2 border-dashed border-gray-600 rounded-2xl bg-surface/50 hover:bg-surface hover:border-primary transition-all cursor-pointer group"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
    >
      <input 
        type="file" 
        accept="video/*" 
        className="hidden" 
        ref={inputRef}
        onChange={(e) => {
            if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
        }}
      />
      
      <div className="bg-gray-800 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300 shadow-xl shadow-black/20">
        <Icons.Upload className="w-10 h-10 text-primary" />
      </div>
      
      <h3 className="text-xl font-semibold text-white mb-2">Upload Video</h3>
      <p className="text-gray-400 text-center max-w-sm">
        Drag and drop your footage here, or click to browse.
        <br/><span className="text-xs text-gray-500 mt-2 block">Supports MP4, MOV, WebM</span>
      </p>
    </div>
  );
};