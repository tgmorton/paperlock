import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ZoomIn,
  ZoomOut,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const RENDER_BUFFER = 2; // render pages within +-2 of visible

export default function PdfViewer({
  pdfUrl,
  onCurrentPageChange,
  onPageDimensions,
  renderOverlay, // (pageIndex, dims) => ReactNode
  searchHighlightPage, // optional: page to scroll to for search
  jumpToPage, // optional: { page, n } to scroll to (n changes to force re-scroll)
}) {
  const scrollRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState(new Set([0]));
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const [pageJumpValue, setPageJumpValue] = useState("");
  const pageRefs = useRef([]);
  const canvasRefs = useRef([]);
  const renderTracker = useRef(new Map()); // track which pages are rendered at which scale
  const renderTasks = useRef(new Map());
  const pageDimsCache = useRef(new Map());

  // Load the PDF document
  useEffect(() => {
    if (!pdfUrl) return;
    setError(null);
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise
      .then((doc) => {
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        pageRefs.current = new Array(doc.numPages);
        canvasRefs.current = new Array(doc.numPages);
        renderTracker.current = new Map();
        renderTasks.current = new Map();
        pageDimsCache.current = new Map();
      })
      .catch((err) => {
        console.error("PDF load error:", err);
        setError("Failed to load PDF");
      });
  }, [pdfUrl]);

  // Determine which pages should be rendered (near viewport)
  const pagesToRender = useMemo(() => {
    const set = new Set();
    for (const vp of visiblePages) {
      for (let i = vp - RENDER_BUFFER; i <= vp + RENDER_BUFFER; i++) {
        if (i >= 0 && i < totalPages) set.add(i);
      }
    }
    return set;
  }, [visiblePages, totalPages]);

  // Render a single page to its canvas
  const renderPage = useCallback(
    async (pageIndex) => {
      if (!pdfDoc) return;
      const canvas = canvasRefs.current[pageIndex];
      if (!canvas) return;

      // Already rendered at this scale + dpr? Skip.
      const dpr = window.devicePixelRatio || 1;
      const key = `${pageIndex}_${scale}_${dpr}`;
      if (renderTracker.current.get(pageIndex) === key) return;

      // Cancel any in-progress render for this page
      const existing = renderTasks.current.get(pageIndex);
      if (existing) {
        existing.cancel();
        renderTasks.current.delete(pageIndex);
      }

      try {
        const page = await pdfDoc.getPage(pageIndex + 1); // pdf.js is 1-indexed
        const viewport = page.getViewport({ scale });

        // Render at devicePixelRatio for crisp text on HiDPI screens
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Cache CSS dimensions (used for overlay positioning)
        const dims = { width: viewport.width, height: viewport.height };
        pageDimsCache.current.set(pageIndex, dims);

        if (pageIndex === 0 && onPageDimensions) {
          onPageDimensions(dims);
        }

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTasks.current.set(pageIndex, renderTask);

        await renderTask.promise;
        renderTracker.current.set(pageIndex, key);
        renderTasks.current.delete(pageIndex);
      } catch (e) {
        if (e.name !== "RenderingCancelledException") {
          console.error(`Error rendering page ${pageIndex + 1}:`, e);
        }
      }
    },
    [pdfDoc, scale, onPageDimensions]
  );

  // When scale changes, clear the render tracker so pages re-render
  useEffect(() => {
    renderTracker.current = new Map();
  }, [scale]);

  // Render pages that should be visible
  useEffect(() => {
    for (const pageIndex of pagesToRender) {
      renderPage(pageIndex);
    }
  }, [pagesToRender, renderPage]);

  // IntersectionObserver to track which pages are visible
  useEffect(() => {
    if (!scrollRef.current || totalPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const idx = parseInt(entry.target.dataset.pageIndex, 10);
            if (entry.isIntersecting) {
              next.add(idx);
            } else {
              next.delete(idx);
            }
          }
          return next;
        });
      },
      {
        root: scrollRef.current,
        rootMargin: "200px 0px",
        threshold: 0.1,
      }
    );

    for (let i = 0; i < totalPages; i++) {
      const el = pageRefs.current[i];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [totalPages, pdfDoc]);

  // Update current page based on which visible page is most centered
  useEffect(() => {
    if (visiblePages.size === 0) return;
    const sorted = [...visiblePages].sort((a, b) => a - b);
    const newPage = sorted[0] + 1;
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      if (onCurrentPageChange) onCurrentPageChange(newPage);
    }
  }, [visiblePages, currentPage, onCurrentPageChange]);

  // Scroll to a specific page
  const scrollToPage = useCallback(
    (pageNum) => {
      const idx = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
      const el = pageRefs.current[idx];
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [totalPages]
  );

  // Scroll to search highlight page
  useEffect(() => {
    if (searchHighlightPage && searchHighlightPage >= 1) {
      scrollToPage(searchHighlightPage);
    }
  }, [searchHighlightPage, scrollToPage]);

  // Scroll to a "jump to page" target (guidance buttons). The nonce makes
  // clicking the same page again re-scroll.
  useEffect(() => {
    if (jumpToPage?.page >= 1) {
      scrollToPage(jumpToPage.page);
    }
  }, [jumpToPage, scrollToPage]);

  // Page jump handler
  const handlePageJump = (e) => {
    e.preventDefault();
    const num = parseInt(pageJumpValue, 10);
    if (num >= 1 && num <= totalPages) {
      scrollToPage(num);
      setPageJumpOpen(false);
      setPageJumpValue("");
    }
  };

  // Zoom controls
  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const zoomReset = () => setScale(1.5);

  const handleContextMenu = (e) => e.preventDefault();

  return (
    <div className="pdf-viewer-root" onContextMenu={handleContextMenu}>
      {error && (
        <div className="error" style={{ margin: "1rem", textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Floating zoom toolbar */}
      <div className="pdf-float-toolbar">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomOut}
          className="text-white/80 hover:text-white hover:bg-white/10"
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <button
          className="pdf-zoom-label"
          onClick={zoomReset}
          title="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomIn}
          className="text-white/80 hover:text-white hover:bg-white/10"
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>

      {/* Floating page indicator */}
      {totalPages > 0 && (
        <div className="pdf-page-indicator">
          {pageJumpOpen ? (
            <form onSubmit={handlePageJump} className="pdf-page-jump-form">
              <Input
                autoFocus
                type="number"
                min={1}
                max={totalPages}
                value={pageJumpValue}
                onChange={(e) => setPageJumpValue(e.target.value)}
                onBlur={() => {
                  setPageJumpOpen(false);
                  setPageJumpValue("");
                }}
                placeholder={`${currentPage}`}
                className="pdf-page-jump-input"
              />
              <span className="pdf-page-jump-total">/ {totalPages}</span>
            </form>
          ) : (
            <button
              className="pdf-page-indicator-btn"
              onClick={() => {
                setPageJumpOpen(true);
                setPageJumpValue(String(currentPage));
              }}
              title="Click to jump to page"
            >
              {currentPage} / {totalPages}
            </button>
          )}
        </div>
      )}

      {/* Scrollable page container */}
      <div className="pdf-scroll-container" ref={scrollRef}>
        <div className="pdf-pages-stack">
          {Array.from({ length: totalPages }, (_, i) => {
            const shouldRender = pagesToRender.has(i);
            const dims = pageDimsCache.current.get(i);
            return (
              <div
                key={i}
                ref={(el) => (pageRefs.current[i] = el)}
                data-page-index={i}
                className="pdf-page-wrapper"
                style={
                  dims
                    ? { width: dims.width, height: dims.height }
                    : { width: scale * 612, height: scale * 792 } // default US Letter fallback
                }
              >
                <canvas
                  ref={(el) => (canvasRefs.current[i] = el)}
                  className="pdf-page-canvas"
                  style={{
                    display: shouldRender ? "block" : "none",
                    userSelect: "none",
                  }}
                />
                {!shouldRender && (
                  <div className="pdf-page-placeholder">
                    <span className="pdf-page-placeholder-text">
                      Page {i + 1}
                    </span>
                  </div>
                )}
                {/* Per-page overlay (BlockOverlay) */}
                {shouldRender &&
                  dims &&
                  renderOverlay &&
                  renderOverlay(i, dims)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
