"use server";
export type UploadState={error?:string;photoId?:number};
export async function uploadFoodPhoto(_previous:UploadState,_form:FormData):Promise<UploadState>{void _previous;void _form;return {error:'This earlier gallery is archived. Upload your picture in Funny Lab.'};}
