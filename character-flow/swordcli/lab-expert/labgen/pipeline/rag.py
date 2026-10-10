import json
import os
import pickle
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAG_DIR = os.path.join(BASE_DIR, "rag_data")
INDEX_DIR = os.path.join(BASE_DIR, "rag_index")

os.makedirs(INDEX_DIR, exist_ok=True)

_EMBED_MODEL = None
_BM25_INDEX = None
_DOCUMENTS = None
_DOC_EMBEDDINGS = None
_CHUNKS = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        _EMBED_MODEL = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _EMBED_MODEL

def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if len(chunk.strip()) > 50:
            chunks.append(chunk.strip())
    return chunks

def _load_documents(rag_dir: str) -> List[Dict]:
    docs = []
    for md_file in Path(rag_dir).glob("*.md"):
        with open(md_file, "r") as f:
            content = f.read()
        chunks = _chunk_text(content)
        for chunk_idx, chunk in enumerate(chunks):
            docs.append({
                "source": md_file.name,
                "chunk_id": chunk_idx,
                "text": chunk,
                "full_text": content[:2000]
            })
    return docs

def build_rag_index(rag_dir: str = RAG_DIR, index_dir: str = INDEX_DIR, force_rebuild: bool = False):
    global _BM25_INDEX, _DOCUMENTS, _DOC_EMBEDDINGS, _CHUNKS
    
    bm25_path = os.path.join(index_dir, "bm25_index.pkl")
    embed_path = os.path.join(index_dir, "embeddings.npy")
    docs_path = os.path.join(index_dir, "documents.json")
    chunks_path = os.path.join(index_dir, "chunks.json")
    
    if not force_rebuild and all(os.path.exists(p) for p in [bm25_path, embed_path, docs_path]):
        print("Loading existing RAG index...")
        with open(bm25_path, "rb") as f:
            _BM25_INDEX = pickle.load(f)
        _DOC_EMBEDDINGS = np.load(embed_path)
        with open(docs_path, "r") as f:
            _DOCUMENTS = json.load(f)
        with open(chunks_path, "r") as f:
            _CHUNKS = json.load(f)
        print(f"Loaded {len(_DOCUMENTS)} documents, {len(_CHUNKS)} chunks")
        return
    
    print("Building RAG index...")
    _DOCUMENTS = _load_documents(rag_dir)
    _CHUNKS = [d["text"] for d in _DOCUMENTS]
    
    print(f"Loaded {len(_DOCUMENTS)} documents, {len(_CHUNKS)} chunks")
    
    print("Computing embeddings...")
    model = _get_embed_model()
    _DOC_EMBEDDINGS = model.encode(_CHUNKS, show_progress_bar=True, batch_size=32, convert_to_numpy=True)
    
    print("Building BM25 index...")
    tokenized = [c.lower().split() for c in _CHUNKS]
    _BM25_INDEX = BM25Okapi(tokenized)
    
    print("Saving index...")
    with open(bm25_path, "wb") as f:
        pickle.dump(_BM25_INDEX, f)
    np.save(embed_path, _DOC_EMBEDDINGS)
    with open(docs_path, "w") as f:
        json.dump(_DOCUMENTS, f, indent=2)
    with open(chunks_path, "w") as f:
        json.dump(_CHUNKS, f)
    
    print("RAG index built and saved.")

def _rrf_fuse(dense_results: List[Tuple[int, float]], sparse_results: List[Tuple[int, float]], k: int = 60) -> List[int]:
    scores = {}
    for rank, (idx, _) in enumerate(dense_results):
        scores[idx] = scores.get(idx, 0) + 1.0 / (k + rank + 1)
    for rank, (idx, _) in enumerate(sparse_results):
        scores[idx] = scores.get(idx, 0) + 1.0 / (k + rank + 1)
    return [idx for idx, _ in sorted(scores.items(), key=lambda x: x[1], reverse=True)]

def retrieve(query: str, top_k: int = 5, alpha: float = 0.5) -> List[Dict]:
    if _BM25_INDEX is None or _DOC_EMBEDDINGS is None:
        build_rag_index()
    
    model = _get_embed_model()
    query_emb = model.encode([query], convert_to_numpy=True)[0]
    
    # Dense retrieval
    sims = np.dot(_DOC_EMBEDDINGS, query_emb) / (
        np.linalg.norm(_DOC_EMBEDDINGS, axis=1) * np.linalg.norm(query_emb) + 1e-8
    )
    dense_rank = np.argsort(sims)[::-1][:top_k * 2]
    dense_results = [(int(idx), float(sims[idx])) for idx in dense_rank]
    
    # Sparse retrieval (BM25)
    tokenized_query = query.lower().split()
    bm25_scores = _BM25_INDEX.get_scores(tokenized_query)
    sparse_rank = np.argsort(bm25_scores)[::-1][:top_k * 2]
    sparse_results = [(int(idx), float(bm25_scores[idx])) for idx in sparse_rank]
    
    # Fuse
    fused_indices = _rrf_fuse(dense_results, sparse_results)
    
    results = []
    for idx in fused_indices[:top_k]:
        doc = _DOCUMENTS[idx]
        results.append({
            "source": doc["source"],
            "chunk_id": doc["chunk_id"],
            "text": doc["text"],
            "dense_score": float(sims[idx]),
            "bm25_score": float(bm25_scores[idx])
        })
    
    return results

def get_rag_context(query: str, top_k: int = 5) -> str:
    results = retrieve(query, top_k=top_k)
    if not results:
        return "No relevant context found in local knowledge base."
    
    context_lines = []
    for i, r in enumerate(results):
        context_lines.append(f"[{i+1}] Source: {r['source']} (chunk {r['chunk_id']})")
        context_lines.append(f"    Dense: {r['dense_score']:.3f}, BM25: {r['bm25_score']:.3f}")
        context_lines.append(f"    {r['text'][:500]}")
        context_lines.append("")
    
    return "\n".join(context_lines)

def get_research_context(query: str, use_rag: bool = True, use_web: bool = True) -> str:
    contexts = []
    
    if use_rag:
        rag_context = get_rag_context(query)
        contexts.append(f"=== LOCAL KNOWLEDGE BASE (RAG+BM25) ===\n{rag_context}")
    
    if use_web:
        from pipeline.research import get_research_context as web_research
        web_context = web_research(query)
        contexts.append(f"=== WEB SEARCH (knowledge_hub/DDGS) ===\n{web_context}")
    
    return "\n\n".join(contexts)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--query", type=str)
    args = parser.parse_args()
    
    if args.rebuild or args.query:
        build_rag_index(force_rebuild=args.rebuild)
    
    if args.query:
        print(get_rag_context(args.query))