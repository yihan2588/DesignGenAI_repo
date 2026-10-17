"""Bounded multi-view paths and retrieval-backed branches (product adaptation)."""
from collections import Counter
import json
import numpy as np
from .retrieval import balanced_pool
from .schemas import AssociationSet, Scene, ConflictSet, validate_links


def build_graph(scene: Scene,conflicts: ConflictSet,image_view: AssociationSet,description_view: AssociationSet,retriever,method: str):
    for view in [image_view,description_view]:validate_links(scene,conflicts,view)
    paths=[];seen=set()
    # Alternate independent views. Preserve actual chain order; never splice unrelated node lists.
    for i in range(2):
        for label,view in [('image',image_view),('description',description_view)]:
            if i>=len(view.paths):continue
            path=view.paths[i];key=(path.root_detail_id,path.root_entity.casefold(),tuple(n.entity.casefold() for n in path.nodes))
            if key in seen or len(paths)>=2:continue
            seen.add(key)
            paths.append({**path.model_dump(),'id':'p'+str(len(paths)+1),'origin':label,'source_ids':[],
                          'nodes':[{**n.model_dump(),'origin':label,'source_ids':[]} for n in path.nodes]})
    queries=[]
    for p in paths:
        for depth,entity in enumerate([p['root_entity']]+[n['entity'] for n in p['nodes']]):
            conflict=next(c for c in conflicts.conflicts if c.id==p['conflict_id'])
            relation=(p['nodes'][depth-1].get('retrieval_query') or p['nodes'][depth-1]['relation']) if depth else conflict.interpretation
            anchor=next(d.observation for d in scene.details if d.id==p['root_detail_id'])
            queries.append({'path_id':p['id'],'depth':depth,'entity':entity,
                            'text':(scene.description if depth==0 else anchor)+' '+relation+' '+entity,
                            'mechanism':conflict.expectation+' '+relation if depth==0 else relation,
                            'relation_query':relation,'visible_anchor':anchor})
    assert len(queries)<=8
    query_vectors=retriever.encoder.encode([q['text']+(' '+q['mechanism'] if method=='full_dense' else '') for q in queries],batch_size=8)
    # A separate mechanism field uses the same bounded encoder, in batches of at most eight.
    mechanism_vectors=retriever.encoder.encode([q['mechanism'] for q in queries],batch_size=8)
    results=[];global_scores=Counter()
    for q,v,mv in zip(queries,query_vectors,mechanism_vectors):
        hits=retriever.search(q['text'],mechanism=q['mechanism'],entity=q['entity'],method=method,limit=20 if method=='balanced' else 5,
                              query_vector=v,mechanism_vector=mv)
        results.append({**q,'hits':hits})
        for h in hits:global_scores[h['id']]+=1/(50+h['rank'])
    retained=(balanced_pool([[h['id'] for h in query['hits']] for query in results],20) if method=='balanced'
              else sorted(global_scores,key=lambda key:(-global_scores[key],key))[:20])
    retained_set=set(retained)
    branches=[]
    for p in paths:
        pool={}
        for query in results:
            if query['path_id']!=p['id'] or query['depth']>=3:continue
            for h in query['hits']:
                if h['id'] not in retained_set:continue
                for entity in retriever.by_id[h['id']]['annotation']['entities']:
                    if entity.casefold() in {p['root_entity'].casefold(),*(n['entity'].casefold() for n in p['nodes'])}:continue
                    item=pool.setdefault(entity.casefold(),{'entity':entity,'source_ids':set(),'depth':query['depth']})
                    item['source_ids'].add(h['id']);item['depth']=min(item['depth'],query['depth'])
        if not pool:continue
        items=sorted(pool.values(),key=lambda x:x['entity'].casefold())
        embeddings=retriever.encoder.encode([p['root_entity']]+[x['entity'] for x in items],batch_size=8)
        for i,item in enumerate(items,1):
            item['score']=float(embeddings[0]@embeddings[i])+len(item['source_ids'])/max(1,len(retained))
        # Broad retrieval branches stay within the same three-hop bound, five additions per target.
        for item in sorted(items,key=lambda x:(-x['score'],x['entity'].casefold()))[:5]:
            prefix=p['nodes'][:item['depth']]
            sources=sorted(item['source_ids'])
            branches.append({**p,'id':'r'+str(len(branches)+1),'origin':'retrieval','source_ids':sources,
                'nodes':prefix+[{'entity':item['entity'],'relation':'Co-occurs in retrieved joke; proposed association, not visual evidence.',
                                  'origin':'retrieval','source_ids':sources}],
                'pruning':{'score':item['score'],'method':'embedding_relatedness_plus_document_frequency_product_adaptation'}})
    graph={'paths':paths+branches,'queries':results,'source_ids':retained,'excluded_by_distinct_source_cap':sorted(set(global_scores)-retained_set),
           'bounds':{'targets':2,'hops':3,'queries':8,'jokes_per_query':20 if method=='balanced' else 5,'distinct_jokes':20,'retrieved_branches_per_target':5},
           'mode':'product_sequential_backbone_with_retrieved_branches'}
    assert all(len(p['nodes'])<=3 and set(p['source_ids'])<=retained_set for p in graph['paths'])
    return graph


def demonstrations(ids,retriever,byte_budget=1500):
    """UTF-8 byte bound is a conservative upper bound on the 1500-token text budget."""
    chosen=[];used=0
    for key in ids:
        r=retriever.by_id[key];a=r['annotation']
        # The plan already carries setup, turn and mapping. Avoid repeating broad annotations
        # that both consume the small context budget and invite topic-only imitation.
        demo={'id':key,'joke':r['text'],'transferability':a['transferability']}
        if r.get('transfer_test'):
            demo['required_conditions']=r['transfer_test']['required_conditions']
        cost=len(json.dumps(demo,ensure_ascii=False,separators=(',',':')).encode())+1
        if used+cost>byte_budget:continue
        chosen.append(demo);used+=cost
    return chosen,used
