import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import PdfViewer from "../components/PdfViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Merge,
  Split,
  X,
  Layers,
  FileText,
} from "lucide-react";

// Same palette as BlockOverlay for consistency
const GROUP_PALETTE = [
  { bg: "rgba(108, 92, 231, 0.18)", border: "rgba(108, 92, 231, 0.45)" },
  { bg: "rgba(16, 185, 129, 0.18)", border: "rgba(16, 185, 129, 0.45)" },
  { bg: "rgba(245, 158, 11, 0.18)", border: "rgba(245, 158, 11, 0.45)" },
  { bg: "rgba(139, 92, 246, 0.18)", border: "rgba(139, 92, 246, 0.45)" },
  { bg: "rgba(239, 68, 68, 0.18)", border: "rgba(239, 68, 68, 0.45)" },
  { bg: "rgba(236, 72, 153, 0.18)", border: "rgba(236, 72, 153, 0.45)" },
  { bg: "rgba(6, 182, 212, 0.18)", border: "rgba(6, 182, 212, 0.45)" },
];

const SELECTED_BG = "rgba(79, 70, 229, 0.15)";
const SELECTED_BORDER = "rgba(79, 70, 229, 0.8)";

function getGroupId(block) {
  if (block.group_id != null) return block.group_id;
  if (block.sentence_group != null) return `s_${block.sentence_group}`;
  if (block.paragraph_group != null) return `p_${block.paragraph_group}`;
  return null;
}


export default function BlockEditorView() {
  const { pdfId } = useParams();
  const navigate = useNavigate();

  const [blocks, setBlocks] = useState([]);
  const [selectedBlockIds, setSelectedBlockIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Load blocks on mount
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const b = await api.getBlocks(pdfId);
        setBlocks(b);

        // Try to get PDF name from the list
        try {
          const pdfs = await api.listPdfs();
          const pdf = pdfs.find((p) => String(p.id) === String(pdfId));
          if (pdf) setPdfName(pdf.filename || pdf.name || "");
        } catch {
          // Not critical
        }
      } catch (err) {
        console.error("Failed to load blocks:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pdfId]);

  // Reload blocks helper
  const reloadBlocks = useCallback(async () => {
    const b = await api.getBlocks(pdfId);
    setBlocks(b);
  }, [pdfId]);

  // Toggle block selection
  const toggleBlock = useCallback((blockId) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedBlockIds(new Set());
  }, []);

  // Merge selected blocks
  const handleMerge = useCallback(async () => {
    if (selectedBlockIds.size < 2 || actionLoading) return;
    try {
      setActionLoading(true);
      await api.mergeBlocks([...selectedBlockIds]);
      await reloadBlocks();
      setSelectedBlockIds(new Set());
    } catch (err) {
      console.error("Merge failed:", err);
    } finally {
      setActionLoading(false);
    }
  }, [selectedBlockIds, actionLoading, reloadBlocks]);

  // Split selected block's group
  const selectedBlock = useMemo(() => {
    if (selectedBlockIds.size !== 1) return null;
    const id = [...selectedBlockIds][0];
    return blocks.find((b) => b.id === id) || null;
  }, [selectedBlockIds, blocks]);

  const canSplit = useMemo(() => {
    // Split only undoes a manual merge (group_id). The auto sentence/paragraph
    // groups aren't backed by the split endpoint, so enabling it for them would
    // silently do nothing (or affect the wrong blocks).
    if (!selectedBlock) return false;
    return selectedBlock.group_id != null;
  }, [selectedBlock]);

  const handleSplit = useCallback(async () => {
    if (!canSplit || actionLoading || !selectedBlock) return;
    try {
      setActionLoading(true);
      const groupId = selectedBlock.group_id;
      await api.splitBlocks(groupId);
      await reloadBlocks();
      setSelectedBlockIds(new Set());
    } catch (err) {
      console.error("Split failed:", err);
    } finally {
      setActionLoading(false);
    }
  }, [canSplit, actionLoading, selectedBlock, reloadBlocks]);

  // Build a stable group color map
  const groupColorMap = useMemo(() => {
    const map = new Map();
    let idx = 0;
    for (const block of blocks) {
      const gid = getGroupId(block);
      if (gid != null && !map.has(gid)) {
        map.set(gid, idx % GROUP_PALETTE.length);
        idx++;
      }
    }
    return map;
  }, [blocks]);

  // Info panel data
  const selectionInfo = useMemo(() => {
    if (selectedBlockIds.size === 0) return null;
    const selected = blocks.filter((b) => selectedBlockIds.has(b.id));
    const groups = new Set(selected.map((b) => getGroupId(b)).filter(Boolean));
    return {
      count: selected.length,
      groupCount: groups.size,
      blocks: selected,
    };
  }, [selectedBlockIds, blocks]);

  // Render overlay for each page
  const renderOverlay = useCallback(
    (pageIndex, dims) => {
      const pageBlocks = blocks.filter((b) => b.page_number === pageIndex);
      if (pageBlocks.length === 0) return null;

      return (
        <TooltipProvider delay={400}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: dims.width,
              height: dims.height,
              pointerEvents: "auto",
            }}
          >
            {pageBlocks.map((block) => {
              const isSelected = selectedBlockIds.has(block.id);
              const gid = getGroupId(block);
              const colorIdx = gid != null ? groupColorMap.get(gid) : null;
              const colors =
                colorIdx != null ? GROUP_PALETTE[colorIdx] : null;

              const truncatedText = block.text
                ? block.text.length > 50
                  ? block.text.slice(0, 50) + "..."
                  : block.text
                : `Block #${block.id}`;

              return (
                <Tooltip key={block.id}>
                  <TooltipTrigger
                    render={
                      <div
                        className={`be-block ${isSelected ? "be-block-selected" : ""}`}
                        style={{
                          position: "absolute",
                          left: `${block.x}%`,
                          top: `${block.y}%`,
                          width: `${block.width}%`,
                          height: `${block.height}%`,
                          backgroundColor: isSelected
                            ? SELECTED_BG
                            : colors
                              ? colors.bg
                              : "rgba(148, 163, 184, 0.1)",
                          borderWidth: isSelected ? "2px" : "1px",
                          borderStyle: "solid",
                          borderColor: isSelected
                            ? SELECTED_BORDER
                            : colors
                              ? colors.border
                              : "rgba(148, 163, 184, 0.3)",
                          borderRadius: 3,
                          cursor: "pointer",
                          transition:
                            "background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease",
                          userSelect: "none",
                          zIndex: isSelected ? 3 : 1,
                          boxShadow: isSelected
                            ? "0 0 0 2px rgba(79, 70, 229, 0.25)"
                            : "none",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBlock(block.id);
                        }}
                      />
                    }
                  />
                  <TooltipContent side="top">
                    {truncatedText}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      );
    },
    [blocks, selectedBlockIds, groupColorMap, toggleBlock]
  );

  // Loading state
  if (loading) {
    return (
      <div className="loading">
        <div className="loading-inner">
          <FileText className="size-6 text-muted-foreground animate-pulse" />
          <span>Loading blocks...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="loading">Error: {error}</div>;
  }

  const pdfUrl = api.getPdfUrl(pdfId);

  return (
    <div className="reader-layout">
      {/* Top bar */}
      <div className="reader-topbar">
        <div className="reader-topbar-left">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/instructor")}
            className="text-white/70 hover:text-white hover:bg-white/10"
            title="Back to instructor dashboard"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="reader-topbar-sep" />
          <Layers className="size-4 text-white/50" />
          <span className="reader-topbar-title">Block Editor</span>
          {pdfName && (
            <>
              <div className="reader-topbar-sep" />
              <span className="reader-topbar-title" style={{ opacity: 0.6 }}>
                {pdfName}
              </span>
            </>
          )}
        </div>

        {/* Center toolbar */}
        <div className="block-editor-toolbar">
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedBlockIds.size < 2 || actionLoading}
            onClick={handleMerge}
            className="text-white/80 hover:text-white hover:bg-white/10 disabled:text-white/25 disabled:hover:bg-transparent"
            title="Merge selected blocks into one group"
          >
            <Merge className="size-3.5 mr-1" />
            Merge
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={!canSplit || actionLoading}
            onClick={handleSplit}
            className="text-white/80 hover:text-white hover:bg-white/10 disabled:text-white/25 disabled:hover:bg-transparent"
            title="Split selected block's group"
          >
            <Split className="size-3.5 mr-1" />
            Split
          </Button>

          <div className="reader-topbar-sep" />

          <Button
            variant="ghost"
            size="sm"
            disabled={selectedBlockIds.size === 0}
            onClick={clearSelection}
            className="text-white/80 hover:text-white hover:bg-white/10 disabled:text-white/25 disabled:hover:bg-transparent"
          >
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        </div>

        <div className="reader-topbar-right">
          {selectedBlockIds.size > 0 && (
            <Badge
              variant="secondary"
              className="be-selection-badge"
            >
              {selectedBlockIds.size} block{selectedBlockIds.size !== 1 ? "s" : ""} selected
            </Badge>
          )}
        </div>
      </div>

      {/* Main content: full-width PDF */}
      <div className="reader-main full-width">
        <div className="pdf-container">
          <PdfViewer pdfUrl={pdfUrl} renderOverlay={renderOverlay} />
        </div>
      </div>

      {/* Info panel at bottom */}
      {selectionInfo && (
        <div className="be-info-panel">
          {selectionInfo.count === 1 && selectionInfo.blocks[0] ? (
            <div className="be-info-single">
              <div className="be-info-meta">
                <Badge variant="outline" className="be-info-badge">
                  Page {selectionInfo.blocks[0].page_number + 1}
                </Badge>
                {getGroupId(selectionInfo.blocks[0]) != null && (
                  <Badge variant="outline" className="be-info-badge">
                    Group: {getGroupId(selectionInfo.blocks[0])}
                  </Badge>
                )}
                <Badge variant="outline" className="be-info-badge">
                  ID: {selectionInfo.blocks[0].id}
                </Badge>
              </div>
              <p className="be-info-text">
                {selectionInfo.blocks[0].text || "(no text)"}
              </p>
            </div>
          ) : (
            <div className="be-info-multi">
              <span className="be-info-count">
                {selectionInfo.count} blocks selected
              </span>
              {selectionInfo.groupCount > 0 && (
                <span className="be-info-groups">
                  from {selectionInfo.groupCount} group{selectionInfo.groupCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
