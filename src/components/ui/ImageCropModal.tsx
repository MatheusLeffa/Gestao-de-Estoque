// InsumoSync: ImageCropModal — Recorte Nativo de Imagem 1:1 via HTML5 Canvas
// Author: frontend-engineer / ui-ux-designer
// Mobile-First, Touch & Mouse Pan/Zoom, Zero External Dependencies

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Check, Move, RefreshCw } from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob, croppedDataUrl: string) => void;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  // Scroll lock é gerenciado pelo ModalPortal

  // Estados de transformação
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Estados de interação de arraste / pinch
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  // Carregar a imagem na memória ao abrir
  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setImage(null);
      return;
    }

    const img = new Image();
    // Somente configurar crossOrigin em URLs http/https externas para evitar erros de CORS em blob: e data:
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      setImage(img);
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    };

    img.onerror = (err) => {
      console.error('Falha ao carregar imagem para corte:', err);
    };

    img.src = imageSrc;
  }, [isOpen, imageSrc]);

  // Renderizar o preview no Canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Salvar estado
    ctx.save();

    // Centralizar no ponto focal do canvas
    ctx.translate(size / 2 + pan.x, size / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Calcular escala base para "cover" no quadrado
    const imgAspect = image.width / image.height;
    let renderW = size;
    let renderH = size;
    if (imgAspect > 1) {
      renderW = size * imgAspect;
      renderH = size;
    } else {
      renderW = size;
      renderH = size / imgAspect;
    }

    // Desenhar a imagem centralizada
    ctx.drawImage(image, -renderW / 2, -renderH / 2, renderW, renderH);

    ctx.restore();
  }, [image, zoom, rotation, pan]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // ─── Interações de Mouse ──────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((prev) => Math.min(3, Math.max(0.8, Number((prev + delta).toFixed(2)))));
  };

  // ─── Interações de Touch Móvel ────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      // Início de gesto Pinch-to-zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      setPan({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = currentDist - touchDistanceRef.current;
      touchDistanceRef.current = currentDist;
      setZoom((prev) => Math.min(3, Math.max(0.8, Number((prev + diff * 0.008).toFixed(2)))));
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    touchDistanceRef.current = null;
  };

  // ─── Exportar Imagem Recortada em Alta Resolução (WebP 500x500) ────────────
  const handleConfirmCrop = async () => {
    if (!image) return;

    // Criar canvas off-screen em alta resolução (500x500px)
    const exportCanvas = document.createElement('canvas');
    const targetSize = 500;
    exportCanvas.width = targetSize;
    exportCanvas.height = targetSize;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Proporção entre o preview (canvasRef) e o target (500)
    const previewSize = canvasRef.current?.width || 320;
    const ratio = targetSize / previewSize;

    ctx.save();
    // Centralizar
    ctx.translate(targetSize / 2 + pan.x * ratio, targetSize / 2 + pan.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom * ratio, zoom * ratio);

    const imgAspect = image.width / image.height;
    let renderW = previewSize;
    let renderH = previewSize;
    if (imgAspect > 1) {
      renderW = previewSize * imgAspect;
      renderH = previewSize;
    } else {
      renderW = previewSize;
      renderH = previewSize / imgAspect;
    }

    ctx.drawImage(image, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    // Exportar como WebP otimizado (qualidade 0.85)
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          // Fallback para toDataURL caso toBlob falhe
          const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.85);
          const fallbackBlob = dataUrlToBlob(dataUrl);
          onCropComplete(fallbackBlob, dataUrl);
          return;
        }
        const dataUrl = exportCanvas.toDataURL('image/webp', 0.85);
        onCropComplete(blob, dataUrl);
      },
      'image/webp',
      0.85
    );
  };

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        className="fixed inset-0 z-[70] flex flex-col justify-end sm:items-center sm:justify-center animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop escurecido com blur */}
        <div
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Conteúdo do Modal */}
        <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[95dvh] flex flex-col z-10 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Move className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Enquadrar & Recortar</h2>
                <p className="text-xs text-slate-500">Arraste e ajuste o zoom (quadrado 1:1)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Área de Visualização do Canvas */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-950 select-none overflow-hidden">
            <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl touch-none cursor-grab active:cursor-grabbing">
              {/* Canvas Nativo */}
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                className="w-full h-full block"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {/* Guia visual sutil (Regra dos terços) */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20 border border-white">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Dica no rodapé do canvas */}
              <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
                <span className="text-[10px] text-white/70 bg-black/50 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                  Toque/arraste para mover
                </span>
              </div>
            </div>
          </div>

          {/* Controles de Zoom, Rotação e Reset */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(0.8, Number((prev - 0.1).toFixed(2))))}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-95 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                title="Diminuir zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              {/* Slider de Zoom */}
              <input
                type="range"
                min="0.8"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.1).toFixed(2))))}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-95 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setRotation((prev) => (prev + 90) % 360)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl font-semibold text-slate-700 active:scale-95 transition-all min-h-[36px]"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Girar 90°</span>
              </button>

              <span className="font-mono text-[11px] text-slate-400">
                {Math.round(zoom * 100)}% {rotation !== 0 && `· ${rotation}°`}
              </span>

              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                  setPan({ x: 0, y: 0 });
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-medium active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Centralizar</span>
              </button>
            </div>
          </div>

          {/* Footer com Ações */}
          <div className="px-5 py-4 border-t border-slate-100 bg-white flex gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors min-h-[48px]"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmCrop}
              className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 font-bold text-sm rounded-2xl text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-h-[48px] shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar Recorte</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
