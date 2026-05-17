import { useEffect, useRef } from 'react';

export default function MapCanvas({ image, corners, ports, project, onClick }: {
  image: HTMLImageElement | null;
  corners: Record<string, [number, number]> | null;
  ports: Array<{ name: string; x: number; y: number }>;
  project: (u: number, v: number) => [number, number] | null;
  onClick: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const ox = 0;
    const oy = (canvas.height - image.height * scale) / 2;
    const toCanvas = (x: number, y: number): [number, number] => [x * scale + ox, y * scale + oy];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, ox, oy, image.width * scale, image.height * scale);

    if (corners) {
      const names = ['Top', 'Right', 'Bottom', 'Left'];
      const pts = names.map((n) => toCanvas(corners[n][0], corners[n][1]));
      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.closePath();
      ctx.stroke();
    }

    for (const p of ports) {
      const q = project(p.x, p.y);
      if (!q) continue;
      const [x, y] = toCanvas(q[0], q[1]);
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.fillText(p.name, x + 8, y);
    }

    canvas.onclick = (e) => {
      const r = canvas.getBoundingClientRect();
      onClick((e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale);
    };
  }, [image, corners, ports, project, onClick]);

  return <canvas ref={ref} className="map-canvas w-100 h-100" />;
}
