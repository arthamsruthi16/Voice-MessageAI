import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Pause, 
  Play, 
  Upload, 
  FileAudio, 
  Check, 
  Copy, 
  RotateCcw, 
  ChevronRight, 
  History, 
  Trash2, 
  Sparkles, 
  FileText, 
  MessageSquare, 
  Briefcase, 
  ListTodo, 
  Volume2, 
  HelpCircle, 
  Settings,
  AlertCircle
} from 'lucide-react';

interface SavedMessage {
  id: string;
  timestamp: string;
  title: string;
  transcription: string;
  casualSMS: string;
  professionalMessage: string;
  summary: string[];
  duration?: string;
}

export default function App() {
  // State variables
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [title, setTitle] = useState('');
  const [transcription, setTranscription] = useState('');
  const [casualSMS, setCasualSMS] = useState('');
  const [professionalMessage, setProfessionalMessage] = useState('');
  const [summary, setSummary] = useState<string[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<'casual' | 'professional' | 'summary' | 'raw'>('casual');

  // History & Persistence
  const [history, setHistory] = useState<SavedMessage[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Copy Feedback state
  const [copiedSection, setCopiedSection] = useState<'casual' | 'professional' | 'summary' | 'raw' | null>(null);

  // Refs for recording & visualization
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Web Audio Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('voice_to_text_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading history:', e);
      }
    }
  }, []);

  // Sync history to localStorage
  const saveHistory = (newHistory: SavedMessage[]) => {
    setHistory(newHistory);
    localStorage.setItem('voice_to_text_history', JSON.stringify(newHistory));
  };

  // Timer effect for recording
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Audio wave visualization
  const startVisualization = (stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Small fft for standard display bar visualizer
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        if (!analyserRef.current || !canvas) return;
        animationFrameRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Styling configuration
        const barWidth = (canvas.width / bufferLength) * 1.6;
        let barHeight;
        let x = 0;

        // Draw symmetrical glow bars from center
        for (let i = 0; i < bufferLength; i++) {
          // Normalize and scale values
          barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
          if (barHeight < 4) barHeight = 4; // Flatline minimum height

          // Ambient glowing color scheme (from sky-400 to violet-500)
          const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          grad.addColorStop(0, '#38bdf8'); // sky-400
          grad.addColorStop(1, '#a855f7'); // violet-500

          ctx.fillStyle = grad;
          
          // Draw rounded bar
          const roundRadius = 3;
          const y = canvas.height / 2 - barHeight / 2;
          
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth - 4, barHeight, roundRadius);
          ctx.fill();

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.error('Failed to initialize audio visualization:', err);
    }
  };

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
    }
    analyserRef.current = null;
    audioContextRef.current = null;
  };

  // Recording actions
  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    setUploadedFile(null);
    audioChunksRef.current = [];
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Detect supported mime type
      let selectedMimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        selectedMimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        selectedMimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        selectedMimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
        setAudioBlob(audioBlob);
        stopVisualization();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start(250); // Get chunks every 250ms
      setIsRecording(true);
      setIsPaused(false);
      startVisualization(stream);
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError('Could not access microphone. Please allow microphone permission to record audio.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // File selection handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        setUploadedFile(file);
        setAudioBlob(null);
        setError(null);
      } else {
        setError('Unsupported file type. Please upload a valid audio recording file.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        setUploadedFile(file);
        setAudioBlob(null);
        setError(null);
      } else {
        setError('Unsupported file type. Please upload a valid audio recording file.');
      }
    }
  };

  // Core conversion handling
  const handleConvert = async () => {
    setError(null);
    setIsLoading(true);

    const activeBlob = audioBlob || uploadedFile;
    if (!activeBlob) {
      setError('No audio source found. Please record or upload an audio file first.');
      setIsLoading(false);
      return;
    }

    try {
      setLoadingStep('Uploading and packaging audio file...');
      
      // Convert Blob/File to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(activeBlob);
      });

      const base64Audio = await base64Promise;
      const mimeType = activeBlob.type || 'audio/webm';

      setLoadingStep('Sending audio to Gemini API for transcription & message generation...');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType,
          instruction: customInstruction,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server returned an error during transcription.');
      }

      setLoadingStep('Assembling message templates...');
      
      setTitle(data.title || 'Spoken Message Note');
      setTranscription(data.transcription);
      setCasualSMS(data.casualSMS);
      setProfessionalMessage(data.professionalMessage);
      setSummary(data.summary || []);

      // Save to history list
      const durationStr = audioBlob ? formatTime(recordingTime) : '';
      const newHistoryItem: SavedMessage = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date().toLocaleDateString(),
        title: data.title || 'Voice Memo Draft',
        transcription: data.transcription,
        casualSMS: data.casualSMS,
        professionalMessage: data.professionalMessage,
        summary: data.summary || [],
        duration: durationStr || undefined
      };

      const updatedHistory = [newHistoryItem, ...history.slice(0, 19)]; // Keep last 20 entries
      saveHistory(updatedHistory);
      setSelectedHistoryId(newHistoryItem.id);

    } catch (err: any) {
      console.error('Conversion process failed:', err);
      setError(err.message || 'Failed to process audio. Please check your API credentials or try a shorter/clearer recording.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // History loader
  const loadHistoryItem = (item: SavedMessage) => {
    setSelectedHistoryId(item.id);
    setTitle(item.title);
    setTranscription(item.transcription);
    setCasualSMS(item.casualSMS);
    setProfessionalMessage(item.professionalMessage);
    setSummary(item.summary || []);
    setError(null);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      setTitle('');
      setTranscription('');
      setCasualSMS('');
      setProfessionalMessage('');
      setSummary([]);
    }
  };

  const clearAllHistory = () => {
    if (confirm('Are you sure you want to delete all saved transcription drafts?')) {
      saveHistory([]);
      setSelectedHistoryId(null);
      setTitle('');
      setTranscription('');
      setCasualSMS('');
      setProfessionalMessage('');
      setSummary([]);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, section: 'casual' | 'professional' | 'summary' | 'raw') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans antialiased">
      
      {/* Dynamic Header */}
      <header id="app-header" className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-sky-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-sky-500/10">
            <Mic className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Voice Message AI
            </h1>
            <p className="text-xs text-slate-400 font-medium">Turn Spoken Notes into Perfect Messages</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
            <span>Powered by Gemini 3.5 Flash</span>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div id="main-content-layout" className="flex-1 flex flex-col lg:flex-row min-h-0">
        
        {/* Left Sidebar: Session History */}
        <aside id="history-sidebar" className="w-full lg:w-80 border-r border-slate-800 bg-slate-950/40 p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
              <History className="h-4 w-4 text-sky-400" />
              <span>Draft History</span>
              {history.length > 0 && (
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-xs font-normal">
                  {history.length}
                </span>
              )}
            </div>
            {history.length > 0 && (
              <button 
                onClick={clearAllHistory}
                className="text-slate-500 hover:text-red-400 transition-colors duration-150 p-1 rounded-md hover:bg-slate-800/40"
                title="Clear all history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {history.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                <div className="bg-slate-850 p-3 rounded-full mb-3 text-slate-600 border border-slate-800">
                  <FileAudio className="h-6 w-6" />
                </div>
                <p className="text-xs text-slate-500">No voice drafts converted yet in this session.</p>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => loadHistoryItem(item)}
                  className={`w-full p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 group flex items-start justify-between gap-2 ${
                    selectedHistoryId === item.id 
                      ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-500/5' 
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium text-xs truncate ${selectedHistoryId === item.id ? 'text-indigo-300' : 'text-slate-200'}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-slate-500">{item.timestamp}</span>
                      {item.duration && (
                        <>
                          <span className="text-slate-700">•</span>
                          <span className="text-[10px] text-sky-400 flex items-center gap-0.5 font-medium">
                            <Volume2 className="h-2.5 w-2.5" />
                            {item.duration}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-800 transition-all duration-150"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center Panel: Interactive Workdesk */}
        <main id="main-workdesk" className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
          
          {error && (
            <div id="error-banner" className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 flex gap-3 text-red-300 text-sm animate-fade-in shadow-md">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Unable to process request: </span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Setup / Recording Deck */}
          <div id="input-card" className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            
            {/* Input Selection Tabs */}
            <div className="flex border-b border-slate-800/80 mb-6 gap-6">
              <button
                onClick={() => { setActiveTab('record'); setError(null); }}
                className={`pb-3 text-sm font-semibold tracking-wide flex items-center gap-2 transition-all relative ${
                  activeTab === 'record' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Mic className="h-4 w-4" />
                <span>Record Live Speech</span>
                {activeTab === 'record' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-full" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('upload'); setError(null); }}
                className={`pb-3 text-sm font-semibold tracking-wide flex items-center gap-2 transition-all relative ${
                  activeTab === 'upload' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="h-4 w-4" />
                <span>Upload Audio File</span>
                {activeTab === 'upload' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-full" />
                )}
              </button>
            </div>

            {/* Tab 1: Live Voice Recorder */}
            {activeTab === 'record' && (
              <div className="flex flex-col items-center py-4">
                
                {/* Timer Display */}
                <div className="text-3xl font-mono tracking-wider font-semibold text-slate-100 mb-2">
                  {formatTime(recordingTime)}
                </div>

                {/* Subtitle / Hints */}
                <p className="text-xs text-slate-400 mb-6 text-center max-w-sm">
                  {isRecording 
                    ? (isPaused ? 'Recording paused. Click Resume to continue.' : 'Recording in progress... speak clearly.') 
                    : 'Click the microphone button to start recording a spoken memo.'}
                </p>

                {/* Live Real-time Wave Visualizer */}
                <div className="w-full max-w-md h-16 bg-slate-900/50 border border-slate-800/80 rounded-xl overflow-hidden mb-6 flex items-center justify-center relative">
                  <canvas 
                    ref={canvasRef} 
                    className="w-full h-full"
                    width={448} 
                    height={64}
                  />
                  {!isRecording && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-[2px] w-5/6 bg-slate-800 rounded-full" />
                    </div>
                  )}
                </div>

                {/* Recording Control Pad */}
                <div className="flex items-center gap-4">
                  
                  {isRecording && (
                    <button
                      onClick={pauseRecording}
                      className={`p-3.5 rounded-full border border-slate-700/60 transition-all duration-200 ${
                        isPaused 
                          ? 'bg-emerald-950/50 text-emerald-400 hover:bg-emerald-900/40 border-emerald-500/35' 
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                      title={isPaused ? 'Resume recording' : 'Pause recording'}
                    >
                      {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                    </button>
                  )}

                  {/* Primary Trigger Button */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`relative p-6 rounded-full transition-all duration-300 shadow-xl ${
                      isRecording 
                        ? 'bg-red-500 hover:bg-red-600 hover:scale-105 shadow-red-500/20 text-white animate-pulse' 
                        : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 hover:scale-105 shadow-sky-500/20 text-white'
                    }`}
                  >
                    {isRecording ? <Square className="h-6 w-6 fill-white" /> : <Mic className="h-6 w-6" />}
                  </button>

                  {/* Clear / Reset Audio Blob button */}
                  {audioBlob && !isRecording && (
                    <button
                      onClick={() => { setAudioBlob(null); setRecordingTime(0); }}
                      className="p-3.5 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all border border-slate-700/40"
                      title="Clear recording"
                    >
                      <RotateCcw className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Recorded Audio Feedback Wave */}
                {audioBlob && !isRecording && (
                  <div className="mt-6 w-full max-w-md bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-4 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-950 rounded-lg">
                        <Volume2 className="h-4.5 w-4.5 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Voice Recording ready</p>
                        <p className="text-[10px] text-slate-500">Captured in session • {formatTime(recordingTime)}</p>
                      </div>
                    </div>
                    <audio 
                      src={URL.createObjectURL(audioBlob)} 
                      controls 
                      className="h-8 max-w-[180px] sm:max-w-xs scale-90"
                    />
                  </div>
                )}

              </div>
            )}

            {/* Tab 2: Audio File Upload */}
            {activeTab === 'upload' && (
              <div className="flex flex-col items-center">
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`w-full max-w-lg border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${
                    uploadedFile 
                      ? 'border-indigo-500/50 bg-indigo-950/10' 
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/30'
                  }`}
                  onClick={() => document.getElementById('audio-file-input')?.click()}
                >
                  <input
                    id="audio-file-input"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  
                  <div className="bg-slate-900 p-4 rounded-full border border-slate-800/80 text-slate-400 mb-4 shadow-md group-hover:text-indigo-400 transition-colors">
                    <Upload className="h-6 w-6" />
                  </div>

                  {uploadedFile ? (
                    <div className="text-center">
                      <p className="font-semibold text-sm text-slate-200 truncate max-w-xs">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Audio Format</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                        className="mt-3 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="font-semibold text-sm text-slate-300">Drag & drop your voice recording file here</p>
                      <p className="text-xs text-slate-500 mt-1">or click to browse local files</p>
                      <p className="text-[10px] text-slate-600 mt-3">Supports MP3, WAV, M4A, WEBM, AAC (up to 25MB)</p>
                    </div>
                  )}
                </div>

                {uploadedFile && (
                  <div className="mt-4 w-full max-w-lg flex justify-center">
                    <audio 
                      src={URL.createObjectURL(uploadedFile)} 
                      controls 
                      className="h-8 w-full max-w-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Custom Transcription Instruction Input */}
            <div className="mt-6 pt-5 border-t border-slate-800/60 max-w-xl mx-auto">
              <label htmlFor="custom-instruction" className="block text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>Formatting Instructions & Context (Optional)</span>
              </label>
              <textarea
                id="custom-instruction"
                rows={2}
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="E.g., 'Make the email draft extra formal', 'Translate the resulting SMS to Spanish', 'Summarize key project assignments with deadlines.'"
                className="w-full text-xs bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-2.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
              />
            </div>

            {/* Action Trigger Button */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleConvert}
                disabled={isLoading || isRecording || (!audioBlob && !uploadedFile)}
                className={`px-8 py-3 rounded-xl font-semibold text-sm tracking-wide transition-all shadow-lg flex items-center gap-2 ${
                  isLoading || isRecording || (!audioBlob && !uploadedFile)
                    ? 'bg-slate-800 text-slate-500 border border-slate-800/80 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 hover:from-sky-300 hover:to-indigo-400 hover:scale-[1.02] text-white shadow-indigo-500/10'
                }`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Converting Voice Note...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-sky-200" />
                    <span>Convert to Text Message</span>
                  </>
                )}
              </button>
            </div>

            {/* Glowing bottom line loader */}
            {isLoading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 animate-[loading_1.5s_infinite] w-1/2 rounded-full" />
              </div>
            )}
          </div>

          {/* Loading Stage indicator */}
          {isLoading && (
            <div id="loader-status" className="bg-slate-950/20 border border-slate-850 p-4 rounded-xl flex items-center justify-center gap-3 animate-pulse">
              <Sparkles className="h-4 w-4 text-indigo-400 animate-spin" />
              <p className="text-xs font-medium text-slate-400">{loadingStep}</p>
            </div>
          )}

          {/* Results Bento Layout */}
          {(transcription || selectedHistoryId) && !isLoading && (
            <div id="results-dashboard" className="space-y-6 animate-fade-in-up">
              
              {/* Header result detailing note name & rename possibility */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-950/20 p-4 rounded-2xl border border-slate-850">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-indigo-950 p-2 rounded-lg text-indigo-400">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <input 
                      type="text" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none font-bold text-lg text-slate-100 py-0.5 truncate max-w-sm sm:max-w-md cursor-pointer"
                      title="Click to rename"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">Edit note title above or click tabs below to copy templates</p>
                  </div>
                </div>
              </div>

              {/* Mobile result navigation bar */}
              <div className="flex border-b border-slate-800">
                <button
                  onClick={() => setActiveResultTab('casual')}
                  className={`flex-1 py-3 px-1 text-center font-semibold text-xs tracking-wide flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                    activeResultTab === 'casual' 
                      ? 'border-indigo-500 text-slate-100 bg-slate-900/40' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Polished Casual (SMS)</span>
                  <span className="sm:hidden">Casual</span>
                </button>
                <button
                  onClick={() => setActiveResultTab('professional')}
                  className={`flex-1 py-3 px-1 text-center font-semibold text-xs tracking-wide flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                    activeResultTab === 'professional' 
                      ? 'border-indigo-500 text-slate-100 bg-slate-900/40' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden sm:inline">Professional Draft (Slack)</span>
                  <span className="sm:hidden">Pro</span>
                </button>
                <button
                  onClick={() => setActiveResultTab('summary')}
                  className={`flex-1 py-3 px-1 text-center font-semibold text-xs tracking-wide flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                    activeResultTab === 'summary' 
                      ? 'border-indigo-500 text-slate-100 bg-slate-900/40' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ListTodo className="h-4 w-4" />
                  <span className="hidden sm:inline">Key Bullet Takeaways</span>
                  <span className="sm:hidden">Summary</span>
                </button>
                <button
                  onClick={() => setActiveResultTab('raw')}
                  className={`flex-1 py-3 px-1 text-center font-semibold text-xs tracking-wide flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                    activeResultTab === 'raw' 
                      ? 'border-indigo-500 text-slate-100 bg-slate-900/40' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Raw Transcription</span>
                  <span className="sm:hidden">Raw</span>
                </button>
              </div>

              {/* Tab Outputs Content Card */}
              <div id="output-pane" className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl relative min-h-[250px]">
                
                {/* 1. Casual Chat SMS Tab */}
                {activeResultTab === 'casual' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Polished Casual (WhatsApp / SMS)</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(casualSMS, 'casual')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${
                          copiedSection === 'casual'
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {copiedSection === 'casual' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Message</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Chat Bubble Interface Mockup */}
                    <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800/80 max-w-xl mx-auto shadow-inner relative">
                      <div className="absolute top-3 left-4 flex gap-1 items-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                      </div>
                      
                      {/* Rounded SMS/WhatsApp Speech Bubble */}
                      <div className="mt-4 flex flex-col items-end">
                        <div className="bg-gradient-to-tr from-sky-500 to-indigo-600 text-white rounded-2xl rounded-tr-none px-4.5 py-3 shadow-lg max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap select-all">
                          {casualSMS}
                        </div>
                        <span className="text-[9px] text-slate-500 mt-1.5 mr-1 font-mono uppercase">
                          Delivered • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Professional Work Draft Tab */}
                {activeResultTab === 'professional' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Professional Format (Slack / Teams / Email)</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(professionalMessage, 'professional')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${
                          copiedSection === 'professional'
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {copiedSection === 'professional' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Message</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Slack Workspace Layout Mockup */}
                    <div className="bg-slate-900/60 rounded-2xl border border-slate-800/80 p-5 shadow-inner">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md">
                          ME
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-xs text-slate-200">Me</span>
                            <span className="text-[10px] text-slate-500 font-mono">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          
                          {/* Inner clean text presentation */}
                          <div className="mt-2 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap select-all bg-slate-950/40 p-4.5 rounded-xl border border-slate-800/40 font-sans">
                            {professionalMessage}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Actionable Takeaways Bullet List Tab */}
                {activeResultTab === 'summary' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Key Bullet Takeaways & Actions</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(summary.map(s => `• ${s}`).join('\n'), 'summary')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${
                          copiedSection === 'summary'
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {copiedSection === 'summary' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied All!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Bullet List</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Styled list display */}
                    <div className="bg-slate-900/60 rounded-2xl border border-slate-800/80 p-6 shadow-inner">
                      {summary.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">No specific action bullets generated.</p>
                      ) : (
                        <ul className="space-y-3.5">
                          {summary.map((point, index) => (
                            <li key={index} className="flex items-start gap-3 group">
                              <div className="h-5 w-5 rounded-md bg-indigo-950/80 border border-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-indigo-500/40 transition-colors">
                                <Check className="h-3 w-3 text-sky-400" />
                              </div>
                              <span className="text-sm text-slate-300 leading-relaxed font-sans">{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Raw Voice Transcription Tab */}
                {activeResultTab === 'raw' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Word-for-Word Voice Transcript</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(transcription, 'raw')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${
                            copiedSection === 'raw'
                              ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {copiedSection === 'raw' ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Transcript</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Fully Editable Raw Transcription Area */}
                    <div className="relative">
                      <textarea
                        value={transcription}
                        onChange={(e) => setTranscription(e.target.value)}
                        rows={6}
                        className="w-full text-sm bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-sans leading-relaxed resize-y select-all shadow-inner"
                        placeholder="Raw audio transcription content..."
                      />
                      <span className="absolute bottom-3 right-4 text-[10px] text-slate-500 font-medium select-none pointer-events-none">
                        Editable transcription draft
                      </span>
                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

        </main>

      </div>

      {/* Styled inline animation injection for custom loading bars */}
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(200%); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.2);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.4);
        }
      `}</style>

    </div>
  );
}
