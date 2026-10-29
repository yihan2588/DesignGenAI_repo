import type { Option } from "@/lib/cowriter/contracts";
import { captionLayout } from "@/lib/cowriter/layout";
export function MemePreview({option,url}:{option:Option;url:string}){
 const l=captionLayout(option.caption,option.width,option.height);
 return <svg className="cw-meme" viewBox={`0 0 ${l.width} ${l.height}`} role="img" aria-label={`${option.alt.slice(0,220)}. Caption: ${option.caption}`}><title>{option.caption}</title><rect width={l.width} height={l.height} className="cw-meme-paper"/><image href={url} width={l.width} height={l.photoHeight} preserveAspectRatio="xMidYMid meet"/>{l.lines.map((line,i)=><text key={i} x={l.width/2} y={l.photoHeight+32+i*62+43} textAnchor="middle" fontSize={l.fontSize} className="cw-meme-caption">{line}</text>)}</svg>;
}
