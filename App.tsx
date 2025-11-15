import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PromptItem, LogEntry, GenerationResult, Settings } from './types';
import { generateImageFromReference, generateImageFromText } from './services/geminiService';
import { UploadIcon, FileExcelIcon, PlayIcon, DownloadIcon, SpinnerIcon, TrashIcon, CheckCircleIcon, SparklesIcon, KeyIcon, TextIcon } from './components/Icons';

declare const XLSX: any; // From CDN
declare const JSZip: any; // From CDN
declare const window: any; // For window.aistudio

const sanitizeFilename = (name: string) => {
  return name.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 50);
};

// --- Reusable Components ---

const Card: React.FC<{ title: string; children: React.ReactNode; info?: string }> = ({ title, children, info }) => (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-indigo-400 mb-4 border-b border-gray-700 pb-2 flex justify-between items-center">
            {title}
            {info && <span className="text-sm font-normal text-gray-400">{info}</span>}
        </h2>
        {children}
    </div>
);

const ApiKeyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onKeySubmit: (key: string) => void;
    currentKey: string | null;
    error: string | null;
}> = ({ isOpen, onClose, onKeySubmit, currentKey, error }) => {
    if (!isOpen) return null;

    const [inputKey, setInputKey] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputKey.trim()) {
            onKeySubmit(inputKey.trim());
            setInputKey(''); // Clear input after submit
        }
    };
    
    const handleClear = () => {
        onKeySubmit(''); // Pass empty string to signal clearing
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-white text-3xl font-bold">&times;</button>
                 <form onSubmit={handleSubmit}>
                    <h1 className="text-3xl font-bold text-white mb-2">Manage API Key</h1>
                    <p className="text-gray-400 mb-6">
                        {currentKey ? 'Your API key is set. Enter a new key below to update it.' : 'To use this application, you need to provide your Gemini API key from Google AI Studio.'}
                    </p>
                    {error && <p className="text-red-400 text-sm bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}
                    <div className="text-left mb-4">
                        <label htmlFor="api-key-input" className="block text-sm font-medium text-gray-300 mb-2">Gemini API Key</label>
                        <input
                            id="api-key-input"
                            type="password"
                            value={inputKey}
                            onChange={(e) => setInputKey(e.target.value)}
                            placeholder="Paste your API Key here"
                            className="w-full bg-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                        />
                    </div>
                     <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline text-sm block mb-6 text-left">
                        Get an API Key from Google AI Studio →
                    </a>
                     <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="submit"
                            disabled={!inputKey.trim()}
                            className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center shadow-lg"
                        >
                            <SparklesIcon /> Save Key
                        </button>
                        {currentKey && (
                            <button
                                type="button"
                                onClick={handleClear}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-md transition duration-300 flex items-center justify-center"
                            >
                                <TrashIcon /> Clear Key
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Main App Component ---

const App: React.FC = () => {
    const [referenceImage, setReferenceImage] = useState<File | null>(null);
    const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [settings, setSettings] = useState<Settings>({ numberOfImages: 1, concurrency: 3, aspectRatio: '16:9' });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
    const [directPrompt, setDirectPrompt] = useState('');
    const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
    const [batchMode, setBatchMode] = useState<'edit' | 'text'>('edit');
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    
    const logCounter = useRef(0);
    const singleGenerationCounter = useRef(10000);

    useEffect(() => {
        const storedKey = localStorage.getItem('gemini-api-key');
        if (storedKey) {
            setApiKey(storedKey);
        }
    }, []);
  
    const handleKeySubmit = (key: string) => {
        if (key) {
            localStorage.setItem('gemini-api-key', key);
            setApiKey(key);
            addLog('API Key saved successfully.', 'success');
        } else {
            localStorage.removeItem('gemini-api-key');
            setApiKey(null);
            addLog('API Key cleared.', 'info');
        }
        setApiKeyError(null);
        setIsApiKeyModalOpen(false);
    };
    
    const handleInvalidApiKey = useCallback(() => {
        addLog('API Key appears to be invalid. Please provide a new one.', 'error');
        setApiKeyError('Your API Key appears to be invalid. Please enter a new, valid key to continue.');
        setIsApiKeyModalOpen(true);
    }, []);
    
    const handleCloseModal = () => {
        setIsApiKeyModalOpen(false);
        setApiKeyError(null);
    }

    const addLog = useCallback((message: string, type: LogEntry['type']) => {
        setLogs(prev => [{ id: logCounter.current++, message, type }, ...prev]);
    }, []);

    const generateWithRetry = useCallback(async <T extends (...args: any[]) => any>(
        fn: T,
        logContext: string,
        ...args: Parameters<T>
    ): Promise<ReturnType<T>> => {
        let attempts = 0;
        const maxAttempts = 4; // try once, retry 3 times
        let delay = 2000; // 2 seconds initial delay

        while (true) {
            try {
                return await fn(...args);
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('RATE_LIMIT:')) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        addLog(`${logContext} ❌ Rate limit exceeded after ${maxAttempts} attempts. Aborting this item. Try reducing concurrency.`, 'error');
                        throw error;
                    }
                    addLog(`${logContext} ⏳ Rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${attempts})`, 'info');
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                } else {
                    // Not a rate limit error, throw immediately
                    throw error;
                }
            }
        }
    }, [addLog]);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setReferenceImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setReferenceImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            addLog(`Selected reference image: ${file.name}`, 'info');
        }
    };
    
    const handleExcelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet) as any[];

                    if (json.length > 0 && 'STT' in json[0] && 'PROMPT' in json[0]) {
                        const loadedPrompts = json.map(row => ({
                            stt: Number(row.STT),
                            prompt: String(row.PROMPT)
                        })).filter(p => p.stt && p.prompt);
                        setPrompts(loadedPrompts);
                        addLog(`Loaded ${loadedPrompts.length} prompts from ${file.name}.`, 'success');
                    } else {
                        throw new Error('Excel file must have "STT" and "PROMPT" columns.');
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Unknown error parsing Excel file.";
                    addLog(message, 'error');
                    setPrompts([]);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };

    const handleStartBatchGeneration = async () => {
        if (!apiKey) {
            addLog('API Key is required. Please set your API Key to start generating.', 'error');
            setApiKeyError('An API Key is required before you can start a generation task.');
            setIsApiKeyModalOpen(true);
            return;
        }

        if (prompts.length === 0) {
            addLog('Please load a prompt file for batch generation.', 'error');
            return;
        }

        if (batchMode === 'edit' && !referenceImage) {
            addLog('Please select a reference image for Batch Edit mode.', 'error');
            return;
        }

        setIsProcessing(true);
        setResults([]);
        setLogs([]);
        setSelectedResults(new Set());
        addLog(`Starting batch generation in '${batchMode}' mode...`, 'info');

        const promptsQueue = [...prompts];
        let apiKeyIsInvalid = false;
        
        const processChunk = async () => {
            if (apiKeyIsInvalid) return;

            const chunk = promptsQueue.splice(0, settings.concurrency);
            if (chunk.length === 0) return;

            await Promise.allSettled(chunk.map(async (p) => {
                if (apiKeyIsInvalid) return;
                try {
                    let imageData;
                    if (batchMode === 'edit') {
                        imageData = await generateWithRetry(
                            generateImageFromReference,
                            `[STT ${p.stt}]`,
                            apiKey,
                            referenceImage!, // We've already checked this isn't null
                            p.prompt
                        );
                    } else { // batchMode === 'text'
                        imageData = await generateWithRetry(
                            generateImageFromText,
                            `[STT ${p.stt}]`,
                            apiKey,
                            p.prompt,
                            settings.aspectRatio
                        );
                    }
                    setResults(prev => [...prev, { stt: p.stt, prompt: p.prompt, imageData: `data:image/jpeg;base64,${imageData}` }]);
                    addLog(`[STT ${p.stt}] ✅ Successfully generated image.`, 'success');
                } catch (error) {
                    const message = error instanceof Error ? error.message.replace('RATE_LIMIT: ', '') : 'An unknown error occurred.';
                    if (!apiKeyIsInvalid && (message.includes('API key not valid') || message.includes('Requested entity was not found'))) {
                        apiKeyIsInvalid = true;
                    }
                    addLog(`[STT ${p.stt}] ❌ Generation failed. Reason: ${message}`, 'error');
                }
            }));

            if(promptsQueue.length > 0) {
              await processChunk();
            }
        };

        await processChunk();
        
        if (apiKeyIsInvalid) {
            handleInvalidApiKey();
        } else {
            addLog('Batch generation process finished.', 'info');
        }
        setIsProcessing(false);
    };

    const handleGenerateSingle = async () => {
        if (!apiKey) {
            addLog('API Key is required. Please set your API Key to start generating.', 'error');
            setApiKeyError('An API Key is required before you can start a generation task.');
            setIsApiKeyModalOpen(true);
            return;
        }
        if (!directPrompt.trim()) {
            addLog('Please enter a prompt for single generation.', 'error');
            return;
        }
    
        setIsGeneratingSingle(true);
        addLog(`Starting single generation for prompt: "${directPrompt}"`, 'info');
        
        try {
            let imageData: string;
            if (referenceImage) {
                 imageData = await generateWithRetry(
                    generateImageFromReference,
                    '[Single Edit]',
                    apiKey,
                    referenceImage,
                    directPrompt
                );
            } else {
                imageData = await generateWithRetry(
                    generateImageFromText,
                    '[Single Generate]',
                    apiKey,
                    directPrompt,
                    settings.aspectRatio
                );
            }

            const newStt = singleGenerationCounter.current++;
            setResults(prev => [{ stt: newStt, prompt: directPrompt, imageData: `data:image/jpeg;base64,${imageData}` }, ...prev]);
            addLog(`✅ Successfully generated image for "${directPrompt}".`, 'success');
    
        } catch (error) {
            const message = error instanceof Error ? error.message.replace('RATE_LIMIT: ', '') : 'An unknown error occurred.';
            if (message.includes('API key not valid') || message.includes('Requested entity was not found')) {
                handleInvalidApiKey();
            } else {
                addLog(`❌ Failed to generate single image. Reason: ${message}`, 'error');
            }
        }
    
        setIsGeneratingSingle(false);
    };

    const handleSelectResult = (stt: number) => {
        setSelectedResults(prev => {
            const newSet = new Set(prev);
            if (newSet.has(stt)) {
                newSet.delete(stt);
            } else {
                newSet.add(stt);
            }
            return newSet;
        });
    };
    
    const handleDeleteSelected = () => {
        setResults(prev => prev.filter(r => !selectedResults.has(r.stt)));
        addLog(`Deleted ${selectedResults.size} images.`, 'info');
        setSelectedResults(new Set());
    };
    
    const handleDownloadSelected = async () => {
        if (selectedResults.size === 0) return;
        addLog(`Preparing to download ${selectedResults.size} images...`, 'info');
    
        if (!JSZip) {
            addLog('JSZip library not found. Cannot create zip file.', 'error');
            return;
        }
        const zip = new JSZip();
    
        const selectedItems = results.filter(r => selectedResults.has(r.stt));
    
        for (const result of selectedItems) {
            try {
                const response = await fetch(result.imageData);
                const blob = await response.blob();
                const filename = `${result.stt}_${sanitizeFilename(result.prompt)}.jpg`;
                zip.file(filename, blob);
            } catch (error) {
                addLog(`Could not process image STT ${result.stt} for zipping.`, 'error');
            }
        }
    
        zip.generateAsync({ type: 'blob' }).then((content: any) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'generated_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            addLog('Successfully created and downloaded zip file.', 'success');
        }).catch((err: Error) => {
            addLog(`Failed to create zip file: ${err.message}`, 'error');
        });
    };
    
    const isBatchReady = (batchMode === 'edit' && !!referenceImage && prompts.length > 0) || (batchMode === 'text' && prompts.length > 0);

    return (
        <>
        <ApiKeyModal
            isOpen={isApiKeyModalOpen}
            onClose={handleCloseModal}
            onKeySubmit={handleKeySubmit}
            currentKey={apiKey}
            error={apiKeyError}
        />
        <div className="min-h-screen bg-gray-900 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8 relative">
                    <h1 className="text-4xl font-bold text-white">Gemini Batch Image Generator</h1>
                    <p className="text-lg text-gray-400 mt-2">Create and edit images individually or in batches.</p>
                     <div className="absolute top-0 right-0">
                        <button
                            onClick={() => setIsApiKeyModalOpen(true)}
                            title="Manage API Key"
                            className={`flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-colors ${apiKey ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                        >
                            <KeyIcon />
                            <span className="ml-2 hidden sm:inline">{apiKey ? 'API Key Set' : 'Set API Key'}</span>
                        </button>
                    </div>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-8 flex flex-col">
                        
                        <Card title="1. Inputs">
                            <div className="space-y-4">
                                <div className={`transition-opacity ${batchMode === 'text' ? 'opacity-60' : ''}`}>
                                    <label htmlFor="image-upload" className="cursor-pointer w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-md inline-flex items-center justify-center transition duration-300">
                                        <UploadIcon />
                                        <span>{referenceImage ? 'Change Reference Image' : 'Select Reference Image'}</span>
                                    </label>
                                    <input id="image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={isProcessing || isGeneratingSingle} />
                                    {referenceImagePreview && (
                                        <div className="mt-4 p-2 bg-gray-900 rounded-lg">
                                            <img src={referenceImagePreview} alt="Reference Preview" className="max-h-48 w-full object-contain rounded" />
                                            <p className="text-center text-sm text-gray-400 mt-2 truncate">{referenceImage?.name}</p>
                                        </div>
                                    )}
                                     <p className="text-xs text-gray-500 mt-2 text-center">
                                         {batchMode === 'text'
                                            ? 'Reference image is not used for batch "Generate from Text".'
                                            : 'Optional. Used for editing an image.'
                                         }
                                     </p>
                                </div>
                                <div>
                                    <label htmlFor="excel-upload" className="cursor-pointer w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-md inline-flex items-center justify-center transition duration-300">
                                        <FileExcelIcon />
                                        <span>{prompts.length > 0 ? `Loaded ${prompts.length} Prompts` : 'Select Prompt File'}</span>
                                    </label>
                                    <input id="excel-upload" type="file" className="hidden" accept=".xlsx" onChange={handleExcelChange} disabled={isProcessing || isGeneratingSingle} />
                                    <p className="text-xs text-gray-500 mt-2 text-center">.xlsx file with 'STT' and 'PROMPT' columns.</p>
                                </div>
                            </div>
                        </Card>
                        
                        <Card title="2. Generation">
                            {/* --- SINGLE GENERATION --- */}
                            <div className="border-b border-gray-700 pb-4">
                                <h3 className="font-semibold text-lg text-gray-200 mb-2">Single Image</h3>
                                <textarea
                                    className="w-full bg-gray-700 text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                                    rows={3}
                                    placeholder="Enter your prompt here..."
                                    value={directPrompt}
                                    onChange={(e) => setDirectPrompt(e.target.value)}
                                    disabled={isProcessing || isGeneratingSingle}
                                />
                                 <div className="mt-3">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio (for new images)</label>
                                    <div className={`grid grid-cols-5 gap-2 ${referenceImage ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        {(['16:9', '1:1', '9:16', '4:3', '3:4'] as const).map(ratio => (
                                            <button
                                                key={ratio}
                                                onClick={() => !referenceImage && setSettings(s => ({...s, aspectRatio: ratio}))}
                                                disabled={!!referenceImage}
                                                title={referenceImage ? 'Uses reference image aspect ratio' : `Set aspect ratio to ${ratio}`}
                                                className={`px-2 py-1 text-xs sm:text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 ${settings.aspectRatio === ratio ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={handleGenerateSingle}
                                    disabled={!directPrompt.trim() || isProcessing || isGeneratingSingle}
                                    className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-3 px-4 rounded-md inline-flex items-center justify-center transition duration-300"
                                >
                                    {isGeneratingSingle ? <SpinnerIcon /> : <PlayIcon />}
                                    <span className="ml-2">{referenceImage ? 'Edit Image' : 'Generate Image'}</span>
                                </button>
                            </div>

                            {/* --- BATCH GENERATION --- */}
                             <div className="pt-4">
                                <h3 className="font-semibold text-lg text-gray-200 mb-3">Batch Generation</h3>
                                <div className="flex border-b border-gray-600 mb-4">
                                    <button onClick={() => setBatchMode('edit')} className={`flex-1 py-2 text-sm font-medium transition-colors ${batchMode === 'edit' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}>
                                        Edit with Image
                                    </button>
                                    <button onClick={() => setBatchMode('text')} className={`flex-1 py-2 text-sm font-medium transition-colors ${batchMode === 'text' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}>
                                        Generate from Text
                                    </button>
                                </div>
                                
                                {batchMode === 'edit' ? (
                                    <div className="text-xs text-gray-400 bg-gray-700/50 p-3 rounded-md mb-4 space-y-3">
                                        <p>
                                            <strong>Cách hoạt động:</strong> Chế độ này dùng 'Ảnh Gốc' của bạn làm điểm bắt đầu. Với mỗi 'câu lệnh' trong file, nó sẽ tạo ra một ảnh mới đã được chỉnh sửa.
                                        </p>
                                        <div className="flex items-center justify-around space-x-1 text-center text-gray-300 font-medium">
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center mb-1"><UploadIcon /></div>
                                                <span>Ảnh Gốc</span>
                                            </div>
                                            <span className="text-2xl font-light text-indigo-400">+</span>
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center mb-1"><TextIcon /></div>
                                                <span>Câu Lệnh</span>
                                            </div>
                                            <span className="text-2xl font-light text-indigo-400">=</span>
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center mb-1 text-yellow-300"><SparklesIcon /></div>
                                                <span>Ảnh Mới</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-400 bg-gray-700/50 p-3 rounded-md mb-4">
                                        <p><strong>Cách hoạt động:</strong> Chế độ này chỉ cần 'File câu lệnh'. Nó sẽ tạo một ảnh hoàn toàn mới cho mỗi câu lệnh, sử dụng 'Tỷ Lệ Khung Hình' đã chọn ở mục "Single Image".</p>
                                    </div>
                                )}


                                <button
                                    onClick={handleStartBatchGeneration}
                                    disabled={!isBatchReady || isProcessing || isGeneratingSingle}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-lg inline-flex items-center justify-center transition duration-300 text-lg shadow-lg"
                                >
                                    {isProcessing ? <><SpinnerIcon /> Processing...</> : <><PlayIcon /> Start Batch</>}
                                </button>
                            </div>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-8">
                        <Card title="Progress Log">
                            <div className="h-64 bg-gray-900 rounded-lg p-4 overflow-y-auto font-mono text-sm space-y-2 flex flex-col-reverse">
                                {logs.map(log => (
                                    <p key={log.id} className={`${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
                                        <span className="text-gray-500 mr-2">{new Date().toLocaleTimeString()} &gt;</span>
                                        {log.message}
                                    </p>
                                ))}
                            </div>
                        </Card>

                        <Card title="Generated Results" info={`${results.length} images`}>
                             {!isProcessing && (
                                <p className="text-center text-sm text-gray-500 mb-4 -mt-2">
                                    Tác giả: Thành IT - SDT 038 282 1682
                                </p>
                            )}
                            {selectedResults.size > 0 && (
                                <div className="bg-gray-700/50 p-2 rounded-md flex items-center justify-between mb-4 sticky top-0 z-10 backdrop-blur-sm">
                                    <span className="font-semibold">{selectedResults.size} image(s) selected</span>
                                    <div className="space-x-2">
                                        <button onClick={handleDownloadSelected} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded inline-flex items-center transition-colors">
                                            <DownloadIcon /> <span className="ml-1 hidden sm:inline">Download ZIP</span>
                                        </button>
                                        <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded inline-flex items-center transition-colors">
                                            <TrashIcon /> <span className="ml-1 hidden sm:inline">Delete</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                            {isProcessing && results.length === 0 && <div className="text-center py-10 text-gray-400">Generating images...</div>}
                            {!isProcessing && results.length === 0 && <div className="text-center py-10 text-gray-400">Results will appear here.</div>}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto p-1">
                                {results.sort((a,b) => a.stt - b.stt).map(result => {
                                    const isSelected = selectedResults.has(result.stt);
                                    return (
                                    <div 
                                        key={result.stt} 
                                        className={`relative bg-gray-900 rounded-lg overflow-hidden shadow-md group cursor-pointer border-2 transition-all ${isSelected ? 'border-indigo-500 scale-105' : 'border-transparent'}`}
                                        onClick={() => handleSelectResult(result.stt)}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1 z-10 shadow-lg">
                                                <CheckCircleIcon />
                                            </div>
                                        )}
                                        <img src={result.imageData} alt={`Generated for prompt ${result.stt}`} className="w-full h-48 object-cover group-hover:opacity-80 transition-opacity" />
                                        <div className="p-3">
                                            <p className="text-xs text-gray-400 truncate" title={result.prompt}>{`STT ${result.stt}: ${result.prompt}`}</p>
                                            <a
                                                href={result.imageData}
                                                download={`${result.stt}_${sanitizeFilename(result.prompt)}.jpg`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="mt-2 w-full bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold py-2 px-3 rounded inline-flex items-center justify-center transition duration-300"
                                            >
                                                <DownloadIcon />
                                                <span className="ml-2">Download</span>
                                            </a>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        </Card>
                    </div>
                </main>
                {isProcessing && (
                    <footer className="fixed bottom-0 left-0 right-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm p-2 text-center text-gray-400 text-sm z-20">
                        Tác giả: Thành IT - SDT 038 282 1682
                    </footer>
                )}
            </div>
        </div>
        </>
    );
};

export default App;