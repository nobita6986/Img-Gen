
export interface PromptItem {
  stt: number;
  prompt: string;
}

export interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface GenerationResult {
  stt: number;
  prompt: string;
  imageData: string; // base64 string
}

export interface Settings {
  numberOfImages: number;
  concurrency: number;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}
