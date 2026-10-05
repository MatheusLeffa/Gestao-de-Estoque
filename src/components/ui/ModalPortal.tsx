// InsumoSync: ModalPortal — Renderiza modais no body via React Portal
// Garante z-index acima de qualquer stacking context e trava scroll global
// Author: frontend-engineer

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
  isOpen: boolean;
}

/**
 * Renderiza children em um portal no document.body quando `isOpen === true`.
 * Trava a rolagem global sem alterar a posição (position: fixed) do body,
 * prevenindo deslocamentos no layout e headers stickies.
 */
export function ModalPortal({ children, isOpen }: ModalPortalProps) {
  const elRef = useRef<HTMLDivElement | null>(null);

  if (!elRef.current && typeof document !== 'undefined') {
    elRef.current = document.createElement('div');
    elRef.current.className = 'insumosync-modal-portal';
  }

  useEffect(() => {
    const el = elRef.current;
    if (!el || !isOpen) return;

    document.body.appendChild(el);

    // Salvar estilos originais
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPaddingRight = document.body.style.paddingRight;
    const originalBodyTouchAction = document.body.style.touchAction;

    // Compensar largura da barra de rolagem se houver
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.paddingRight = originalBodyPaddingRight;
      document.body.style.touchAction = originalBodyTouchAction;

      if (el.parentElement) {
        document.body.removeChild(el);
      }
    };
  }, [isOpen]);

  if (!isOpen || !elRef.current) return null;

  return createPortal(children, elRef.current);
}

