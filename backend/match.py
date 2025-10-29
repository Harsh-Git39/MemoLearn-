#!/usr/bin/env python3
import sys
import json
import os
import re
from collections import Counter
from difflib import SequenceMatcher

# For semantic similarity
try:
    import numpy as np
    from scipy.spatial.distance import cosine
    HAS_SEMANTIC = True
except ImportError:
    HAS_SEMANTIC = False
    print("Warning: Install numpy and scipy for semantic similarity", file=sys.stderr)

def get_word_synonyms():
    """Built-in synonym dictionary for common words"""
    return {
        # Academic/Learning terms
        'learn': ['study', 'understand', 'master', 'grasp', 'acquire'],
        'difference': ['distinction', 'contrast', 'variation', 'gap', 'disparity'],
        'growth': ['development', 'progress', 'advancement', 'improvement', 'expansion'],
        'development': ['growth', 'progress', 'evolution', 'advancement', 'improvement'],
        'personal': ['individual', 'private', 'self', 'own', 'human'],
        
        # Question words
        'what': ['how', 'why', 'which', 'where'],
        'how': ['what', 'why', 'which', 'method'],
        'why': ['how', 'what', 'reason', 'cause'],
        
        # Programming terms
        'function': ['method', 'procedure', 'operation', 'routine'],
        'variable': ['parameter', 'value', 'data', 'element'],
        'algorithm': ['method', 'approach', 'technique', 'procedure'],
        'code': ['program', 'script', 'software', 'implementation'],
        
        # Common verbs
        'create': ['make', 'build', 'develop', 'generate', 'produce'],
        'use': ['utilize', 'employ', 'apply', 'implement'],
        'help': ['assist', 'support', 'aid', 'guide'],
        'find': ['locate', 'discover', 'identify', 'search'],
        
        # Technology terms
        'computer': ['machine', 'system', 'device', 'pc'],
        'program': ['software', 'application', 'app', 'code'],
        'data': ['information', 'details', 'facts', 'content'],
        'system': ['platform', 'framework', 'structure', 'setup'],
        
        # General terms
        'big': ['large', 'huge', 'massive', 'enormous'],
        'small': ['tiny', 'little', 'minor', 'compact'],
        'good': ['excellent', 'great', 'amazing', 'wonderful'],
        'bad': ['poor', 'terrible', 'awful', 'horrible'],
        'fast': ['quick', 'rapid', 'speedy', 'swift'],
        'slow': ['sluggish', 'gradual', 'delayed', 'lazy']
    }

def expand_with_synonyms(words):
    """Expand word list with synonyms for better matching"""
    synonyms_dict = get_word_synonyms()
    expanded = set(words)
    
    for word in words:
        if word in synonyms_dict:
            expanded.update(synonyms_dict[word])
        
        # Reverse lookup - find words that have this as a synonym
        for key, synonym_list in synonyms_dict.items():
            if word in synonym_list:
                expanded.add(key)
                expanded.update(synonym_list)
    
    return list(expanded)

def simple_word_embedding_similarity(word1, word2):
    """Simple character-based similarity for words"""
    if word1 == word2:
        return 1.0
    
    # Check if they're synonyms
    synonyms_dict = get_word_synonyms()
    if word1 in synonyms_dict and word2 in synonyms_dict[word1]:
        return 0.8
    if word2 in synonyms_dict and word1 in synonyms_dict[word2]:
        return 0.8
    
    # Character-level similarity
    return SequenceMatcher(None, word1, word2).ratio()

def calculate_semantic_similarity(query1, query2):
    """Enhanced similarity with semantic understanding"""
    
    # Clean queries
    clean1 = clean_query_advanced(query1)
    clean2 = clean_query_advanced(query2)
    
    words1 = clean1.split()
    words2 = clean2.split()
    
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    
    # Method 1: Synonym-Enhanced Jaccard
    expanded_words1 = expand_with_synonyms(words1)
    expanded_words2 = expand_with_synonyms(words2)
    
    set1 = set(expanded_words1)
    set2 = set(expanded_words2)
    
    intersection = set1.intersection(set2)
    union = set1.union(set2)
    
    jaccard_semantic = len(intersection) / len(union) if union else 0.0
    
    # Method 2: Word-to-Word Semantic Matching
    total_similarity = 0.0
    comparisons = 0
    
    for w1 in words1:
        best_match = 0.0
        for w2 in words2:
            similarity = simple_word_embedding_similarity(w1, w2)
            best_match = max(best_match, similarity)
        total_similarity += best_match
        comparisons += 1
    
    # Reverse direction
    for w2 in words2:
        best_match = 0.0
        for w1 in words1:
            similarity = simple_word_embedding_similarity(w1, w2)
            best_match = max(best_match, similarity)
        total_similarity += best_match
        comparisons += 1
    
    word_semantic_score = total_similarity / comparisons if comparisons > 0 else 0.0
    
    # Method 3: Intent Detection
    # Check for question patterns
    question_words1 = set(['what', 'how', 'why', 'when', 'where', 'which']) & set(words1)
    question_words2 = set(['what', 'how', 'why', 'when', 'where', 'which']) & set(words2)
    
    intent_bonus = 0.0
    if question_words1 and question_words2:
        # Both are questions
        intent_bonus = 0.2
    elif not question_words1 and not question_words2:
        # Both are statements
        intent_bonus = 0.1
    
    # Method 4: Core Concept Extraction
    # Focus on important nouns and verbs (longer words)
    important_words1 = [w for w in words1 if len(w) > 3]
    important_words2 = [w for w in words2 if len(w) > 3]
    
    if important_words1 and important_words2:
        important_similarity = 0.0
        for w1 in important_words1:
            for w2 in important_words2:
                important_similarity += simple_word_embedding_similarity(w1, w2)
        important_similarity = important_similarity / (len(important_words1) * len(important_words2))
    else:
        important_similarity = 0.0
    
    # Combined score with weights
    final_score = (
        jaccard_semantic * 0.30 +        # Synonym-enhanced overlap
        word_semantic_score * 0.35 +     # Word-level semantic matching
        important_similarity * 0.25 +    # Important words matching
        intent_bonus * 0.10              # Intent bonus
    )
    
    return min(final_score, 1.0)  # Cap at 1.0

def clean_query_advanced(query):
    """Advanced query cleaning with semantic preservation"""
    # Convert to lowercase
    query = query.lower()
    
    # Remove punctuation but preserve structure
    query = re.sub(r'[^\w\s]', ' ', query)
    query = re.sub(r'\s+', ' ', query).strip()
    
    # Remove stop words but keep question words and important connectors
    stop_words = {'is', 'are', 'was', 'were', 'a', 'an', 'the', 'in', 'on', 'at', 
                  'to', 'for', 'of', 'with', 'by', 'tell', 'me', 'you', 'it', 'this', 'that'}
    
    # Keep question words and important semantic indicators
    keep_words = {'what', 'how', 'why', 'when', 'where', 'which', 'between', 'and', 'or'}
    
    words = []
    for word in query.split():
        if len(word) > 1 and (word not in stop_words or word in keep_words):
            words.append(word)
    
    return ' '.join(words)

def find_similar_queries_semantic(input_query, threshold=0.5, max_results=5):
    """Find similar queries using semantic similarity"""
    
    saved_queries = load_saved_queries()
    similarities = []
    
    for item in saved_queries:
        query = item.get('query', '')
        answer = item.get('answer', '')
        item_id = item.get('id', '')
        
        if not query:
            continue
        
        # Calculate semantic similarity
        similarity = calculate_semantic_similarity(input_query, query)
        
        if similarity >= threshold:
            similarities.append({
                'id': item_id,
                'query': query,
                'answer': answer,
                'similarity': round(similarity, 3),
                'pinnedAt': item.get('pinnedAt', ''),
                'matchType': 'semantic',
                'debug': {
                    'cleaned_input': clean_query_advanced(input_query),
                    'cleaned_saved': clean_query_advanced(query)
                }
            })
    
    # Sort by similarity (highest first)
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    
    return similarities[:max_results]

def load_saved_queries():
    """Load saved queries from JSON file"""
    data_file = 'pinned-memolearn.json'
    
    if not os.path.exists(data_file):
        return []
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def main():
    """Main function called from Node.js"""
    
    if len(sys.argv) != 2:
        print(json.dumps({
            "error": "Usage: python match.py <query>",
            "matches": []
        }))
        sys.exit(1)
    
    input_query = sys.argv[1]
    
    try:
        # Find similar queries using semantic matching
        matches = find_similar_queries_semantic(input_query)
        
        # Output as JSON for Node.js
        print(json.dumps(matches, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "error": f"Error processing query: {str(e)}",
            "matches": []
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
