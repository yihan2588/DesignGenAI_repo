import {z} from 'zod';
export const galleryQuery=z.object({filter:z.enum(['latest','featured','mine','saved']).default('latest'),page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(160).default(''),id:z.uuid().optional()});
export const publishInput=z.object({sessionId:z.uuid(),revision:z.number().int().min(1),optionId:z.uuid(),authorName:z.string().trim().min(1).max(40)});
export const postInput=z.object({id:z.uuid()});
export const galleryAction=z.object({id:z.uuid(),action:z.enum(['like','save','report','unpublish','republish']),value:z.boolean().optional(),reason:z.string().trim().min(5).max(500).optional()}).superRefine((v,c)=>{
 if(['like','save'].includes(v.action)&&v.value===undefined)c.addIssue({code:'custom',message:'Choose whether to keep this reaction.'});
 if(v.action==='report'&&!v.reason)c.addIssue({code:'custom',message:'Tell us why this meme should be reviewed.'});
});
