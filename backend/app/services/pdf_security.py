import os

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_pdf_path(filename: str) -> str:
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"PDF not found: {filename}")
    return path
