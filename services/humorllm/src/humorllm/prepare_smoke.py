"""Build a private, training-only smoke manifest, quarantining undecodable assets."""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,UnidentifiedImageError
from .annotations import read_jsonl,write_jsonl


def prepare(source: Path,output: Path):
    output.mkdir(parents=True,exist_ok=True)
    splits={s:{str(r['contest_number']) for r in read_jsonl(source/'humorbench/gpt4o_description'/(s+'.jsonl'))}
            for s in ['train','validation','test']}
    assert not splits['train']&splits['test'] and not splits['train']&splits['validation'] and not splits['test']&splits['validation']
    assets=[];quarantine=[]
    for dataset in ['humorbench','electronic_sheep']:
        for path in sorted((source/dataset/'cartoons').iterdir()):
            if path.suffix.lower() not in {'.jpg','.jpeg','.png'}:continue
            sha=hashlib.sha256(path.read_bytes()).hexdigest()
            try:
                with Image.open(path) as image:
                    image.load();width,height=image.size
                    pixels=list(ImageOps.grayscale(image).resize((9,8)).get_flattened_data());bits=0
                    for y in range(8):
                        for x in range(8):bits=(bits<<1)|int(pixels[y*9+x]>pixels[y*9+x+1])
            except (UnidentifiedImageError,OSError,Image.DecompressionBombError):
                quarantine.append({'source':dataset,'contest_id':path.stem,'sha256':sha,'reason':'image_decode_failure'});continue
            split=next((s for s,ids in splits.items() if path.stem in ids),'unassigned')
            assets.append({'source':dataset,'contest_id':path.stem,'path':str(path),'sha256':sha,
                           'dhash64':f'{bits:016x}','width':width,'height':height,'official_humorbench_split':split})
    parent=list(range(len(assets)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for i,a in enumerate(assets):
        for j,b in enumerate(assets[:i]):
            if (a['contest_id']==b['contest_id'] or a['sha256']==b['sha256'] or
                    (int(a['dhash64'],16)^int(b['dhash64'],16)).bit_count()<=4):parent[find(i)]=find(j)
    groups=defaultdict(list)
    for i in range(len(assets)):groups[find(i)].append(i)
    for group in groups.values():
        cluster='cluster-'+hashlib.sha256('|'.join(sorted(assets[i]['source']+':'+assets[i]['contest_id'] for i in group)).encode()).hexdigest()[:12]
        held=any(assets[i]['official_humorbench_split'] in {'validation','test'} for i in group)
        for i in group:assets[i].update({'cluster':cluster,'contains_validation_or_test':held})
    eligible=[a for a in assets if a['source']=='humorbench' and a['official_humorbench_split']=='train' and not a['contains_validation_or_test']]
    eligible.sort(key=lambda a:hashlib.sha256(('technical-smoke-v1:'+a['contest_id']).encode()).hexdigest())
    chosen=[];seen=set()
    for a in eligible:
        if a['cluster'] in seen:continue
        chosen.append(a);seen.add(a['cluster'])
        if len(chosen)==10:break
    if len(chosen)!=10:raise ValueError('Not enough decodable split-safe training clusters.')
    cases=[{'id':'hb-'+a['contest_id'],'path':a['path'],'sha256':a['sha256'],'cluster':a['cluster'],
            'split':'training_development','source':'HOMER-provided Humorbench image; private technical test only; display rights not established'} for a in chosen]
    write_jsonl(output/'benchmark-assets.jsonl',assets);write_jsonl(output/'quarantined-assets.jsonl',quarantine)
    write_jsonl(output/'smoke-10.jsonl',cases)
    receipt={'decoded_assets':len(assets),'quarantined_assets':quarantine,'clusters':len(groups),'selected':10,
             'selected_cross_split_clusters':0,'eligible_train_assets':len(eligible),
             'method':'Union same contest IDs, exact SHA256 or grayscale 64-bit dHash Hamming distance <=4. Heuristic only; not exhaustive visual deduplication.',
             'heldout_generation_performed':False,'rights':'Private technical evaluation only; no asset redistribution or public feed import.'}
    (output/'manifest-audit.json').write_text(json.dumps(receipt,indent=2)+'\n')
    canvas=Image.new('RGB',(1000,750),'white');draw=ImageDraw.Draw(canvas)
    for i,a in enumerate(chosen):
        with Image.open(a['path']) as image:
            thumb=ImageOps.contain(image.convert('RGB'),(196,340));x=(i%5)*200;y=(i//5)*375
            canvas.paste(thumb,(x,y+25));draw.text((x+5,y+5),a['contest_id'],fill='black')
    canvas.save(output/'smoke-contact-sheet.jpg')
    return cases,receipt


def main():
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();cases,receipt=prepare(a.source,a.output)
    write_jsonl(Path('services/humorllm/manifests/smoke-10-v1.jsonl'),[{k:v for k,v in c.items() if k!='path'} for c in cases])
    print(json.dumps(receipt,indent=2))


if __name__=='__main__':main()
