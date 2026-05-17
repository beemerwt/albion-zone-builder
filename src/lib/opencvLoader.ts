let promise: Promise<any> | null = null;
export function loadOpenCv(): Promise<any> {
  if ((window as any).cv?.Mat) return Promise.resolve((window as any).cv);
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://docs.opencv.org/4.10.0/opencv.js';
    s.async = true;
    s.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    (window as any).Module = { onRuntimeInitialized: () => resolve((window as any).cv) };
    document.body.appendChild(s);
  });
  return promise;
}
