import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, X } from "lucide-react";

export default function SearchBar({ blocks, onSearchResult, isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(0);
  const inputRef = useRef(null);

  const search = useCallback(
    (q) => {
      if (!q.trim()) {
        setResults([]);
        onSearchResult(null);
        return;
      }
      const lower = q.toLowerCase();
      const matches = blocks.filter((b) =>
        b.text.toLowerCase().includes(lower)
      );
      setResults(matches);
      setCurrentResult(0);
      if (matches.length > 0) {
        onSearchResult(matches[0]);
      } else {
        onSearchResult(null);
      }
    },
    [blocks, onSearchResult]
  );

  // Intercept Ctrl+F / Cmd+F
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const closeSearch = () => {
    setQuery("");
    setResults([]);
    onSearchResult(null);
    onClose();
  };

  const navigateResult = (direction) => {
    if (results.length === 0) return;
    const next =
      (currentResult + direction + results.length) % results.length;
    setCurrentResult(next);
    onSearchResult(results[next]);
  };

  if (!isOpen) return null;

  return (
    <div className="search-bar">
      <div className="search-bar-inner">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          placeholder="Search in paper..."
          className="search-bar-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") navigateResult(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") closeSearch();
          }}
        />
        {results.length > 0 && (
          <span className="search-count">
            {currentResult + 1} / {results.length}
          </span>
        )}
        {query && results.length === 0 && (
          <span className="search-count search-no-results">No results</span>
        )}
        <div className="search-nav-btns">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigateResult(-1)}
            disabled={results.length === 0}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigateResult(1)}
            disabled={results.length === 0}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={closeSearch}
          className="ml-1"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
