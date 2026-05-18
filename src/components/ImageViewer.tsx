import { useEffect, useMemo, useRef } from "react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";

type ImageViewerProps = {
  imageUrl: string | null;
  imageWidth?: number;
  imageHeight?: number;
  children?: React.ReactNode;
  onImageClick?: (point: { x: number; y: number }) => void;
  className?: string;
  resetKey?: string | null;
};

function ViewerControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="image-viewer-controls">
      <button type="button" className="btn btn-sm btn-dark" onClick={() => zoomIn()}>
        +
      </button>
      <button type="button" className="btn btn-sm btn-dark" onClick={() => zoomOut()}>
        −
      </button>
      <button type="button" className="btn btn-sm btn-dark" onClick={() => resetTransform()}>
        Fit
      </button>
    </div>
  );
}

type ViewerContentProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  children?: React.ReactNode;
  onImageClick?: (point: { x: number; y: number }) => void;
  resetKey?: string | null;
};

function ViewerContent({
  imageUrl,
  imageWidth,
  imageHeight,
  children,
  onImageClick,
  resetKey,
}: ViewerContentProps) {
  const { resetTransform } = useControls();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetTransform(0);
  }, [resetTransform, resetKey]);

  const style = useMemo(
    () => ({ width: `${imageWidth}px`, height: `${imageHeight}px` }),
    [imageHeight, imageWidth],
  );

  return (
    <>
      <ViewerControls />
      <TransformComponent
        wrapperClass="image-viewer-wrapper"
        contentClass="image-viewer-transform"
        wrapperStyle={{ width: "100%", height: "100%" }}
      >
        <div
          ref={contentRef}
          className="image-viewer-content"
          style={style}
          onClick={(e) => {
            if (!onImageClick || !contentRef.current) return;
            const rect = contentRef.current.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = ((e.clientX - rect.left) / rect.width) * imageWidth;
            const y = ((e.clientY - rect.top) / rect.height) * imageHeight;
            onImageClick({ x, y });
          }}
        >
          <img
            src={imageUrl}
            alt="Map screenshot"
            draggable={false}
            className="image-viewer-image"
            style={style}
          />
          <svg
            className="image-viewer-overlay"
            style={style}
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          >
            {children}
          </svg>
        </div>
      </TransformComponent>
    </>
  );
}

export default function ImageViewer({
  imageUrl,
  imageWidth,
  imageHeight,
  children,
  onImageClick,
  className,
  resetKey,
}: ImageViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);

  const clampPanPosition = (
    scale: number,
    positionX: number,
    positionY: number,
  ): { x: number; y: number } | null => {
    if (!viewerRef.current || !imageWidth || !imageHeight) return null;
    const viewportWidth = viewerRef.current.clientWidth;
    const viewportHeight = viewerRef.current.clientHeight;
    if (!viewportWidth || !viewportHeight) return null;

    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;

    const minX = viewportWidth - scaledWidth - viewportWidth * 0.8;
    const maxX = viewportWidth * 0.8;
    const minY = viewportHeight - scaledHeight - viewportHeight * 0.8;
    const maxY = viewportHeight * 0.8;

    return {
      x: Math.max(minX, Math.min(maxX, positionX)),
      y: Math.max(minY, Math.min(maxY, positionY)),
    };
  };

  return (
    <div ref={viewerRef} className={`image-viewer ${className ?? ""}`.trim()}>
      {imageUrl && imageWidth && imageHeight ? (
        <TransformWrapper
          minScale={0.5}
          maxScale={8}
          centerOnInit
          initialScale={1}
          limitToBounds={false}
          wheel={{ step: 0.15 }}
          doubleClick={{ disabled: true }}
          panning={{ disabled: false }}
          onTransformed={(ref, state) => {
            const clamped = clampPanPosition(state.scale, state.positionX, state.positionY);
            if (!clamped) return;
            if (clamped.x === state.positionX && clamped.y === state.positionY) return;
            ref.setTransform(clamped.x, clamped.y, state.scale, 0);
          }}
        >
          <ViewerContent
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            onImageClick={onImageClick}
            resetKey={resetKey}
          >
            {children}
          </ViewerContent>
        </TransformWrapper>
      ) : (
        <div className="image-viewer-empty">Upload a screenshot to begin.</div>
      )}
    </div>
  );
}
