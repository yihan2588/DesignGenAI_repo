import {boundedBody,failure,json} from '@/lib/cowriter/server';
import {postInput} from '@/lib/gallery/contracts';
import {remix} from '@/lib/gallery/server';
export const runtime='nodejs';
export async function POST(request:Request){try{const p=postInput.parse(JSON.parse((await boundedBody(request)).toString()));return json(await remix(request,p.id));}catch(e){return failure(e);}}
