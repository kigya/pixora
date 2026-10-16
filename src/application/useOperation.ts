import {useRef, useState} from 'react';

/** A ref locks synchronously, before React commits a busy state. */
export function useOperation(onStart?: () => void) {
  const locked = useRef(false);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<void>, name = 'operation') => {
    if (locked.current) return;
    locked.current = true;
    setOperation(name);
    setError(null);
    onStart?.();
    try { await action(); }
    catch (failure) { setError(failure); }
    finally { setOperation(''); locked.current = false; }
  };
  return {operation, error, setError, run};
}
