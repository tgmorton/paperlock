import { useState, useCallback, useRef, useMemo } from "react";

/**
 * Given an array of word-level blocks that belong to a group,
 * merge them into line-level spans by clustering blocks with similar Y positions.
 * Returns an array of { x, y, width, height, blockIds } objects.
 */
function mergeBlocksIntoLines(blocks, tolerance = 0.5) {
  if (blocks.length === 0) return [];

  // Sort by y then x
  const sorted = [...blocks].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > tolerance) return dy;
    return a.x - b.x;
  });

  const lines = [];
  let currentLine = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    const lastBlock = currentLine[currentLine.length - 1];

    // Same line if Y positions are within tolerance
    if (Math.abs(block.y - lastBlock.y) <= tolerance) {
      currentLine.push(block);
    } else {
      lines.push(currentLine);
      currentLine = [block];
    }
  }
  lines.push(currentLine);

  // Merge each line into a single bounding box
  return lines.map((lineBlocks) => {
    const minX = Math.min(...lineBlocks.map((b) => b.x));
    const minY = Math.min(...lineBlocks.map((b) => b.y));
    const maxX = Math.max(...lineBlocks.map((b) => b.x + b.width));
    const maxY = Math.max(...lineBlocks.map((b) => b.y + b.height));
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      blockIds: lineBlocks.map((b) => b.id),
    };
  });
}

export default function BlockOverlay({
  blocks,
  pageDimensions,
  pageIndex,
  activeQuestionId,
  selectionGranularity = "sentence",
  selectedBlockIds,
  onBlockClick,
  searchHighlightId,
  showHints,
}) {
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [flashingBlocks, setFlashingBlocks] = useState(new Set());
  const flashTimeoutRef = useRef(null);

  // Get blocks for this page
  const pageBlocks = useMemo(
    () => blocks.filter((b) => b.page_number === pageIndex),
    [blocks, pageIndex]
  );

  // Determine which group key to use based on granularity
  const getGroupKey = useCallback(
    (block) => {
      if (block.group_id != null) return `manual_${block.group_id}`;
      if (selectionGranularity === "paragraph" && block.paragraph_group != null) {
        return `para_${block.paragraph_group}`;
      }
      if (selectionGranularity === "sentence" && block.sentence_group != null) {
        return `sent_${block.sentence_group}`;
      }
      return `word_${block.id}`;
    },
    [selectionGranularity]
  );

  // Group page blocks by their group key
  const groupedBlocks = useMemo(() => {
    const groups = {};
    for (const b of pageBlocks) {
      const key = getGroupKey(b);
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
    return groups;
  }, [pageBlocks, getGroupKey]);

  // For sentence/paragraph: compute merged line-level bounding boxes per group
  const mergedGroups = useMemo(() => {
    if (selectionGranularity === "word") return null; // word mode renders individually
    const result = {};
    for (const [key, groupBlocks] of Object.entries(groupedBlocks)) {
      result[key] = mergeBlocksIntoLines(groupBlocks);
    }
    return result;
  }, [groupedBlocks, selectionGranularity]);

  // Color palette
  const palette = [
    "rgba(108, 92, 231, 0.18)",
    "rgba(16, 185, 129, 0.18)",
    "rgba(245, 158, 11, 0.18)",
    "rgba(139, 92, 246, 0.18)",
    "rgba(239, 68, 68, 0.18)",
    "rgba(236, 72, 153, 0.18)",
    "rgba(6, 182, 212, 0.18)",
  ];

  const groupColorMap = useMemo(() => {
    const map = {};
    let idx = 0;
    for (const key of Object.keys(groupedBlocks)) {
      map[key] = palette[idx % palette.length];
      idx++;
    }
    return map;
  }, [groupedBlocks]);

  const handleBlockClick = useCallback(
    (groupKey) => {
      if (!activeQuestionId || !onBlockClick) return;

      // Get all block IDs in this group (across all pages)
      const allGroupBlocks = blocks.filter((b) => {
        const bKey = getGroupKey(b);
        return bKey === groupKey;
      });
      const ids = allGroupBlocks.map((b) => b.id);

      // Flash
      setFlashingBlocks(new Set(ids));
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setFlashingBlocks(new Set()), 400);

      onBlockClick(ids);
    },
    [activeQuestionId, onBlockClick, blocks, getGroupKey]
  );

  if (!pageDimensions) return null;

  // Render merged line-spans for sentence/paragraph mode
  if (selectionGranularity !== "word" && mergedGroups) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: pageDimensions.width,
          height: pageDimensions.height,
          pointerEvents: activeQuestionId ? "auto" : "none",
        }}
      >
        {Object.entries(mergedGroups).map(([groupKey, lineSpans]) => {
          const groupBlocks = groupedBlocks[groupKey];
          const groupBlockIds = groupBlocks.map((b) => b.id);
          const isHovered = hoveredGroup === groupKey;
          const isAnySelected = groupBlockIds.some((id) => selectedBlockIds?.includes(id));
          const isAnyFlashing = groupBlockIds.some((id) => flashingBlocks.has(id));

          return lineSpans.map((span, spanIdx) => {
            const isSearchHighlight = span.blockIds.includes(searchHighlightId);

            let bgColor = "transparent";
            let borderStyle = "none";
            let borderWidth = "0";
            let borderColor = "transparent";

            if (isAnyFlashing) {
              bgColor = "rgba(34, 197, 94, 0.3)";
              borderStyle = "solid";
              borderWidth = "2px";
              borderColor = "rgba(34, 197, 94, 0.7)";
            } else if (isSearchHighlight) {
              bgColor = "rgba(245, 158, 11, 0.3)";
              borderStyle = "solid";
              borderWidth = "2px";
              borderColor = "rgba(245, 158, 11, 0.7)";
            } else if (isAnySelected) {
              bgColor = "rgba(108, 92, 231, 0.22)";
              borderStyle = "solid";
              borderWidth = "2px";
              borderColor = "rgba(108, 92, 231, 0.6)";
            } else if (isHovered && activeQuestionId) {
              bgColor = groupColorMap[groupKey] || palette[0];
              borderStyle = "solid";
              borderWidth = "1px";
              borderColor = "rgba(108, 92, 231, 0.25)";
            } else if (showHints && activeQuestionId) {
              borderStyle = "dotted";
              borderWidth = "1px";
              borderColor = "rgba(108, 92, 231, 0.12)";
            }

            return (
              <div
                key={`${groupKey}_${spanIdx}`}
                style={{
                  position: "absolute",
                  left: `${span.x}%`,
                  top: `${span.y}%`,
                  width: `${span.width}%`,
                  height: `${span.height}%`,
                  backgroundColor: bgColor,
                  borderStyle,
                  borderWidth,
                  borderColor,
                  borderRadius: 3,
                  cursor: activeQuestionId ? "pointer" : "default",
                  transition: "background-color 0.15s ease, border-color 0.15s ease",
                  userSelect: "none",
                  pointerEvents: activeQuestionId ? "auto" : "none",
                  zIndex: isAnySelected || isSearchHighlight || isAnyFlashing ? 2 : 1,
                }}
                onMouseEnter={() => setHoveredGroup(groupKey)}
                onMouseLeave={() => setHoveredGroup(null)}
                onClick={() => handleBlockClick(groupKey)}
              />
            );
          });
        })}
      </div>
    );
  }

  // Word-level mode: render each block individually
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: pageDimensions.width,
        height: pageDimensions.height,
        pointerEvents: activeQuestionId ? "auto" : "none",
      }}
    >
      {pageBlocks.map((block) => {
        const groupKey = getGroupKey(block);
        const isHovered = hoveredGroup === groupKey;
        const isSelected = selectedBlockIds?.includes(block.id);
        const isSearchHighlight = searchHighlightId === block.id;
        const isFlashing = flashingBlocks.has(block.id);

        let bgColor = "transparent";
        let borderStyle = "none";
        let borderWidth = "0";
        let borderColor = "transparent";

        if (isFlashing) {
          bgColor = "rgba(34, 197, 94, 0.3)";
          borderStyle = "solid";
          borderWidth = "2px";
          borderColor = "rgba(34, 197, 94, 0.7)";
        } else if (isSearchHighlight) {
          bgColor = "rgba(245, 158, 11, 0.3)";
          borderStyle = "solid";
          borderWidth = "2px";
          borderColor = "rgba(245, 158, 11, 0.7)";
        } else if (isSelected) {
          bgColor = "rgba(108, 92, 231, 0.22)";
          borderStyle = "solid";
          borderWidth = "2px";
          borderColor = "rgba(108, 92, 231, 0.6)";
        } else if (isHovered && activeQuestionId) {
          bgColor = groupColorMap[groupKey] || palette[0];
          borderStyle = "solid";
          borderWidth = "1px";
          borderColor = "rgba(100, 100, 100, 0.25)";
        } else if (showHints && activeQuestionId) {
          borderStyle = "dotted";
          borderWidth = "1px";
          borderColor = "rgba(108, 92, 231, 0.12)";
        }

        return (
          <div
            key={block.id}
            style={{
              position: "absolute",
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.width}%`,
              height: `${block.height}%`,
              backgroundColor: bgColor,
              borderStyle,
              borderWidth,
              borderColor,
              borderRadius: 2,
              cursor: activeQuestionId ? "pointer" : "default",
              transition: "background-color 0.15s ease, border-color 0.15s ease",
              userSelect: "none",
              pointerEvents: activeQuestionId ? "auto" : "none",
              zIndex: isSelected || isSearchHighlight || isFlashing ? 2 : 1,
            }}
            onMouseEnter={() => setHoveredGroup(groupKey)}
            onMouseLeave={() => setHoveredGroup(null)}
            onClick={() => handleBlockClick(groupKey)}
          />
        );
      })}
    </div>
  );
}
