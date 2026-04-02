import fitz  # PyMuPDF
import spacy
from dataclasses import dataclass, field


nlp = spacy.load("en_core_web_sm")


@dataclass
class ExtractedBlock:
    page_number: int
    text: str
    x: float
    y: float
    width: float
    height: float
    block_order: int
    sentence_group: int | None = None
    paragraph_group: int | None = None


def extract_text_blocks(pdf_path: str) -> tuple[int, list[ExtractedBlock]]:
    """Extract text at word level with sentence/paragraph groupings.

    Uses PyMuPDF for word-level bounding boxes, then spaCy for sentence
    segmentation. Each word gets a sentence_group and paragraph_group ID
    so the frontend can select at any granularity.

    Returns (page_count, list of ExtractedBlock).
    """
    doc = fitz.open(pdf_path)
    page_count = len(doc)
    blocks = []
    global_order = 0
    paragraph_id = 0
    sentence_id = 0

    for page_num in range(page_count):
        page = doc[page_num]
        page_width = page.rect.width
        page_height = page.rect.height

        # Get paragraph-level blocks for grouping context
        raw_blocks = page.get_text("blocks")

        for raw in raw_blocks:
            x0, y0, x1, y1, text, block_no, block_type = raw
            if block_type != 0:
                continue
            text = text.strip()
            if not text:
                continue

            current_paragraph_id = paragraph_id
            paragraph_id += 1

            # Use spaCy to segment this paragraph into sentences
            doc_nlp = nlp(text)
            sentences = list(doc_nlp.sents)

            # Build a character offset → sentence index map
            char_to_sentence = {}
            for sent_idx, sent in enumerate(sentences):
                for ci in range(sent.start_char, sent.end_char):
                    char_to_sentence[ci] = sent_idx

            # Get words within this block's bounding box
            # PyMuPDF words: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
            block_rect = fitz.Rect(x0, y0, x1, y1)
            page_words = page.get_text("words")
            block_words = [
                w for w in page_words
                if fitz.Rect(w[0], w[1], w[2], w[3]).intersects(block_rect)
            ]

            # Match each word to its sentence by finding it sequentially
            # in the paragraph text, tracking our position so we don't
            # re-match the same occurrence
            search_start = 0
            for word_data in block_words:
                wx0, wy0, wx1, wy1, word_text, w_block, w_line, w_word = word_data
                word_text = word_text.strip()
                if not word_text:
                    continue

                # Find this word's position in the paragraph text
                pos = text.find(word_text, search_start)
                if pos == -1:
                    # Fallback: try from the beginning (handles edge cases)
                    pos = text.find(word_text)
                if pos == -1:
                    # Last resort: assign to current best guess
                    sent_idx = char_to_sentence.get(search_start, 0)
                else:
                    sent_idx = char_to_sentence.get(pos, 0)
                    search_start = pos + len(word_text)

                word_sentence_id = sentence_id + sent_idx

                blocks.append(ExtractedBlock(
                    page_number=page_num,
                    text=word_text,
                    x=round(wx0 / page_width * 100, 4),
                    y=round(wy0 / page_height * 100, 4),
                    width=round((wx1 - wx0) / page_width * 100, 4),
                    height=round((wy1 - wy0) / page_height * 100, 4),
                    block_order=global_order,
                    sentence_group=word_sentence_id,
                    paragraph_group=current_paragraph_id,
                ))
                global_order += 1

            # Advance sentence IDs past all sentences in this paragraph
            sentence_id += len(sentences)

    doc.close()
    return page_count, blocks


# Keep backward-compatible paragraph-level extraction for reference
def extract_paragraph_blocks(pdf_path: str) -> tuple[int, list[ExtractedBlock]]:
    """Extract at paragraph level (legacy mode)."""
    doc = fitz.open(pdf_path)
    page_count = len(doc)
    blocks = []
    global_order = 0
    paragraph_id = 0

    for page_num in range(page_count):
        page = doc[page_num]
        page_width = page.rect.width
        page_height = page.rect.height

        raw_blocks = page.get_text("blocks")
        for raw in raw_blocks:
            x0, y0, x1, y1, text, block_no, block_type = raw
            if block_type != 0:
                continue
            text = text.strip()
            if not text:
                continue

            blocks.append(ExtractedBlock(
                page_number=page_num,
                text=text,
                x=round(x0 / page_width * 100, 4),
                y=round(y0 / page_height * 100, 4),
                width=round((x1 - x0) / page_width * 100, 4),
                height=round((y1 - y0) / page_height * 100, 4),
                block_order=global_order,
                paragraph_group=paragraph_id,
                sentence_group=None,
            ))
            global_order += 1
            paragraph_id += 1

    doc.close()
    return page_count, blocks
