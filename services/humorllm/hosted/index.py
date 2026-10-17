"""Private HTTP adapter; Supabase retains all durable generation state."""
import json
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from humorllm.hosted import HostedWorker

ROOT=Path(__file__).resolve().parent
worker=HostedWorker(ROOT/'private_index',ROOT/'encoder')
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware('http')
async def authorize(request:Request,call_next):
    if not worker.authorized(request.headers.get('x-humor-worker-key')):
        return JSONResponse({'error':'Unauthorized'},status_code=401)
    response=await call_next(request)
    response.headers['Cache-Control']='no-store'
    return response

@app.get('/health')
def health():
    try:
        local=worker.local_retriever()
        return {'status':'ready','sources':len(local.rows)}
    except Exception as failure:
        print(json.dumps({'event':'worker_health_failed','error_type':type(failure).__name__}),flush=True)
        return JSONResponse({'error':'Worker unavailable'},status_code=503)

@app.post('/work')
async def work(request:Request):
    try:
        raw=bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw)>=1024:return JSONResponse({'error':'Invalid request'},status_code=400)
        data=json.loads(raw)
        if not isinstance(data,dict) or set(data)!={'run_id'}:
            return JSONResponse({'error':'Invalid request'},status_code=400)
        result,status=await run_in_threadpool(worker.run,data['run_id'])
        print(json.dumps({'event':'worker_result','run_id':data['run_id'],'status':result['status']}),flush=True)
        return JSONResponse(result,status_code=status)
    except (ValueError,TypeError,AttributeError):
        return JSONResponse({'error':'Invalid request or configuration'},status_code=400)
    except Exception as failure:
        print(json.dumps({'event':'worker_interrupted','error_type':type(failure).__name__}),flush=True)
        return JSONResponse({'error':'Worker interrupted; durable delivery will retry'},status_code=503)
