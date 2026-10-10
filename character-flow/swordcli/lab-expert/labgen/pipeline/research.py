import json
import os

def get_research_context(query):
    """Fetch research context via DuckDuckGo web search."""
    try:
        from duckduckgo_search import DDGS
        results = DDGS().text(query, max_results=5)
        context_lines = []
        for i, item in enumerate(results):
            title = item.get("title", "No Title")
            href = item.get("href", "No URL")
            body = item.get("body", "No Body")
            context_lines.append(f"[{i+1}] {title}\nURL: {href}\nSnippet: {body}\n")
        return "\n".join(context_lines)
    except ImportError:
        print("duckduckgo-search not installed; skipping web research.")
        return "No web research context available."
    except Exception as e:
        print(f"Web research error: {e}")
        return "No web research context available."

def get_hybrid_research_context(query: str, use_rag: bool = True, use_web: bool = True) -> str:
    """Get research context from both local RAG+BM25 and web search."""
    from pipeline.rag import get_rag_context
    
    contexts = []
    
    if use_rag:
        try:
            rag_context = get_rag_context(query, top_k=5)
            contexts.append(f"=== LOCAL KNOWLEDGE BASE (RAG+BM25) ===\n{rag_context}")
        except Exception as e:
            print(f"RAG retrieval failed: {e}")
    
    if use_web:
        web_context = get_research_context(query)
        contexts.append(f"=== WEB SEARCH (knowledge_hub/DDGS) ===\n{web_context}")
    
    return "\n\n".join(contexts) if contexts else "No research context available."

def save_research_context(run_dir: str, experiment_name: str, research_context: str):
    os.makedirs(run_dir, exist_ok=True)
    path = os.path.join(run_dir, "research_context.json")
    with open(path, "w") as f:
        json.dump({"experiment_name": experiment_name, "context": research_context}, f, indent=2)
    return path

def load_research_context(run_dir: str) -> str:
    path = os.path.join(run_dir, "research_context.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            data = json.load(f)
        return data.get("context", "")
    return ""