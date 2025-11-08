import { jsx as _jsx } from "react/jsx-runtime";
/**
 * FloatingBackButton - Buton flotant și draggable pentru înapoi la Dashboard
 *
 * Features:
 * - Draggable (se poate muta cu degetul/mouse-ul)
 * - Persistă poziția în localStorage
 * - Design discret dar accesibil
 * - Vizibil pe toate modulele (exclude Dashboard)
 * - Touch-friendly (44px minimum)
 */
import { useState, useEffect, useRef } from 'react';
import { Home } from 'lucide-react';
export default function FloatingBackButton({ onBackToDashboard, isVisible }) {
    // Poziție inițială: jos-stânga
    const getInitialPosition = () => {
        const buttonSize = 56;
        const taskbarHeight = 80; // Taskbar + margins
        const margin = 20;
        // Calculează poziția jos-stânga
        const x = margin; // Stânga
        const y = window.innerHeight - buttonSize - taskbarHeight; // Jos
        return { x, y };
    };
    const [position, setPosition] = useState(getInitialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const buttonRef = useRef(null);
    // Încarcă poziția din localStorage (sau folosește poziția inițială jos-stânga)
    useEffect(() => {
        const saved = localStorage.getItem('floatingBackButtonPos');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Re-clamp saved position to current viewport to prevent off-screen rendering
                const constrained = constrainPosition(parsed.x, parsed.y);
                setPosition(constrained);
            }
            catch (e) {
                console.warn('Failed to load floating button position');
                // Dacă nu se poate încărca, folosește poziția inițială jos-stânga
                setPosition(getInitialPosition());
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Salvează poziția în localStorage când se schimbă
    useEffect(() => {
        if (!isDragging) {
            localStorage.setItem('floatingBackButtonPos', JSON.stringify(position));
        }
    }, [position, isDragging]);
    // Restricționează poziția în viewport
    const constrainPosition = (x, y) => {
        const buttonSize = 56; // 56px
        const maxX = window.innerWidth - buttonSize - 20;
        const maxY = window.innerHeight - buttonSize - 80; // 80px pentru taskbar
        return {
            x: Math.max(20, Math.min(x, maxX)),
            y: Math.max(20, Math.min(y, maxY))
        };
    };
    // Mouse/Touch handlers
    const handleStart = (clientX, clientY) => {
        setIsDragging(true);
        setDragStart({
            x: clientX - position.x,
            y: clientY - position.y
        });
    };
    const handleMove = (clientX, clientY) => {
        if (!isDragging)
            return;
        const newPos = constrainPosition(clientX - dragStart.x, clientY - dragStart.y);
        setPosition(newPos);
    };
    const handleEnd = () => {
        setIsDragging(false);
    };
    // Mouse events
    const handleMouseDown = (e) => {
        e.preventDefault();
        handleStart(e.clientX, e.clientY);
    };
    const handleMouseMove = (e) => {
        handleMove(e.clientX, e.clientY);
    };
    const handleMouseUp = () => {
        handleEnd();
    };
    // Touch events
    const handleTouchStart = (e) => {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
    };
    const handleTouchMove = (e) => {
        e.preventDefault(); // Prevent scrolling while dragging
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
    };
    const handleTouchEnd = () => {
        handleEnd();
    };
    // Re-constrain position on window resize to keep button in viewport
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => constrainPosition(prev.x, prev.y));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Global event listeners pentru drag
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging, dragStart, position]);
    // Click handler - doar dacă nu a fost drag
    const handleClick = () => {
        if (!isDragging) {
            onBackToDashboard();
        }
    };
    if (!isVisible)
        return null;
    return (_jsx("button", { ref: buttonRef, onMouseDown: handleMouseDown, onTouchStart: handleTouchStart, onClick: handleClick, style: {
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            zIndex: 1000,
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none', // Previne default touch behaviors
        }, className: `
        w-14 h-14 rounded-full
        bg-gradient-to-br from-blue-500 to-blue-600
        hover:from-blue-600 hover:to-blue-700
        shadow-lg hover:shadow-xl
        flex items-center justify-center
        transition-all duration-200
        border-2 border-white
        ${isDragging ? 'scale-110 shadow-2xl' : 'scale-100'}
      `, "aria-label": "\u00CEnapoi la Dashboard", title: "\u00CEnapoi la Dashboard (Drag pentru a muta)", children: _jsx(Home, { className: "w-6 h-6 text-white" }) }));
}
