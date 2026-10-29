import widths from "./font-widths.json" with { type: "json" };
const advances=widths as Record<string,number>;
const measure=(text:string,size:number)=>Array.from(text).reduce((n,c)=>n+(advances[c]??.7)*size,0);
export function captionLayout(caption:string,imageWidth:number,imageHeight:number,fontSize=48){
  const width=960, photoHeight=Math.max(150,Math.min(900,Math.round(width*imageHeight/Math.max(1,imageWidth))));
  const max=width-96, lines:string[]=[];let line="";
  for(const word of caption.split(/\s+/u)){
    if(measure(word,fontSize)>max){
      if(line){lines.push(line);line="";}
      for(const char of Array.from(word)){if(measure(line+char,fontSize)>max){lines.push(line);line="";}line+=char;}
    }else if(line && measure(line+" "+word,fontSize)>max){lines.push(line);line=word;}
    else line+=(line?" ":"")+word;
  }
  if(line)lines.push(line);
  const bandHeight=64+lines.length*62;
  return {width,photoHeight,fontSize,lines,bandHeight,height:photoHeight+bandHeight};
}
export function escapeXml(text:string){return text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));}

// Gallery thumbnails reserve the same photo and caption areas for every aspect ratio.
export function galleryLayout(caption:string){
  let layout=captionLayout(caption,960,720);
  for(let size=46;layout.lines.length>4 && size>=16;size-=2)layout=captionLayout(caption,960,720,size);
  return {...layout,bandHeight:320,height:1040};
}
