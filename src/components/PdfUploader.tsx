import React, { useRef, useState } from 'react';
import { uploadPdf } from '../utils';
import { Upload, FileText, Loader2 } from 'lucide-react';

interface Props {
    onUploaded: (url: string) => void;
}

export const PdfUploader: React.FC<Props> = ({ onUploaded }) => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — uses Vercel Blob direct upload, bypasses 4.5 MB function limit

    const handleFile = async (file: File) => {
        if (!file.type.includes('pdf')) {
            setErrorMsg('Please select a PDF file.');
            setStatus('error');
            return;
        }
        if (file.size > MAX_BYTES) {
            setErrorMsg(`PDF too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 4 MB — compress or split.`);
            setStatus('error');
            return;
        }
        setStatus('uploading');
        setErrorMsg('');
        try {
            const url = await uploadPdf(file);
            setStatus('idle');
            onUploaded(url);
        } catch (e: any) {
            setStatus('error');
            setErrorMsg(e.message || 'Upload failed');
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (status === 'uploading') return;
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    return (
        <div
            onClick={() => status !== 'uploading' && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (status !== 'uploading') setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`
                flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed
                py-6 transition-colors
                ${status === 'uploading' ? 'cursor-wait opacity-70' : 'cursor-pointer'}
                ${dragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'}
                ${status === 'error' ? 'border-rose-500/60' : ''}
            `}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {status === 'uploading' ? (
                <>
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                    <span className="text-xs text-zinc-400">Uploading PDF…</span>
                </>
            ) : (
                <>
                    {status === 'error'
                        ? <FileText className="w-6 h-6 text-rose-400" />
                        : <Upload className="w-6 h-6 text-zinc-400" />}
                    <span className="text-xs text-zinc-400">
                        {status === 'error' ? errorMsg : 'Drop PDF here or click to upload'}
                    </span>
                    <span className="text-[10px] text-zinc-600">Stored in cloud — accessible from any device</span>
                </>
            )}
        </div>
    );
};
