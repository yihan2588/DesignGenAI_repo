"""Propose text-overlap pairs for manual audit; never infer joke quality."""
from __future__ import annotations

from collections import defaultdict
import re


def near_duplicate_pairs(rows, *, threshold=.85, min_words=8, length_ratio=.85):
    """Deterministic token-Jaccard flags, not automatic duplicate decisions.

    The inverted index avoids comparing pairs sharing no tokens. Requiring
    comparable lengths avoids flagging a short quotation inside a long story.
    Token overlap can miss paraphrases and flag distinct jokes on the same topic;
    reviewers must adjudicate the returned source IDs before quarantine.
    """
    if not 0 < threshold <= 1 or not 0 < length_ratio <= 1 or min_words < 1:
        raise ValueError('Invalid overlap audit settings.')
    by_id={row['id']:row for row in rows}
    if len(by_id)!=len(rows):raise ValueError('Duplicate source ID in overlap audit.')
    words={key:re.findall(r'\w+',row['text'].casefold()) for key,row in by_id.items()}
    tokens={key:set(value) for key,value in words.items() if len(value)>=min_words}
    inverted=defaultdict(list)
    for key in sorted(tokens):
        for token in tokens[key]:inverted[token].append(key)
    flags=[]
    # Count one row's overlaps at a time rather than retaining millions of pairs.
    for left in sorted(tokens):
        intersections=defaultdict(int)
        for token in tokens[left]:
            for right in inverted[token]:
                if right>left:intersections[right]+=1
        for right,intersection in sorted(intersections.items()):
            sizes=[len(words[left]),len(words[right])]
            if min(sizes)/max(sizes)<length_ratio:continue
            union=len(tokens[left])+len(tokens[right])-intersection
            score=intersection/union
            if score>=threshold:
                flags.append({'left':left,'right':right,'token_jaccard':round(score,6),
                              'word_counts':sizes,'requires_manual_adjudication':True})
    return flags
