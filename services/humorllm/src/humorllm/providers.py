"""Stateless Gemini REST adapter; bounded calls, sanitized failures, recorded usage."""
from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import os
from pathlib import Path
import time
from urllib import request, error

from .store import Ledger

MODEL = 'gemini-3.8-flash'
RATES = {
    'gemini-3.1-flash-lite':{'input_per_million':0.25,'output_and_thought_per_million':1.50},
    'gemini-3.8-flash':{'input_per_million':0.75,'output_and_thought_per_million':3.75},
}
PRICING_SOURCE={'source':'https://ai.google.dev/gemini-api/docs/pricing','checked':'2026-10-16'}


def provider_schema(response_model):
    """Keep the wire grammar simple; enforce all bounds with Pydantic after decoding.

    Gemini supports a schema subset and can reject combinatorial bounded nested arrays.
    Types, references, required fields and closed objects remain on the wire. Bounds
    stay visible as descriptive instructions without expanding the wire grammar.
    The full response_model remains the validation authority.
    """
    def simplify(value):
        if isinstance(value,list):return [simplify(v) for v in value]
        if not isinstance(value,dict):return value
        result={k:simplify(v) for k,v in value.items()
                if k not in {'minItems','maxItems','minLength','maxLength','pattern'}}
        limits=[]
        if 'minItems' in value and value.get('minItems')==value.get('maxItems'):
            limits.append(f"exactly {value['minItems']} items")
        else:
            if 'minItems' in value:limits.append(f"at least {value['minItems']} items")
            if 'maxItems' in value:limits.append(f"at most {value['maxItems']} items")
        if 'minLength' in value:limits.append(f"at least {value['minLength']} characters")
        if 'maxLength' in value:limits.append(f"at most {value['maxLength']} characters")
        if 'pattern' in value:limits.append('match pattern '+value['pattern'])
        if limits:result['description']=(result.get('description','')+' Output limits: '+', '.join(limits)+'.').strip()
        return result
    return simplify(response_model.model_json_schema())


def load_environment(path: Path):
    if not path.exists():return
    for line in path.read_text().splitlines():
        if line.lstrip().startswith('#') or '=' not in line:continue
        key,value = line.split('=',1);key = key.strip()
        if key in {'GEMINI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','HUMOR_WORKER_KEY'}:
            os.environ.setdefault(key,value.strip().strip('"').strip("'"))


@dataclass
class ProviderFailure(Exception):
    category: str
    http_status: int | None = None
    def __str__(self):return 'Gemini request failed: '+self.category


class Gemini:
    def __init__(self,key: str,ledger: Ledger,*,model: str = MODEL,transport=None):
        if not key:raise ValueError('GEMINI_API_KEY is required.')
        if model not in RATES:raise ValueError('Unpriced model: qualify and register its exact rates before use.')
        # Flash's listed rates increase in 2027. Fail closed until pricing is reviewed again.
        if model=='gemini-3.8-flash':
            from datetime import datetime,timezone
            if datetime.now(timezone.utc).year>=2027:raise ValueError('Gemini Flash rates need review for 2027.')
        self.key,self.ledger,self.model,self.transport = key,ledger,model,transport

    def _request(self,body,timeout_seconds):
        req = request.Request('https://generativelanguage.googleapis.com/v1beta/interactions',
                              data=json.dumps(body).encode(),method='POST',
                              headers={'Content-Type':'application/json','x-goog-api-key':self.key})
        try:
            with request.urlopen(req,timeout=timeout_seconds) as response:return json.load(response)
        except error.HTTPError as failure:
            # Provider messages may contain credentials/request echoes; do not log their bodies.
            category = 'quota' if failure.code==429 else 'configuration' if failure.code<500 else 'unavailable'
            raise ProviderFailure(category,failure.code) from None
        except (error.URLError,TimeoutError,OSError):raise ProviderFailure('network_or_timeout') from None

    def call(self,stage: str,prompt: str,response_model,*,image: bytes | None = None,max_output_tokens=None,timeout_seconds=45):
        if len(prompt.encode())>48000 or (image is not None and len(image)>2*1024*1024):
            raise ValueError('Provider payload exceeds bounded request size.')
        reasoning=stage in {'conflicts','merge_paths','source_review','candidates','judge','fallback_candidates','fallback_judge'}
        request_model=('gemini-3.1-flash-lite' if self.model==MODEL and stage in
                       {'scene','conflicts','associations_image'} else self.model)
        # The provider's limit includes thinking. Leave space for bounded JSON after reasoning;
        # the old 4096 ceiling can exhaust itself before the source review emits its object.
        if max_output_tokens is None:max_output_tokens=8192 if reasoning else 4096
        if not 1<=max_output_tokens<=8192:raise ValueError('Invalid output token limit.')
        schema = provider_schema(response_model)
        if len(json.dumps(schema))>16000:raise ValueError('Response schema too large.')
        body = {'model':request_model,'store':False,'input':[{'type':'text','text':prompt}],
                'generation_config':{'max_output_tokens':max_output_tokens,'temperature':1},
                'response_format':{'type':'text','mime_type':'application/json','schema':schema}}
        # Explicit medium effort leaves room for the structured result; high can consume even
        # 8192 tokens on shortlist deliberation. Keep the independent baseline unchanged.
        if reasoning:
            body['generation_config']['thinking_level']='medium'
        if image is not None:body['input'].append({'type':'image','data':base64.b64encode(image).decode(),'mime_type':'image/jpeg'})
        token = self.ledger.reserve(0.10,stage);started = time.monotonic()
        pricing={**RATES[request_model],**PRICING_SOURCE}
        step = {'stage':stage,'model':request_model,'reservation':token,'reservation_usd':0.10,
                'prompt':prompt,'schema':response_model.__name__,'pricing':pricing,
                'generation_config':body['generation_config']}
        try:
            result = self.transport(body) if self.transport else self._request(body,max(1,min(90 if request_model==MODEL else 45,timeout_seconds)))
            usage = result.get('usage',{})
            fields = ['total_input_tokens','total_output_tokens','total_thought_tokens']
            cost = None
            if all(type(usage.get(k)) is int and usage[k]>=0 for k in fields):
                cost = (usage[fields[0]]*pricing['input_per_million']+
                        (usage[fields[1]]+usage[fields[2]])*pricing['output_and_thought_per_million'])/1e6
            self.ledger.settle(token,cost)
            step.update({'usage':usage,'estimated_cost_usd':cost})
            if result.get('status') != 'completed':raise ProviderFailure('incomplete')
            raw = ''.join(c.get('text','') for s in result.get('steps',[]) if s.get('type')=='model_output'
                          for c in s.get('content',[]) if c.get('type')=='text')
            step['raw_output'] = raw.replace(self.key,'[redacted]')[:16000]
            value = response_model.model_validate_json(raw)
            step['output'] = value.model_dump(mode='json')
            return value,step
        except Exception as failure:
            step['error'] = failure.category if isinstance(failure,ProviderFailure) else 'invalid_output_or_budget'
            failure.step = step
            raise
        finally:step['elapsed_ms'] = round((time.monotonic()-started)*1000)
