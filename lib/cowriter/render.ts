import sharp from "sharp";
import { create, type Font } from "fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { captionLayout } from "./layout.ts";
let fontPromise: Promise<Font>|undefined;
function captionFont(){return fontPromise??=(readFile(path.join(process.cwd(),"public/fonts/chillax-semibold.woff2")).then(data=>create(data) as Font));}
export async function renderMeme(image:Buffer,caption:string){
 const [metadata,font]=await Promise.all([sharp(image).metadata(),captionFont()]);
 const layout=captionLayout(caption,metadata.width??960,metadata.height??720);
 const picture=await sharp(image).resize(layout.width,layout.photoHeight,{fit:"contain",background:"#faf8ee"}).jpeg({quality:90}).toBuffer();
 const scale=layout.fontSize/font.unitsPerEm;
 const paths=layout.lines.map((line,i)=>{
  const run=font.layout(line);const width=run.positions.reduce((s,p)=>s+p.xAdvance,0)*scale;
  let x=(layout.width-width)/2;const baseline=layout.photoHeight+32+i*62+43;
  return run.glyphs.map((glyph,j)=>{const p=run.positions[j];const d=glyph.path.toSVG();const result=`<path transform="translate(${x+p.xOffset*scale} ${baseline-p.yOffset*scale}) scale(${scale} ${-scale})" d="${d}"/>`;x+=p.xAdvance*scale;return result;}).join("");
 }).join("");
 const lettering=Buffer.from(`<svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg"><g fill="#14171c">${paths}</g></svg>`);
 return sharp({create:{width:layout.width,height:layout.height,channels:4,background:"#faf8ee"}}).composite([{input:picture,top:0,left:0},{input:lettering,top:0,left:0}]).png().toBuffer();
}
