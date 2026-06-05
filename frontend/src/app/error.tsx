'use client';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen bg-slate-950 text-slate-200">
      <h2 className="text-2xl font-bold mb-4 text-rose-500">Something went wrong!</h2>
      <p className="text-slate-400 mb-8">{error.message}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
