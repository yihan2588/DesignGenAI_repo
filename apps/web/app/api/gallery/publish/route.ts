import {boundedBody,failure,json} from '@/lib/cowriter/server';
import {publishInput} from '@/lib/gallery/contracts';
import {publish} from '@/lib/gallery/server';
export const runtime='nodejs';
export async function POST(request:Request){try{return json(await publish(request,publishInput.parse(JSON.parse((await boundedBody(request)).toString()))));}catch(e){return failure(e);}}
